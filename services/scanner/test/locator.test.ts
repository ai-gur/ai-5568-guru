import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPageLocator } from '../src/verdict.ts';

/*
 * Written from a real scan. The judgement layer failed IL-5 on a site that has
 * a working preferences widget, and cited `componentNamesPerPage[url="…"].names`
 * as the location — a path into the evidence it had been handed, not a place on
 * the page. A finding nobody can navigate to is not a finding, and treating that
 * string as a locator is what let the wrong verdict through the guard.
 */

test('evidence paths are not page locators', () => {
  for (const value of [
    'componentNamesPerPage[url="https://aiguru.co.il/he"].names',
    'accessibilityWidget.candidates',
    'titlesAcrossSite',
    'navigationSequences[2]',
  ]) {
    assert.equal(isPageLocator(value), false, value);
  }
});

test('a placeholder is not a page locator', () => {
  for (const value of ['', '   ', 'body', 'html', undefined]) {
    assert.equal(isPageLocator(value), false, String(value));
  }
});

test('real selectors survive', () => {
  // The guard suppresses findings, so a false negative here silently hides
  // genuine ones — these are the cases that must never regress.
  for (const value of [
    '#a11y-widget-trigger',
    '.a11y-trigger',
    'a[href="/x"]',
    'input[type="search"]',
    'div.card > p',
    'body > aside > div:nth-of-type(1) > p > a',
    'main#content',
    'ul li:first-child + li',
  ]) {
    assert.equal(isPageLocator(value), true, value);
  }
});

test('a URL is a locator — the site-level rows point at a page', () => {
  assert.equal(isPageLocator('https://aiguru.co.il/he/accessibility'), true);
});
