/**
 * Multiselect ("tags") parsing, selection rules and output encoding.
 *
 * License: BSD 3-Clause
 */
import {
  addLabel, decodeColumns, decodeMultiselect, encodeMultiselect, encodeRow, multiselectItemsConfig,
  prepareMultiselect, removeLabel, selectionFull, selectionValid,
} from '../sections/form/multiselect';

const RAW: [string, string][] = [['owl', 'Owl'], ['cat', 'Cat'], ['generator', 'Generator']];

describe('multiselect items config', () => {
  it('loads the id column as the value and the value column as the label', () => {
    expect(multiselectItemsConfig({ path: 'labels.csv', value: 'common_name', id: 'idx' }))
      .toEqual({ path: 'labels.csv', value: 'idx', label: 'common_name', id: 'idx' });
    expect(multiselectItemsConfig({ path: 'l.csv', value: 'v', label: 'name', id: 'idx' }).label)
      .toBe('name');
  });

  it('leaves configs without an id alone', () => {
    const cfg = { path: 'labels.csv', value: 'common_name' };
    expect(multiselectItemsConfig(cfg)).toBe(cfg);
    expect(multiselectItemsConfig(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('prepareMultiselect', () => {
  it('defaults to a list in one column', () => {
    const { spec, items, initial } = prepareMultiselect({}, 'sources', RAW);
    expect(spec.format).toBe('list');
    expect(spec.delimiter).toBeNull();
    expect(spec.vocabulary).toEqual(['owl', 'cat', 'generator']);
    expect(items.map(i => i.label)).toEqual(['Owl', 'Cat', 'Generator']);
    expect(initial).toEqual([]);
  });

  it('reads the output options, bounds and defaults', () => {
    const { spec, initial } = prepareMultiselect({
      required: true, max: 2, default: ['cat'],
      output: { format: 'columns', column_prefix: 'has_', true_value: 1, false_value: 0 },
    }, 'sources', [['owl', 'Owl'], ['selected::generator', 'Generator'], ['cat', 'Cat']]);
    expect(spec).toMatchObject({
      format: 'columns', prefix: 'has_', trueValue: 1, falseValue: 0, min: 1, max: 2,
    });
    expect(initial).toEqual(['generator', 'cat']);
  });

  it('puts the not-available item first and remembers its value', () => {
    const { spec, items } = prepareMultiselect(
      { items: { not_available: { label: 'Nothing', value: 'none' } } }, 'sources', RAW);
    expect(items[0].val).toBe('none');
    expect(spec.notAvailable).toBe('none');
  });

  it('stores integer ids as numbers', () => {
    const ids: [string, string][] = [['3', 'Owl'], ['17', 'Cat']];
    expect(prepareMultiselect({ items: { path: 'p', id: 'idx' } }, 'c', ids).spec.numeric).toBe(true);
    expect(prepareMultiselect({ items: { path: 'p' } }, 'c', ids).spec.numeric).toBe(false);
    expect(prepareMultiselect({ items: { path: 'p', id: 'code' } }, 'c', [['A1', 'Owl']]).spec.numeric)
      .toBe(false);
  });
});

describe('selection rules', () => {
  const { spec } = prepareMultiselect(
    { max: 2, items: { not_available: { label: 'Nothing', value: 'none' } } }, 'sources', RAW);

  it('adds labels once, up to max', () => {
    let sel = addLabel(spec, [], 'owl');
    sel = addLabel(spec, sel, 'owl');
    expect(sel).toEqual(['owl']);
    sel = addLabel(spec, addLabel(spec, sel, 'cat'), 'generator');
    expect(sel).toEqual(['owl', 'cat']);
    expect(selectionFull(spec, sel)).toBe(true);
  });

  it('makes not-available exclusive', () => {
    expect(addLabel(spec, ['owl', 'cat'], 'none')).toEqual(['none']);
    expect(addLabel(spec, ['none'], 'owl')).toEqual(['owl']);
  });

  it('removes labels and checks the bounds', () => {
    expect(removeLabel(['owl', 'cat'], 'owl')).toEqual(['cat']);
    const required = prepareMultiselect({ required: true }, 's', RAW).spec;
    expect(selectionValid(required, [])).toBe(false);
    expect(selectionValid(required, ['owl'])).toBe(true);
    const atLeastTwo = prepareMultiselect({ min: 2 }, 's', RAW).spec;
    expect(selectionValid(atLeastTwo, ['owl'])).toBe(false);
  });
});

describe('encoding', () => {
  it('writes a list in item order with custom labels last', () => {
    const { spec } = prepareMultiselect({}, 'sources', RAW);
    expect(encodeMultiselect(spec, ['generator', 'barking dog', 'owl']))
      .toEqual({ sources: ['owl', 'generator', 'barking dog'] });
  });

  it('joins with a delimiter', () => {
    const { spec } = prepareMultiselect({ output: { delimiter: ';' } }, 'sources', RAW);
    expect(encodeMultiselect(spec, ['cat', 'owl'])).toEqual({ sources: 'owl;cat' });
  });

  it('writes numeric ids as numbers', () => {
    const { spec } = prepareMultiselect(
      { items: { path: 'p', id: 'idx' } }, 'classes', [['3', 'Owl'], ['17', 'Cat']]);
    expect(encodeMultiselect(spec, ['17', '3'])).toEqual({ classes: [3, 17] });
  });

  it('writes one column per item: no prefix and 1 / 0 by default', () => {
    const { spec } = prepareMultiselect({ output: { format: 'columns' } }, 'sources', RAW);
    expect(encodeMultiselect(spec, ['cat'])).toEqual({ owl: 0, cat: 1, generator: 0 });
    const named = prepareMultiselect({
      output: { format: 'columns', column_prefix: 'has_', true_value: true, false_value: false },
    }, 'sources', RAW).spec;
    expect(encodeMultiselect(named, ['cat']))
      .toEqual({ has_owl: false, has_cat: true, has_generator: false });
  });

  it('replaces list columns in place in a row', () => {
    const { spec } = prepareMultiselect({ output: { format: 'columns' } }, 'sources', RAW);
    const row = encodeRow(
      { id: 1, sources: ['owl'], notes: 'x' }, new Map([['sources', spec]]));
    expect(Object.keys(row)).toEqual(['id', 'owl', 'cat', 'generator', 'notes']);
    expect(row.owl).toBe(1);
  });
});

describe('decoding stored values', () => {
  it('reads lists, JSON, delimited and single values', () => {
    expect(decodeMultiselect(['a', 2], null)).toEqual(['a', '2']);
    expect(decodeMultiselect('["owl", "cat"]', null)).toEqual(['owl', 'cat']);
    expect(decodeMultiselect('owl; cat', ';')).toEqual(['owl', 'cat']);
    expect(decodeMultiselect('owl', null)).toEqual(['owl']);
    expect(decodeMultiselect('', null)).toEqual([]);
    expect(decodeMultiselect(null, ';')).toEqual([]);
  });

  it('reads one-hot columns', () => {
    const { spec } = prepareMultiselect({ output: { format: 'columns' } }, 'sources', RAW);
    expect(decodeColumns(spec, { owl: '1', cat: '0', generator: 1 })).toEqual(['owl', 'generator']);
  });
});
