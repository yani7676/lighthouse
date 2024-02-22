/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as td from 'testdouble';

import {
  createMockDriver,
  createMockPage,
  createMockGathererInstance,
  mockDriverModule,
  mockRunnerModule,
  createMockCdpSession,
} from './mock-driver.js';
import {fnAny} from '../test-utils.js';
import {getRejectionCallback} from '../../gather/runner-helpers.js';
import {Driver} from '../../gather/driver.js';

const mockRunner = await mockRunnerModule();

// Establish the mocks before we import the file under test.
/** @type {ReturnType<typeof createMockDriver>} */
let mockDriver;

await td.replaceEsm('../../gather/driver.js',
  mockDriverModule(() => mockDriver.asDriver()));

// Some imports needs to be done dynamically, so that their dependencies will be mocked.
// https://github.com/GoogleChrome/lighthouse/blob/main/docs/hacking-tips.md#mocking-modules-with-testdouble
const {snapshotGather} = await import('../../gather/snapshot-runner.js');

describe('Snapshot Runner', () => {
  /** @type {ReturnType<typeof createMockPage>} */
  let mockPage;
  /** @type {LH.Puppeteer.Page} */
  let page;
  /** @type {ReturnType<typeof createMockGathererInstance>} */
  let gathererA;
  /** @type {ReturnType<typeof createMockGathererInstance>} */
  let gathererB;
  /** @type {LH.Config} */
  let config;

  beforeEach(() => {
    mockPage = createMockPage();
    mockDriver = createMockDriver();
    mockRunner.reset();
    page = mockPage.asPage();

    mockDriver._session.sendCommand.mockResponse('Browser.getVersion', {
      product: 'Chrome/88.0',
      userAgent: 'Chrome',
    });

    gathererA = createMockGathererInstance({supportedModes: ['snapshot']});
    gathererA.getArtifact.mockResolvedValue('Artifact A');

    gathererB = createMockGathererInstance({supportedModes: ['snapshot']});
    gathererB.getArtifact.mockResolvedValue('Artifact B');

    config = {
      artifacts: [
        {id: 'A', gatherer: {instance: gathererA.asGatherer()}},
        {id: 'B', gatherer: {instance: gathererB.asGatherer()}},
      ],
    };
  });

  it('should connect to the page and run', async () => {
    await snapshotGather(page, {config});
    expect(mockDriver.connect).toHaveBeenCalled();
    expect(mockRunner.gather).toHaveBeenCalled();
    expect(mockRunner.audit).not.toHaveBeenCalled();
  });

  it('should collect base artifacts', async () => {
    mockDriver.url.mockResolvedValue('https://lighthouse.example.com/');

    await snapshotGather(page, {config});
    const artifacts = await mockRunner.gather.mock.calls[0][0]();
    expect(artifacts).toMatchObject({
      fetchTime: expect.any(String),
      URL: {
        finalDisplayedUrl: 'https://lighthouse.example.com/',
      },
    });
  });

  it('should collect snapshot artifacts', async () => {
    await snapshotGather(page, {config});
    const artifacts = await mockRunner.gather.mock.calls[0][0]();
    expect(artifacts).toMatchObject({A: 'Artifact A', B: 'Artifact B'});
    expect(gathererA.getArtifact).toHaveBeenCalled();
    expect(gathererB.getArtifact).toHaveBeenCalled();
  });


  it('should use flags', async () => {
    const flags = {
      formFactor: /** @type {const} */ ('desktop'),
      maxWaitForLoad: 1234,
      screenEmulation: {mobile: false},
    };

    await snapshotGather(page, {config, flags});

    expect(mockRunner.gather.mock.calls[0][1]).toMatchObject({
      resolvedConfig: {
        settings: flags,
      },
    });
  });

  it('should not invoke instrumentation methods', async () => {
    await snapshotGather(page, {config});
    await mockRunner.gather.mock.calls[0][0]();
    expect(gathererA.startInstrumentation).not.toHaveBeenCalled();
    expect(gathererA.startSensitiveInstrumentation).not.toHaveBeenCalled();
    expect(gathererA.stopSensitiveInstrumentation).not.toHaveBeenCalled();
    expect(gathererA.stopInstrumentation).not.toHaveBeenCalled();
  });

  it('should skip timespan artifacts', async () => {
    gathererB.meta.supportedModes = ['timespan'];

    await snapshotGather(page, {config});
    const artifacts = await mockRunner.gather.mock.calls[0][0]();
    expect(artifacts).toMatchObject({A: 'Artifact A'});
    expect(artifacts).not.toHaveProperty('B');
    expect(gathererB.getArtifact).not.toHaveBeenCalled();
  });

  it('should support artifact dependencies', async () => {
    const dependencySymbol = Symbol('dep');
    gathererA.meta.symbol = dependencySymbol;
    // @ts-expect-error - the default fixture was defined as one without dependencies.
    gathererB.meta.dependencies = {ImageElements: dependencySymbol};

    await snapshotGather(page, {config});
    const artifacts = await mockRunner.gather.mock.calls[0][0]();
    expect(artifacts).toMatchObject({A: 'Artifact A', B: 'Artifact B'});
    expect(gathererB.getArtifact.mock.calls[0][0]).toMatchObject({
      dependencies: {
        ImageElements: 'Artifact A',
      },
    });
  });

  it.only('includes a crash runtimeError when there\'s a crash during gathering', async () => {
    const puppeteerSession = createMockCdpSession();
    puppeteerSession.send
      .mockResponse('Page.enable')
      .mockResponse('Page.getFrameTree', {frameTree: {frame: {id: 'mainFrameId'}}})
      .mockResponse('Runtime.enable')
      .mockResponse('Page.disable')
      .mockResponse('Runtime.disable')
      .mockResponse('Target.getTargetInfo', {targetInfo: {type: 'page', targetId: 'page'}})
      .mockResponse('Network.enable')
      .mockResponse('Target.setAutoAttach')
      .mockResponse('Runtime.runIfWaitingForDebugger');

    const pageTarget = {createCDPSession: () => puppeteerSession};

    // @ts-expect-error - Individual mock functions are applied as necessary.
    page = {target: () => pageTarget, url: fnAny()};
    const driver = new Driver(page);

    const runP = snapshotGather(page, {config});
    // await expect(runP).rejects.toThrow(/TARGET_CRASHED/);
    // const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
    // const p1 = wait(100);
    // debugger;
    driver.defaultSession.emit('Inspector.targetCrashed', {});
    await runP;

    const gatherResult2 = await snapshotGather(page, {config});
    expect(mockDriver.connect).toHaveBeenCalled();
    expect(mockRunner.gather).toHaveBeenCalled();
    expect(mockRunner.audit).not.toHaveBeenCalled();
    const artifacts = await mockRunner.gather.mock.calls[0][0]();

     expect(artifacts).toMatchObject({A: 'Artifact A', B: 'Artifact B'});

    console.log({runP});

    // const {resolvedConfig} = await initializeConfig('navigation');

    // setTimeout(() => {
    //   driverMock.defaultSession.emit('Inspector.targetCrashed');
    // });
    // debugger;
    // const {lhr} = await runGatherAndAudit(createGatherFn('https://example.com/'),
    //   {resolvedConfig, driverMock, computedCache: new Map()});

    // // And it bubbled up to the runtimeError.
    // expect(lhr.runtimeError.code).toEqual(LighthouseError.errors.TARGET_CRASHED.code);
    // expect(lhr.runtimeError.message).toMatch(/crashed/);

    // await expect(runP).rejects.toThrow(/TARGET_CRASHED/);
  });
});
