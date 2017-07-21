/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  IFRAME_TRANSPORT_EVENT_MESSAGES_TYPE,
} from '../../../../src/3p-analytics-common';
import {
  AmpAnalytics3pMessageRouter,
  AmpAnalytics3pCreativeMessageRouter,
} from '../../../../3p/ampanalytics-lib';
import {dev, user} from '../../../../src/log';
import {Timer} from '../../../../src/service/timer-impl';
import {adopt} from '../../../../src/runtime';
import * as sinon from 'sinon';

adopt(window);

/**
 * @const {number}
 * Testing postMessage necessarily involves race conditions. Set this high
 * enough to avoid flakiness.
 */
const POST_MESSAGE_DELAY = 100;

let nextId = 5000;
function createUniqueId() {
  return String(++(nextId));
}

describe('ampanalytics-lib', () => {
  let sandbox;
  const timer = new Timer(window);
  let badAssertsCounterStub;
  let router;
  let sentinel;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    badAssertsCounterStub = sandbox.stub();
    sentinel = createUniqueId();
    window.name = '{"sentinel": "' + sentinel + '"}';
    sandbox.stub(AmpAnalytics3pMessageRouter.prototype, 'subscribeTo');
    router = new AmpAnalytics3pMessageRouter(window);
    sandbox.stub(dev(), 'assert', (condition, msg) => {
      if (!condition) {
        badAssertsCounterStub(msg);
      }
    });
    sandbox.stub(user(), 'assert', (condition, msg) => {
      if (!condition) {
        badAssertsCounterStub(msg);
      }
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  /**
   * Sends a message from the current window to itself
   * @param {string} type Type of the message.
   * @param {!JsonObject} object Message payload.
   */
  function send(type, data) {
    const object = {};
    object['type'] = type;
    object['sentinel'] = sentinel;
    if (data['events']) {
      object['events'] = data['events'];
    } else {
      object['data'] = data;
    }
    const payload = 'amp-' + JSON.stringify(object);
    window./*OK*/postMessage(payload, '*');
  }

  it('fails to create router if no window.name ', () => {
    const oldWindowName = window.name;
    expect(() => {
      window.name = '';
      new AmpAnalytics3pMessageRouter(window);
    }).to.throw(/Cannot read property 'sentinel' of undefined/);
    window.name = oldWindowName;
  });

  it('sets sentinel from window.name.sentinel ', () => {
    expect(router.getSentinel()).to.equal(sentinel);
  });

  it('initially has empty creativeMessageRouters mapping ', () => {
    expect(Object.keys(router.getCreativeMethodRouters())).to.have.lengthOf(0);
  });

  it('makes registration function available ', () => {
    window.onNewAmpAnalyticsInstance = ampAnalytics => {
      expect(ampAnalytics.registerAmpAnalytics3pEventsListener).to.exist;
      ampAnalytics.registerAmpAnalytics3pEventsListener(() => {});
    };
    send(IFRAME_TRANSPORT_EVENT_MESSAGES_TYPE, /** @type {!JsonObject} */ ({
      events: [
        {transportId: '100', message: 'hello, world!'},
      ]}));
  });

  it('receives an event message ', () => {
    window.onNewAmpAnalyticsInstance = ampAnalytics => {
      expect(ampAnalytics instanceof AmpAnalytics3pCreativeMessageRouter)
          .to.be.true;
      expect(Object.keys(router.getCreativeMethodRouters()))
          .to.have.lengthOf(1);
      ampAnalytics.registerAmpAnalytics3pEventsListener(events => {
        expect(events).to.have.lengthOf(1);
        events.forEach(event => {
          expect(ampAnalytics.getTransportId()).to.equal('101');
          expect(event).to.equal('hello, world!');
        });
      });
    };
    send(IFRAME_TRANSPORT_EVENT_MESSAGES_TYPE, /** @type {!JsonObject} */ ({
      events: [
        {transportId: '101', message: 'hello, world!'},
      ]}));
  });

  it('asserts when onNewAmpAnalyticsInstance is not implemented ', () => {
    window.onNewAmpAnalyticsInstance = null;
    send(IFRAME_TRANSPORT_EVENT_MESSAGES_TYPE, /** @type {!JsonObject} */ ({
      events: [
        {transportId: '102', message: 'hello, world!'},
      ]}));
    return timer.promise(POST_MESSAGE_DELAY).then(() => {
      expect(badAssertsCounterStub.callCount > 0).to.be.true;
      expect(badAssertsCounterStub.calledWith(
          sinon.match(/Must implement onNewAmpAnalyticsInstance/))).to.be.true;
      return Promise.resolve();
    });
  });

  it('receives multiple event messages ', () => {
    window.onNewAmpAnalyticsInstance = ampAnalytics => {
      expect(ampAnalytics instanceof AmpAnalytics3pCreativeMessageRouter)
          .to.be.true;
      expect(Object.keys(router.getCreativeMethodRouters()))
          .to.have.lengthOf(1);
      ampAnalytics.registerAmpAnalytics3pEventsListener(events => {
        expect(events).to.have.lengthOf(3);
        events.forEach(() => {
          expect(ampAnalytics.getTransportId()).to.equal('103');
        });
        expect(events[0]).to.equal('something happened');
        expect(events[1]).to.equal('something else happened');
        expect(events[2]).to.equal('a third thing happened');
      });
    };
    send(IFRAME_TRANSPORT_EVENT_MESSAGES_TYPE, /** @type {!JsonObject} */ ({
      events: [
        {transportId: '103', message: 'something happened'},
        {transportId: '103', message: 'something else happened'},
        {transportId: '103', message: 'a third thing happened'},
      ]}));
  });
});
