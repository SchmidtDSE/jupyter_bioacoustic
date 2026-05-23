/**
 * Tests for AppSection data handling and column selection logic
 *
 * License: BSD 3-Clause
 */

import { AppSection } from '../config_builder/sections/AppSection';

// Mock DOM elements since we're testing in Node environment
global.document = {
  createElement: jest.fn((tagName: string) => {
    if (tagName === 'input') {
      return new (global.HTMLInputElement as any)();
    }
    if (tagName === 'div') {
      return new (global.HTMLDivElement as any)();
    }
    if (tagName === 'details') {
      return new (global.HTMLDetailsElement as any)();
    }
    if (tagName === 'summary') {
      return new (global.HTMLSummaryElement as any)();
    }
    if (tagName === 'span') {
      return new (global.HTMLSpanElement as any)();
    }
    if (tagName === 'button') {
      return new (global.HTMLButtonElement as any)();
    }
    // Default element
    return new (global.HTMLElement as any)();
  })
} as any;

global.HTMLElement = class {
  style = { cssText: '' };
  textContent = '';
  innerHTML = '';
  appendChild = jest.fn();
  addEventListener = jest.fn();
  append = jest.fn();
  prepend = jest.fn();
  removeChild = jest.fn();
  insertBefore = jest.fn();
  setAttribute = jest.fn();
  getAttribute = jest.fn();
  classList = {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(),
    toggle: jest.fn()
  };
} as any;
global.HTMLDivElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLDetailsElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLSummaryElement = class extends (global.HTMLElement as any) {} as any;
global.HTMLSpanElement = class extends (global.HTMLElement as any) {} as any;
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

describe('AppSection', () => {
  let appSection: AppSection;

  beforeEach(() => {
    appSection = new AppSection();
  });

  describe('data handling', () => {
    test('getData returns empty object when no data set', () => {
      const data = appSection.getData();
      expect(typeof data).toBe('object');
      expect(data.display_columns).toBeUndefined();
    });

    test('setData and getData handle display_columns correctly', () => {
      appSection.setData({ display_columns: ['species', 'confidence'] });

      const data = appSection.getData();
      expect(data.display_columns).toEqual(['species', 'confidence']);
    });

    test('getData includes other app section fields', () => {
      appSection.setData({
        info_card_title: '[[species]]',
        info_card_text: 'confidence: [[confidence]]',
        duplicate_entries: true,
        capture: false
      });

      const data = appSection.getData();
      expect(data.info_card_title).toBe('[[species]]');
      expect(data.info_card_text).toBe('confidence: [[confidence]]');
      expect(data.duplicate_entries).toBe(true);
      expect(data.capture).toBe(false);
    });

    test('setData handles missing display_columns gracefully', () => {
      appSection.setData({ info_card_title: 'test' });

      const data = appSection.getData();
      expect(data.display_columns).toBeUndefined();
      expect(data.info_card_title).toBe('test');
    });

    test('getData returns array copy of display_columns', () => {
      const originalColumns = ['species', 'confidence'];
      appSection.setData({ display_columns: originalColumns });

      const data = appSection.getData();
      expect(data.display_columns).toEqual(originalColumns);
      expect(data.display_columns).not.toBe(originalColumns); // Should be a copy
    });

    test('handles numeric input values correctly', () => {
      appSection.setData({
        default_buffer: 5,
        clip_table_height: 200,
        player_height: 300,
        info_card_height: 40,
        form_panel_height: 150
      });

      const data = appSection.getData();
      expect(data.default_buffer).toBe(5);
      expect(data.clip_table_height).toBe(200);
      expect(data.player_height).toBe(300);
      expect(data.info_card_height).toBe(40);
      expect(data.form_panel_height).toBe(150);
    });

    test('omits default values from output', () => {
      appSection.setData({
        default_buffer: 3, // default value
        clip_table_height: 175, // default value
        player_height: 260, // default value
        info_card_height: 34, // default value
        form_panel_height: 140, // default value
        capture: true, // default value
      });

      const data = appSection.getData();
      expect(data.default_buffer).toBeUndefined();
      expect(data.clip_table_height).toBeUndefined();
      expect(data.player_height).toBeUndefined();
      expect(data.info_card_height).toBeUndefined();
      expect(data.form_panel_height).toBeUndefined();
      expect(data.capture).toBe(true); // capture default is true, so it gets included
    });
  });

  describe('column selection logic', () => {
    test('empty display_columns array gets included in output', () => {
      appSection.setData({ display_columns: [] });
      const data = appSection.getData();
      expect(data.display_columns).toEqual([]);
    });

    test('setColumnOptions is callable without errors', () => {
      expect(() => {
        appSection.setColumnOptions(['species', 'common_name', 'confidence']);
      }).not.toThrow();
    });

    test('capture directory handling', () => {
      appSection.setCaptureDir('/path/to/captures');

      // Since we can't test DOM interaction directly, we test the data result
      appSection.setData({ capture_dir: '/path/to/captures' });
      const data = appSection.getData();
      expect(data.capture_dir).toBe('/path/to/captures');
    });
  });
});