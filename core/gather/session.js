/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import EventEmitter from 'events';

import log from 'lighthouse-logger';

import {LighthouseError} from '../lib/lh-error.js';

// Controls how long to wait for a response after sending a DevTools protocol command.
const DEFAULT_PROTOCOL_TIMEOUT = 30000;
const PPTR_BUFFER = 50;

/**
 * Puppeteer timeouts must fit into an int32 and the maximum timeout for `setTimeout` is a *signed*
 * int32. However, this also needs to account for the puppeteer buffer we add to the timeout later.
 *
 * So this is defined as the max *signed* int32 minus PPTR_BUFFER.
 *
 * In human terms, this timeout is ~25 days which is as good as infinity for all practical purposes.
 */
const MAX_TIMEOUT = 2147483647 - PPTR_BUFFER;

/** @typedef {LH.Protocol.StrictEventEmitterClass<LH.CrdpEvents>} CrdpEventMessageEmitter */
const CrdpEventEmitter = /** @type {CrdpEventMessageEmitter} */ (EventEmitter);

/** @implements {LH.Gatherer.ProtocolSession} */
class ProtocolSession extends CrdpEventEmitter {
  /**
   * @param {LH.Puppeteer.CDPSession} cdpSession
   */
  constructor(cdpSession) {
    super();

    this._cdpSession = cdpSession;
    /** @type {LH.Crdp.Target.TargetInfo|undefined} */
    this._targetInfo = undefined;
    /** @type {number|undefined} */
    this._nextProtocolTimeout = undefined;

    this._handleProtocolEvent = this._handleProtocolEvent.bind(this);
    // @ts-expect-error Puppeteer expects the handler params to be type `unknown`
    this._cdpSession.on('*', this._handleProtocolEvent);
  }

  id() {
    return this._cdpSession.id();
  }

  /**
   * Re-emit protocol events from the underlying CDPSession.
   * @template {keyof LH.CrdpEvents} E
   * @param {E} method
   * @param {LH.CrdpEvents[E]} params
   */
  _handleProtocolEvent(method, ...params) {
    this.emit(method, ...params);
  }

  /** @param {LH.Crdp.Target.TargetInfo} targetInfo */
  setTargetInfo(targetInfo) {
    this._targetInfo = targetInfo;
  }

  /**
   * @return {boolean}
   */
  hasNextProtocolTimeout() {
    return this._nextProtocolTimeout !== undefined;
  }

  /**
   * @return {number}
   */
  getNextProtocolTimeout() {
    return this._nextProtocolTimeout || DEFAULT_PROTOCOL_TIMEOUT;
  }

  /**
   * @param {number} ms
   */
  setNextProtocolTimeout(ms) {
    if (ms > MAX_TIMEOUT) ms = MAX_TIMEOUT;
    this._nextProtocolTimeout = ms;
  }

  /**
   * @template {keyof LH.CrdpCommands} C
   * @param {C} method
   * @param {LH.CrdpCommands[C]['paramsType']} params
   * @return {Promise<LH.CrdpCommands[C]['returnType']>}
   */
  sendCommand(method, ...params) {
    const timeoutMs = this.getNextProtocolTimeout();
    this._nextProtocolTimeout = undefined;

    /** @type {NodeJS.Timer|undefined} */
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
      // Unexpected setTimeout invocation to preserve the error stack. https://github.com/GoogleChrome/lighthouse/issues/13332
      // eslint-disable-next-line max-len
      timeout = setTimeout(reject, timeoutMs, new LighthouseError(LighthouseError.errors.PROTOCOL_TIMEOUT, {
        protocolMethod: method,
      }));
      // timeout = setTimeout(() => {
      //   console.log('firing PROTOCOL_TIMEOUT for ', method);
      //   const err = new LighthouseError(LighthouseError.errors.PROTOCOL_TIMEOUT, {
      //     protocolMethod: method,
      //   });
      //   return reject(err);
      // }, timeoutMs);
    });

    const resultPromise = this._cdpSession.send(method, ...params, {
      // Add 50ms to the Puppeteer timeout to ensure the Lighthouse timeout finishes first.
      timeout: timeoutMs + PPTR_BUFFER,
    });
    const resultWithTimeoutPromise = Promise.race([resultPromise, timeoutPromise]);

    return resultWithTimeoutPromise.finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }

  /**
   * If the target crashes, we can't continue gathering.
   *
   * FWIW, if the target unexpectedly detaches (eg the user closed the tab), pptr will
   * catch that and reject into our this._cdpSession.send, which we'll alrady handle appropriately
   * @param {(reason?: any) => void} crashRej
   * @return {void}
   */
  listenForCrashes(crashRej) {
    console.log("gonna listen")
    this.on('Inspector.targetCrashed', async _ => {
      console.error('DLFIDSF ON NO ITS A CRASH')
      log.error('Session', 'Inspector.targetCrashed', this._targetInfo);
      // Manually detach so no more CDP traffic is attempted.
      this.dispose();
      crashRej(new LighthouseError(LighthouseError.errors.TARGET_CRASHED));
    });
  }

  /**
   * Disposes of a session so that it can no longer talk to Chrome.
   * @return {Promise<void>}
   */
  async dispose() {
    // @ts-expect-error Puppeteer expects the handler params to be type `unknown`
    this._cdpSession.off('*', this._handleProtocolEvent);
    await this._cdpSession.detach();
  }
}

export {ProtocolSession};
