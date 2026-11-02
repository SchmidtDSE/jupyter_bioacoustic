/**
 * @jest-environment jsdom
 *
 * Config-builder DOM factories (dom.ts) and the shared path patterns (constants.ts).
 *
 * License: BSD 3-Clause
 */

import { DATA_FILE_RE, REMOTE_SCHEME_RE, YAML_FILE_RE } from '../config_builder/constants';
import {
  fillSelect, makeButton, makeInput, makeLabel, makeRow, makeSelect,
} from '../config_builder/dom';

const values = (sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.value);
const texts = (sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.textContent);

describe('dom factories', () => {
  it('makeSelect lists the options and selects one', () => {
    const sel = makeSelect(['a', 'b', 'c'], 'b');
    expect(values(sel)).toEqual(['a', 'b', 'c']);
    expect(sel.value).toBe('b');
  });

  it('makeInput is a text input with placeholder and width', () => {
    const inp = makeInput('type here', '123px');
    expect(inp.type).toBe('text');
    expect(inp.placeholder).toBe('type here');
    expect(inp.style.width).toBe('123px');
    expect(inp.style.padding).toBe('4px 8px');
  });

  it('makeLabel colours required fields differently', () => {
    expect(makeLabel('x', true).style.color).not.toBe(makeLabel('x').style.color);
    expect(makeLabel('key').textContent).toBe('key');
  });

  it('makeButton / makeRow build the elements', () => {
    expect(makeButton('Go', true).textContent).toBe('Go');
    expect(makeButton('Go', true).style.fontWeight).toBe('700');
    expect(makeRow().style.display).toBe('flex');
  });

  it('fillSelect replaces the options, with an optional placeholder', () => {
    const sel = makeSelect(['old']);
    fillSelect(sel, ['x', 'y'], '— select —');
    expect(values(sel)).toEqual(['', 'x', 'y']);
    expect(texts(sel)[0]).toBe('— select —');
    fillSelect(sel, ['z']);
    expect(values(sel)).toEqual(['z']);
  });
});

describe('path patterns', () => {
  it('DATA_FILE_RE matches readable data files only', () => {
    expect(['a.csv', 'b.PARQUET', 'c.jsonl', 'd.tsv', 'e.json'].every(p => DATA_FILE_RE.test(p))).toBe(true);
    expect(DATA_FILE_RE.test('a.txt')).toBe(false);
  });

  it('REMOTE_SCHEME_RE spots URL schemes', () => {
    expect(REMOTE_SCHEME_RE.test('s3://bucket/x')).toBe(true);
    expect(REMOTE_SCHEME_RE.test('HTTPS://x')).toBe(true);
    expect(REMOTE_SCHEME_RE.test('data/x.csv')).toBe(false);
  });

  it('YAML_FILE_RE matches .yaml/.yml', () => {
    expect(YAML_FILE_RE.test('p.yml') && YAML_FILE_RE.test('p.YAML')).toBe(true);
    expect(YAML_FILE_RE.test('p.json')).toBe(false);
  });
});
