/**
 * Pure form helpers under sections/form: select items, annotation config, form config,
 * progress text / accuracy, reviewed annotation.
 *
 * License: BSD 3-Clause
 */
import { parseAnnotationConfig, parseFixedDuration } from '../sections/form/annotationConfig';
import { asElementList, requiredColumns } from '../sections/form/formConfig';
import { accuracyPercent, formatProgress } from '../sections/form/progress';
import { reviewedAnnotation } from '../sections/form/reviewed';
import {
  hasExactItem, loadRawSelectItems, notAvailableItem, parseSelectItems, selectItemOptions,
} from '../sections/form/selectItems';

describe('select items', () => {
  const noFile = async () => [];

  it('normalizes list entries', async () => {
    const raw = await loadRawSelectItems(
      ['a', { label: 'B', value: 'b', form: 'f' }, { k: 'K' }, 3], noFile);
    expect(raw).toEqual([['a', 'a'], ['b', 'B', 'f'], ['k', 'K'], ['3', '3']]);
  });

  it('expands ranges and loads files through the loader', async () => {
    expect(await loadRawSelectItems({ min: 1, max: 3 }, noFile))
      .toEqual([['1', '1'], ['2', '2'], ['3', '3']]);
    const loader = jest.fn(async () => [['x', 'X']] as any);
    await loadRawSelectItems({ path: 'p.csv', value: 'v', label: 'l' }, loader);
    expect(loader).toHaveBeenCalledWith('p.csv', 'v', 'l');
  });

  it('parses selected:: defaults and prepends not_available', () => {
    const { items, selectedDefault } = parseSelectItems(
      [['a', 'A'], ['selected::b', 'selected::B']], true);
    expect(items.map(i => [i.val, i.label, i.isDefault])).toEqual([
      ['not-available', 'not-available', false], ['a', 'A', false], ['b', 'B', true],
    ]);
    expect(selectedDefault).toBe('b');
  });

  it('reads not_available forms and option flags', () => {
    expect(notAvailableItem('n/a')).toEqual(['n/a', 'n/a']);
    expect(notAvailableItem({ label: 'None' })).toEqual(['None', 'None']);
    expect(notAvailableItem(false)).toBeNull();
    expect(selectItemOptions({ filter_box: true, items: [] }))
      .toEqual({ filterBox: true, customValue: false, notAvailable: undefined });
    expect(selectItemOptions(['a']).filterBox).toBe(false);
  });

  it('matches exact items case-insensitively', () => {
    const { items } = parseSelectItems([['robin', 'Robin']], undefined);
    expect(hasExactItem(items, 'ROBIN')).toBe(true);
    expect(hasExactItem(items, 'rob')).toBe(false);
  });
});

describe('parseAnnotationConfig', () => {
  it('defaults to time_select on start_time', () => {
    const { config, columns } = parseAnnotationConfig({});
    expect(config.tools).toEqual(['time_select']);
    expect(config.startTime).toEqual({ col: 'start_time', sourceValue: 'start_time' });
    expect(columns).toEqual(['start_time']);
  });

  it('keeps configured columns and adds the ones the tools need', () => {
    const { config, columns } = parseAnnotationConfig({
      start_time: 't0', tools: ['bounding_box', { fixed_duration: { initial_window: 2, max: 5 } }],
      form: 'box_form',
    });
    expect(columns).toEqual(['t0', 'end_time', 'min_frequency', 'max_frequency']);
    expect(config.tools).toEqual(['bounding_box', 'fixed_duration']);
    expect(config.fixedDuration).toMatchObject({ value: 2, editable: true, max: 5 });
    expect(config.form).toBe('box_form');
  });

  it('parses fixed-duration shapes', () => {
    expect(parseFixedDuration(3)).toEqual({ value: 3, editable: false });
    expect(parseFixedDuration({})).toMatchObject({ value: 1, editable: false });
    expect(parseFixedDuration('x')).toBeNull();
  });
});

describe('form config', () => {
  it('turns mapping sections into element lists', () => {
    expect(asElementList({ a: 1, b: 2 })).toEqual([{ a: 1 }, { b: 2 }]);
    expect(asElementList('x')).toBeNull();
  });

  it('lists required columns', () => {
    expect(requiredColumns([
      { select: { label: 'sp', required: true } }, { textbox: { column: 'n' } },
      { number: { required: true } },
    ])).toEqual(['sp', 'number']);
  });
});

describe('progress', () => {
  it('formats session / total / accuracy', () => {
    expect(formatProgress(0, 3, 10, null)).toBe('total 3/10');
    expect(formatProgress(2, 30, 10, 50)).toBe('session 2/10 · total 12/10 · accuracy 50%');
  });

  it('computes accuracy by value or truthiness', () => {
    const rows = [{ ok: 'yes' }, { ok: 'no' }, { ok: 'YES' }, { ok: '' }];
    expect(accuracyPercent(rows, { column: 'ok', value: null })).toBe(50);
    expect(accuracyPercent(rows, { column: 'ok', value: 'no' })).toBe(25);
    expect(accuracyPercent([], { column: 'ok', value: null })).toBeNull();
  });
});

describe('reviewedAnnotation', () => {
  const ac = parseAnnotationConfig({ tools: ['multibox'] }).config;
  const box = (s: number) => ({ start_time: s, end_time: s + 1, min_frequency: 100, max_frequency: 200 });

  it('several boxed rows are multibox boxes', () => {
    const r = reviewedAnnotation([box(0), box(2)], ac);
    expect(r.tool).toBe('multibox');
    expect(r.boxes.map(b => b.startTime)).toEqual([0, 2]);
  });

  it('one boxed row is a bounding box; times only is start/end', () => {
    expect(reviewedAnnotation([box(1)], ac)).toMatchObject({
      tool: 'bounding_box', values: { start_time: 1, end_time: 2, min_frequency: 100 },
    });
    expect(reviewedAnnotation([{ start_time: '1', end_time: '2' }], ac).tool)
      .toBe('start_end_time_select');
    expect(reviewedAnnotation([{ start_time: 1 }], null).tool).toBe('');
  });
});
