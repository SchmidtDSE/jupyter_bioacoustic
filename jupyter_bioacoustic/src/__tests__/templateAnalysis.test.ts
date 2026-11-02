/**
 * Template placeholder analysis (templateAnalysis.ts): where a __placeholder__ sits decides
 * its widget.
 *
 * License: BSD 3-Clause
 */

import {
  analyzeTemplate, normalizeElementSpec, placeholderKey,
} from '../config_builder/sections/templateAnalysis';

const TEMPLATE = {
  project: {
    configuration: {
      data: { source_type: '__data_type__', value: '__data_file__', index_column: '__idx__' },
      audio: { source_type: 'column', value: '__audio_col__' },
      output: { path: '__out__' },
    },
  },
  config: { configuration: { title: '__title__' } },
  form: {
    configuration: {
      form: [{ select: { items: { path: '__items__', value: '__items_col__' } } }],
    },
  },
};

describe('analyzeTemplate', () => {
  const map = analyzeTemplate(TEMPLATE, 'project');

  it('classifies data fields', () => {
    expect(map.get('data_type')).toEqual({ role: 'source_type', section: 'data' });
    expect(map.get('data_file')).toMatchObject({ role: 'value', section: 'data', sourceTypeKey: 'data_type' });
    expect(map.get('idx')).toEqual({ role: 'column', providerKey: 'data_file' });
  });

  it('classifies audio / output / items fields', () => {
    expect(map.get('audio_col')).toMatchObject({
      role: 'value', section: 'audio', literalSourceType: 'column', providerKey: 'data_file',
    });
    expect(map.get('out')?.role).toBe('pathfile');
    expect(map.get('items')?.role).toBe('pathfile');
    expect(map.get('items_col')).toEqual({ role: 'column', providerKey: 'items' });
    expect(map.get('title')).toEqual({ role: 'plain' });
  });

  it('only walks the sections the scope creates', () => {
    expect([...analyzeTemplate(TEMPLATE, 'form').keys()].sort()).toEqual(['items', 'items_col']);
  });
});

describe('helpers', () => {
  it('placeholderKey', () => {
    expect(placeholderKey('__a_1__')).toBe('a_1');
    expect([placeholderKey('a'), placeholderKey(3)]).toEqual(['', '']);
  });

  it('normalizeElementSpec', () => {
    expect(normalizeElementSpec(true)).toEqual({ required: true, default: null });
    expect(normalizeElementSpec(false)).toEqual({ required: false, default: null });
    expect(normalizeElementSpec('x')).toEqual({ required: false, default: 'x' });
    expect(normalizeElementSpec({ required: 1, label: 'L' }))
      .toEqual({ required: true, default: null, label: 'L', description: undefined });
  });
});
