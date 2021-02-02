/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @typedef Finding
 * @property {number} type
 * @property {string} description
 * @property {number} severity
 * @property {string} directive The directive the finding applies to.
 * @property {string|undefined} value Keyword if the finding applies to one.
 */

const log = require('lighthouse-logger');
const i18n = require('../lib/i18n/i18n.js');
const {
  Parser,
  Type,
  Directive,
  evaluateForFailure,
  evaluateForSyntaxErrors,
  evaluateForWarnings,
} = require('../../third-party/csp-evaluator/optimized_binary.js');

const UIStrings = {
  missingBaseUri: 'Missing base-uri allows the injection of base tags. ' +
    'They can be used to set the base URL for all relative (script) ' +
    'URLs to an attacker controlled domain. ' +
    'Can you set it to \'none\' or \'self\'?',
  missingScriptSrc: 'script-src directive is missing. ' +
    'This can allow the execution of unsafe scripts.',
  missingObjectSrc: 'Consider setting object-src to \'none\' to prevent the injection of ' +
    'plugins that execute JavaScript.',
  strictDynamic: 'Host allowlists can frequently be bypassed. Consider using ' +
    '\'strict-dynamic\' in combination with CSP nonces or hashes.',
  unsafeInline: '\'unsafe-inline\' allows the execution of unsafe in-page scripts ' +
    'and event handlers. Consider using CSP nonces or hashes to allow scripts individually.',
  unsafeInlineFallback: 'Consider adding \'unsafe-inline\' (ignored by browsers supporting ' +
    'nonces/hashes) to be backward compatible with older browsers.',
  allowlistFallback: 'Consider adding https: and http: url schemes (ignored by browsers ' +
    'supporting \'strict-dynamic\') to be backward compatible with older browsers.',
  reportToOnly: 'This CSP policy only provides a reporting ' +
    'destination via the \'report-to\' directive. ' +
    'This directive is only supported in Chromium-based browsers so it is ' +
    'recommended to also use a \'report-uri\' directive.',
  reportingDestinationMissing: 'This CSP policy does not configure a reporting destination. ' +
    'This makes it difficult to maintain the CSP policy over time and monitor for any breakages.',
  nonceLength: 'Nonces should be at least 8 characters long and use the base64 charset.',
  missingSemicolon: 'Did you forget the semicolon? ' +
    '{keyword} seems to be a directive, not a keyword.',
  unknownDirective: 'Unknown CSP directive.',
  unknownKeyword: '{keyword} seems to be an invalid keyword.',
  deprecatedReflectedXSS: 'reflected-xss is deprecated since CSP2. ' +
    'Please, use the X-XSS-Protection header instead.',
  deprecatedReferrer: 'referrer is deprecated since CSP2. ' +
    'Please, use the Referrer-Policy header instead.',
  deprecatedDisownOpener: 'disown-opener is deprecated since CSP3. ' +
    'Please, use the Cross-Origin-Opener-Policy header instead.',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

/** @type {Record<number, Record<string, LH.IcuMessage>|string|LH.IcuMessage>} */
const FINDING_TO_UI_STRING = {
  [Type.MISSING_SEMICOLON]: UIStrings.missingSemicolon,
  [Type.UNKNOWN_DIRECTIVE]: str_(UIStrings.unknownDirective),
  [Type.INVALID_KEYWORD]: UIStrings.unknownKeyword,
  [Type.MISSING_DIRECTIVES]: {
    [Directive.BASE_URI]: str_(UIStrings.missingBaseUri),
    [Directive.SCRIPT_SRC]: str_(UIStrings.missingScriptSrc),
    [Directive.OBJECT_SRC]: str_(UIStrings.missingObjectSrc),
  },
  [Type.SCRIPT_UNSAFE_INLINE]: str_(UIStrings.unsafeInline),
  [Type.NONCE_LENGTH]: str_(UIStrings.nonceLength),
  [Type.DEPRECATED_DIRECTIVE]: {
    [Directive.REFLECTED_XSS]: str_(UIStrings.deprecatedReflectedXSS),
    [Directive.REFERRER]: str_(UIStrings.deprecatedReferrer),
    [Directive.DISOWN_OPENER]: str_(UIStrings.deprecatedDisownOpener),
  },
  [Type.STRICT_DYNAMIC]: str_(UIStrings.strictDynamic),
  [Type.UNSAFE_INLINE_FALLBACK]: str_(UIStrings.unsafeInlineFallback),
  [Type.WHITELIST_FALLBACK]: str_(UIStrings.allowlistFallback),
  [Type.REPORTING_DESTINATION_MISSING]: str_(UIStrings.reportingDestinationMissing),
  [Type.REPORT_TO_ONLY]: str_(UIStrings.reportToOnly),
};

/**
 * @param {Finding} finding
 * @return {LH.IcuMessage|string}
 */
function getTranslatedDescription(finding) {
  let result = FINDING_TO_UI_STRING[finding.type];
  if (!result) {
    log.warn('CSP Evaluator', `No translation found for description: ${finding.description}`);
    return finding.description;
  }

  // Return if translated result found.
  if (i18n.isIcuMessage(result)) return result;

  // If result was not translated, that means `finding.value` is included in the UI string.
  if (typeof result === 'string') return str_(result, {keyword: finding.value || ''});

  // Result is a record object, UI string depends on the directive.
  result = result[finding.directive];
  if (!result) {
    log.warn('CSP Evaluator', `No translation found for description: ${finding.description}`);
    return finding.description;
  }

  return result;
}

/**
 * @param {Array<string>} rawCsps
 * @return {Array<Finding>}
 */
function evaluateRawCspForFailures(rawCsps) {
  return evaluateForFailure(rawCsps.map(c => new Parser(c).csp));
}

/**
 * @param {Array<string>} rawCsps
 * @return {Array<Finding>}
 */
function evaluateRawCspForWarnings(rawCsps) {
  return evaluateForWarnings(rawCsps.map(c => new Parser(c).csp));
}

/**
 * @param {Array<string>} rawCsps
 * @return {Array<Array<Finding>>}
 */
function evaluateRawCspForSyntax(rawCsps) {
  return evaluateForSyntaxErrors(rawCsps.map(c => new Parser(c).csp));
}

module.exports = {
  evaluateRawCspForFailures,
  evaluateRawCspForWarnings,
  evaluateRawCspForSyntax,
  getTranslatedDescription,
  UIStrings,
};