/**
 * Tests for value-driven source_type auto-detection in the Data and Audio
 * config-builder sections: a pasted remote scheme (https://, s3://, …) selects
 * `url`/`url/uri`, otherwise `path`, while leaving deliberate sql/api/column
 * choices untouched.
 *
 * License: BSD 3-Clause
 */

import { DataSection } from '../config_builder/sections/DataSection';
import { AudioSection } from '../config_builder/sections/AudioSection';

// Minimal DOM mock (Node test environment) — mirrors AppSection.test.ts.
global.document = {
  createElement: jest.fn((tagName: string) => {
    if (tagName === 'input') {
      return new (global.HTMLInputElement as any)();
    }
    if (tagName === 'button') {
      return new (global.HTMLButtonElement as any)();
    }
    return new (global.HTMLElement as any)();
  }),
} as any;

global.HTMLElement = class {
  style: Record<string, any> = { cssText: '' };
  textContent = '';
  innerHTML = '';
  draggable = false;
  title = '';
  dataset: Record<string, string> = {};
  appendChild = jest.fn();
  addEventListener = jest.fn();
  append = jest.fn();
  prepend = jest.fn();
  removeChild = jest.fn();
  insertBefore = jest.fn();
  remove = jest.fn();
  setAttribute = jest.fn();
  getAttribute = jest.fn();
  classList = {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(),
    toggle: jest.fn(),
  };
} as any;
global.HTMLDivElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLDetailsElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLSummaryElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLSpanElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLSelectElement = class extends (global.HTMLElement as any) {
  value = '';
} as any;
global.HTMLInputElement = class extends (global.HTMLElement as any) {
  private _value = '';
  get value() { return this._value; }
  set value(v) { this._value = v; }
  type = '';
  checked = false;
} as any;
global.HTMLButtonElement = class extends (global.HTMLElement as any) {
  draggable = false;
} as any;

describe('DataSection source_type auto-detection', () => {
  let ds: any;

  beforeEach(() => {
    ds = new DataSection() as any;
  });

  test('pasting an https URL while on path switches to url', () => {
    ds._sourceType.value = 'path';
    ds._pathInput.value = 'https://example.com/detections.csv';
    ds._autoDetectSourceType();
    expect(ds._sourceType.value).toBe('url');
    expect(ds.getData().source_type).toBe('url');
    expect(ds.getData().value).toBe('https://example.com/detections.csv');
  });

  test('pasting an s3:// URI while on path switches to url', () => {
    ds._sourceType.value = 'path';
    ds._pathInput.value = 's3://bucket/detections.csv';
    ds._autoDetectSourceType();
    expect(ds._sourceType.value).toBe('url');
  });

  test('pasting a local path while on url switches back to path', () => {
    ds._sourceType.value = 'url';
    ds._pathInput.value = 'data/detections.csv';
    ds._autoDetectSourceType();
    expect(ds._sourceType.value).toBe('path');
    expect(ds.getData().source_type).toBe('path');
  });

  test('a deliberate sql choice is never clobbered by the value', () => {
    ds._sourceType.value = 'sql';
    ds._pathInput.value = 'https://example.com/q';
    ds._autoDetectSourceType();
    expect(ds._sourceType.value).toBe('sql');
  });

  test('an empty value leaves source_type unchanged', () => {
    ds._sourceType.value = 'path';
    ds._pathInput.value = '';
    ds._autoDetectSourceType();
    expect(ds._sourceType.value).toBe('path');
  });
});

describe('AudioSection source_type auto-detection', () => {
  let as: any;

  beforeEach(() => {
    as = new AudioSection() as any;
  });

  test('pasting an https URL while on path switches to url/uri (→ url)', () => {
    as._sourceType.value = 'path';
    as._valueInput.value = 'https://example.com/rec.flac';
    as._autoDetectSourceType();
    expect(as._sourceType.value).toBe('url/uri');
    expect(as.getData().source_type).toBe('url');
  });

  test('pasting an s3:// URI while on path switches to url/uri (→ uri)', () => {
    as._sourceType.value = 'path';
    as._valueInput.value = 's3://bucket/rec.flac';
    as._autoDetectSourceType();
    expect(as._sourceType.value).toBe('url/uri');
    expect(as.getData().source_type).toBe('uri');
  });

  test('pasting a local path while on url/uri switches back to path', () => {
    as._sourceType.value = 'url/uri';
    as._valueInput.value = 'audio/rec.flac';
    as._autoDetectSourceType();
    expect(as._sourceType.value).toBe('path');
    expect(as.getData().source_type).toBe('path');
  });

  test('a deliberate column choice is never clobbered by the value', () => {
    as._sourceType.value = 'column';
    as._valueInput.value = 'https://example.com/rec.flac';
    as._autoDetectSourceType();
    expect(as._sourceType.value).toBe('column');
  });
});
