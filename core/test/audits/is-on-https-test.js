/**
 * @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert/strict';

import Audit from '../../audits/is-on-https.js';
import {networkRecordsToDevtoolsLog} from '../network-records-to-devtools-log.js';

describe('Security: HTTPS audit', () => {
  function getArtifacts(networkRecords, mixedContentIssues, mainDocumentUrl) {
    const devtoolsLog = networkRecordsToDevtoolsLog(networkRecords);
    return {
      devtoolsLogs: {[Audit.DEFAULT_PASS]: devtoolsLog},
      InspectorIssues: {mixedContentIssue: mixedContentIssues || []},
      URL: {
        mainDocumentUrl: mainDocumentUrl || networkRecords[0].url,
      },
      GatherContext: {gatherMode: 'navigation'},
    };
  }

  it('fails when there is more than one insecure record', () => {
    return Audit.audit(getArtifacts([
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
      {url: 'http://insecure.com/image.jpeg', parsedURL: {scheme: 'http', host: 'insecure.com'}},
      {url: 'http://insecure.com/image.jpeg', parsedURL: {scheme: 'http', host: 'insecure.com'}}, // should be de-duped
      {url: 'http://insecure.com/image2.jpeg', parsedURL: {scheme: 'http', host: 'insecure.com'}},
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
    ]), {computedCache: new Map()}).then(result => {
      assert.strictEqual(result.score, 0);
      expect(result.displayValue).toBeDisplayString('2 insecure requests found');
      assert.strictEqual(result.details.items.length, 2);
    });
  });

  it('fails when there is one insecure record', () => {
    return Audit.audit(getArtifacts([
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
      {url: 'http://insecure.com/image.jpeg', parsedURL: {scheme: 'http', host: 'insecure.com'}},
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
    ]), {computedCache: new Map()}).then(result => {
      assert.strictEqual(result.score, 0);
      expect(result.displayValue).toBeDisplayString('1 insecure request found');
      expect(result.details.items[0]).toMatchObject({url: 'http://insecure.com/image.jpeg'});
    });
  });

  it('passes when all records are secure', () => {
    return Audit.audit(getArtifacts([
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
      {url: 'http://localhost/image.jpeg', parsedURL: {scheme: 'http', host: 'localhost'}},
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
    ]), {computedCache: new Map()}).then(result => {
      assert.strictEqual(result.score, 1);
    });
  });

  it('passes when insecure main document redirects to a secure url', async () => {
    const artifacts = getArtifacts([
      {requestId: '1', url: 'http://google.com/'},
      {requestId: '1:redirect', url: 'https://google.com/'},
    ], null, 'https://google.com/');
    const result = await Audit.audit(artifacts, {computedCache: new Map()});
    assert.strictEqual(result.score, 1);
  });

  it('fails when insecure main document redirects to another insecure url', async () => {
    const artifacts = getArtifacts([
      {requestId: '1', url: 'http://google.com/'},
      {requestId: '1:redirect', url: 'http://www.google.com/'},
    ], null, 'http://www.google.com/');
    const result = await Audit.audit(artifacts, {computedCache: new Map()});
    assert.strictEqual(result.score, 0);
    assert.deepStrictEqual(result.details.items.map(i => i.url), [
      'http://www.google.com/',
    ]);
  });

  it('fails when an insecure non-document request redirects to a secure url', async () => {
    const artifacts = getArtifacts([
      {requestId: '1', url: 'https://google.com/'},
      {requestId: '2', url: 'http://google.com/image.jpeg'},
      {requestId: '2:redirect', url: 'https://google.com/image.jpeg'},
    ]);
    const result = await Audit.audit(artifacts, {computedCache: new Map()});
    assert.strictEqual(result.score, 0);
    assert.deepStrictEqual(result.details.items.map(i => i.url), [
      'http://google.com/image.jpeg',
    ]);
  });

  it('augmented with mixed-content InspectorIssues', async () => {
    const networkRecords = [
      {url: 'https://google.com/', parsedURL: {scheme: 'https', host: 'google.com'}},
      {url: 'http://localhost/image.jpeg', parsedURL: {scheme: 'http', host: 'localhost'}},
      {url: 'http://google.com/', parsedURL: {scheme: 'http', host: 'google.com'}},
    ];
    const mixedContentIssues = [
      {insecureURL: 'http://localhost/image.jpeg', resolutionStatus: 'MixedContentBlocked'},
      {insecureURL: 'http://localhost/image2.jpeg', resolutionStatus: 'MixedContentBlockedLOL'},
    ];
    const artifacts = getArtifacts(networkRecords, mixedContentIssues);
    const result = await Audit.audit(artifacts, {computedCache: new Map()});

    expect(result.details.items).toHaveLength(3);

    expect(result.details.items[0]).toMatchObject({
      url: 'http://google.com/',
      resolution: expect.toBeDisplayString('Allowed'),
    });

    expect(result.details.items[1]).toMatchObject({
      url: 'http://localhost/image.jpeg',
      resolution: expect.toBeDisplayString('Blocked'),
    });

    // Unknown blocked resolution string is used as fallback.
    expect(result.details.items[2]).toMatchObject({
      url: 'http://localhost/image2.jpeg',
      resolution: 'MixedContentBlockedLOL',
    });

    expect(result.score).toBe(0);
  });
});
