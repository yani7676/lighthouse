/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import log from 'lighthouse-logger';

import {Driver} from './driver.js';
import {Runner} from '../runner.js';
import {getEmptyArtifactState, collectPhaseArtifacts, awaitArtifacts, getRejectionCallback} from './runner-helpers.js';
import {initializeConfig} from '../config/config.js';
import {LighthouseError} from '../lib/lh-error.js';
import {getBaseArtifacts, finalizeArtifacts} from './base-artifacts.js';

/**
 * @param {LH.Puppeteer.Page} page
 * @param {{config?: LH.Config, flags?: LH.Flags}} [options]
 * @return {Promise<LH.Gatherer.GatherResult>}
 */
async function snapshotGather(page, options = {}) {
  const {flags = {}, config} = options;
  log.setLevel(flags.logLevel || 'error');

  const {resolvedConfig} = await initializeConfig('snapshot', config, flags);
  const driver = new Driver(page);

  /** @type {Map<string, LH.ArbitraryEqualityMap>} */
  const computedCache = new Map();

  const runnerOptions = {resolvedConfig, computedCache};
  const {promise: crashP, rej: crashRej} = getRejectionCallback();

  const gatherFn = async () => {
    await driver.connect(crashRej);
    const url = await driver.url();
    const baseArtifacts =
        await getBaseArtifacts(resolvedConfig, driver, {gatherMode: 'snapshot'});
    baseArtifacts.URL = {
      finalDisplayedUrl: url,
    };

    const artifactDefinitions = resolvedConfig.artifacts || [];
    const artifactState = getEmptyArtifactState();
    await collectPhaseArtifacts({
      phase: 'getArtifact',
      gatherMode: 'snapshot',
      driver,
      page,
      baseArtifacts,
      artifactDefinitions,
      artifactState,
      computedCache,
      settings: resolvedConfig.settings,
    });

    await driver.disconnect();

    const artifacts = await awaitArtifacts(artifactState);
    return finalizeArtifacts(baseArtifacts, artifacts);
  };

  const runnerGatherP = Runner.gather(gatherFn, runnerOptions);
  const artifactsOrError = await Promise.race([crashP, runnerGatherP]);
  if (artifactsOrError instanceof LighthouseError) {
    return Promise.reject(artifactsOrError);
  }
  const artifacts = /** @type {LH.Artifacts} */ (artifactsOrError);
  return {artifacts, runnerOptions};
}

export {
  snapshotGather,
};
