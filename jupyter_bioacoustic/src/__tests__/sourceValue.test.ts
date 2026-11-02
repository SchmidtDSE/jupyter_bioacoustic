/**
 * @jest-environment jsdom
 *
 * Data/Audio source helpers: source_type auto-detection and the ✓/✗ status badge.
 *
 * License: BSD 3-Clause
 */

import { makeSelect } from '../config_builder/dom';
import {
  autoDetectSourceType, makeStatusBadge, setStatusBadge,
} from '../config_builder/sections/sourceValue';

describe('autoDetectSourceType', () => {
  it('switches path <-> remote type from the value', () => {
    const sel = makeSelect(['path', 'url', 'sql'], 'path');
    expect(autoDetectSourceType(sel, ' s3://b/x.csv ', 'url')).toBe(true);
    expect(sel.value).toBe('url');
    expect(autoDetectSourceType(sel, 'data/x.csv', 'url')).toBe(true);
    expect(sel.value).toBe('path');
  });

  it('reports no change when the type already matches or the value is blank', () => {
    const sel = makeSelect(['path', 'url'], 'path');
    expect(autoDetectSourceType(sel, 'data/x.csv', 'url')).toBe(false);
    expect(autoDetectSourceType(sel, '   ', 'url')).toBe(false);
    expect(sel.value).toBe('path');
  });

  it('leaves a deliberate other type alone', () => {
    const sel = makeSelect(['path', 'url/uri', 'column'], 'column');
    expect(autoDetectSourceType(sel, 'https://x/a.flac', 'url/uri')).toBe(false);
    expect(sel.value).toBe('column');
  });
});

describe('status badge', () => {
  it('shows ✓ / ✗ with the matching tooltip and hides on null', () => {
    const badge = makeStatusBadge();
    expect(badge.style.display).toBe('none');
    setStatusBadge(badge, true, 'good', 'bad');
    expect([badge.textContent, badge.title, badge.style.display]).toEqual(['✓', 'good', '']);
    setStatusBadge(badge, false, 'good', 'bad');
    expect([badge.textContent, badge.title]).toEqual(['✗', 'bad']);
    setStatusBadge(badge, null, 'good', 'bad');
    expect(badge.style.display).toBe('none');
  });
});
