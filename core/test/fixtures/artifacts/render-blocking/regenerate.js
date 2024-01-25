/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {startFlow} from '../../../../index.js';
import {updateTestFixture} from '../update-test-fixture.js';

/**
 * @param {import('puppeteer').Page} page
 * @param {number} port
 */
async function runUserFlow(page, port) {
  const flow = await startFlow(page);

  await flow.navigate(`http://localhost:${port}/render-blocking.html`);

  return flow;
}

/**
 * @param {LH.Artifacts} artifacts
 */
function verify(artifacts) {
  const {traceEvents} = artifacts.Trace;

  const requestStartEvents = traceEvents.filter(e => e.name === 'ResourceSendRequest');
  const renderBlockingEvents = requestStartEvents
    .filter(e => e.args?.data?.renderBlocking === 'blocking');
  if (renderBlockingEvents.length !== 1) {
    throw new Error('expected 1 render blocking request');
  }
}

await updateTestFixture({
  name: 'render-blocking',
  about: 'Page with a render blocking request and a text LCP',
  saveTrace: true,
  saveDevtoolsLog: true,
  runUserFlow,
  verify,
});
