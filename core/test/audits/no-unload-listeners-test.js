/**
 * @license Copyright 2020 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import NoUnloadListeners from '../../audits/no-unload-listeners.js';
import {createScript} from '../test-utils.js';

const testScripts = [
  {scriptId: '12', url: 'https://example.com/1.js'},
  {scriptId: '13', url: 'https://example.com/1.js'},
  {scriptId: '16', url: 'https://example.com/1.js'},
  {scriptId: '17', url: 'https://example.com/1.js'},
  {scriptId: '22', url: 'https://example.com/2.js'},
  {scriptId: '23', url: 'https://example.com/2.js'},
  {scriptId: '26', url: 'https://example.com/2.js'},
  {scriptId: '27', url: 'https://example.com/2.js'},
].map(createScript);

describe('No Unload Listeners', () => {
  it('passes when there were no deprecation issues', async () => {
    const artifacts = {
      InspectorIssues: {
        deprecationIssue: [],
      },
      SourceMaps: [],
      Scripts: testScripts,
    };
    const context = {computedCache: new Map()};
    const result = await NoUnloadListeners.audit(artifacts, context);
    expect(result).toEqual({score: 1});
  });

  it('passes when there were no `UnloadHandler` deprecation issues', async () => {
    const InspectorIssues = {
      deprecationIssue: [{
        type: 'SomeDeprecation',
        sourceCodeLocation: {
          scriptId: '12',
          lineNumber: 5,
          columnNumber: 0,
        },
      }],
    };
    const artifacts = {
      InspectorIssues,
      SourceMaps: [],
      Scripts: testScripts,
    };
    const context = {computedCache: new Map()};
    const result = await NoUnloadListeners.audit(artifacts, context);
    expect(result).toEqual({score: 1});
  });

  it('fails when there are unload listeners and matches them to script locations', async () => {
    const InspectorIssues = {
      deprecationIssue: [
        {
          type: 'UnloadHandler',
          sourceCodeLocation: {
            scriptId: '16',
            lineNumber: 10,
            columnNumber: 30,
          },
        },
        {
          type: 'UnloadHandler',
          sourceCodeLocation: {
            scriptId: '23',
            lineNumber: 0,
            columnNumber: 0,
          },
        },
      ],
    };
    const artifacts = {
      InspectorIssues,
      SourceMaps: [],
      Scripts: testScripts,
    };
    const context = {computedCache: new Map()};
    const result = await NoUnloadListeners.audit(artifacts, context);
    expect(result.score).toEqual(0);
    expect(result.details.items).toMatchObject([
      {
        source: {type: 'source-location', url: 'https://example.com/1.js', urlProvider: 'network', line: 10, column: 30},
      }, {
        source: {type: 'source-location', url: 'https://example.com/2.js', urlProvider: 'network', line: 0, column: 0},
      },
    ]);
  });

  // eslint-disable-next-line max-len
  it('fails when there are unload listeners and has a fallback if script URL is not found', async () => {
    const InspectorIssues = {
      deprecationIssue: [
        {
          type: 'UnloadHandler',
          sourceCodeLocation: {
            scriptId: 'noscriptid',
            lineNumber: 10,
            columnNumber: 30,
          },
        },
        {
          type: 'UnloadHandler',
          sourceCodeLocation: {
            scriptId: '23',
            lineNumber: 1,
            columnNumber: 100,
          },
        },
      ],
    };
    const artifacts = {
      InspectorIssues,
      SourceMaps: [],
      Scripts: testScripts,
    };
    const context = {computedCache: new Map()};
    const result = await NoUnloadListeners.audit(artifacts, context);
    expect(result.score).toEqual(0);
    expect(result.details.items).toMatchObject([
      {
        source: {type: 'url', value: '(unknown):10:30'},
      }, {
        source: {type: 'source-location', url: 'https://example.com/2.js', urlProvider: 'network', line: 1, column: 100},
      },
    ]);
  });
});
