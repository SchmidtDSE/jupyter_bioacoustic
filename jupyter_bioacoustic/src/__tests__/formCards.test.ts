/**
 * @jest-environment jsdom
 *
 * Form-builder card fields (formCards.ts) driven through a fake FormCardContext.
 *
 * License: BSD 3-Clause
 */

import { makeLabel, makeRow } from '../config_builder/dom';
import {
  FormCardContext, buildElementFields, defaultElementConfig,
} from '../config_builder/sections/formCards';

function fakeCtx(): FormCardContext & { changes: number; requested: string[] } {
  const ctx = {
    changes: 0,
    requested: [] as string[],
    changed() { ctx.changes++; },
    fieldRow(label: string, input: HTMLElement) {
      const row = makeRow();
      row.append(makeLabel(label), input);
      return row;
    },
    checkbox(label: string, checked = false) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      const row = makeRow();
      row.append(input, label);
      return { row, input };
    },
    browse() {},
    requestColumns(path: string) { ctx.requested.push(path); },
  };
  return ctx;
}

const type = (el: HTMLInputElement, value: string) => {
  el.value = value;
  el.dispatchEvent(new Event('input'));
};

describe('formCards', () => {
  it('defaultElementConfig returns a fresh config per call', () => {
    const a = defaultElementConfig('select');
    a.items.push('x');
    expect(defaultElementConfig('select').items).toEqual([]);
    expect(defaultElementConfig('annotation')).toEqual({ tools: ['start_end_time_select'] });
  });

  it('the column follows the label (slugified) until edited', () => {
    const ctx = fakeCtx();
    const card = document.createElement('div');
    const cfg = defaultElementConfig('textbox');
    buildElementFields(ctx, card, 'textbox', cfg);
    const [label, column] = Array.from(card.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    type(label, 'Call Type!');
    expect(cfg).toMatchObject({ label: 'Call Type!', column: 'call_type' });
    type(column, 'kind');
    type(label, 'Other');
    expect(cfg.column).toBe('kind');
    expect(ctx.changes).toBe(3);
  });

  it('select items from a file request that file\'s columns', () => {
    const ctx = fakeCtx();
    const cfg = { label: 'x', column: 'x', items: { path: 'data/species.csv', value: 'name' } };
    buildElementFields(ctx, document.createElement('div'), 'select', cfg);
    expect(ctx.requested).toEqual(['data/species.csv']);
  });

  it('multiselect card: bounds, an id column in file mode, and the output format fields', () => {
    const ctx = fakeCtx();
    const cfg: any = { ...defaultElementConfig('multiselect'), items: { path: 'labels.txt' } };
    const card = document.createElement('div');
    buildElementFields(ctx, card, 'multiselect', cfg);
    const field = (label: string) => [...card.querySelectorAll('div')]
      .find(row => row.firstElementChild?.textContent === label)!;
    const input = (label: string) => field(label).querySelector('input') as HTMLInputElement;

    type(input('max tags'), '3');
    expect(cfg.max).toBe(3);
    type(input('id column'), 'class_index');
    expect(cfg.items.id).toBe('class_index');
    type(input('id column'), '');
    expect('id' in cfg.items).toBe(false);

    // list: only the delimiter shows, with a hint instead of a placeholder
    expect(field('delimiter').style.display).toBe('flex');   // keeps the row's gaps
    expect(input('delimiter').placeholder).toBe('');
    expect(field('delimiter').textContent).toContain('blank: save a list');
    expect(field('true_value').style.display).toBe('none');
    const format = field('format').querySelector('select') as HTMLSelectElement;
    format.value = 'columns';
    format.dispatchEvent(new Event('change'));
    expect(field('delimiter').style.display).toBe('none');
    expect(field('true_value').style.display).toBe('flex');
    type(input('true_value'), '1');
    type(input('false_value'), 'false');
    type(input('column_prefix'), 'has_');
    expect(cfg.output)
      .toEqual({ format: 'columns', true_value: 1, false_value: false, column_prefix: 'has_' });
    type(input('column_prefix'), '');
    expect('column_prefix' in cfg.output).toBe(false);
  });

  it('multiselect card: label, then the output; list needs a column, columns has none', () => {
    const cfg: any = defaultElementConfig('multiselect');
    const card = document.createElement('div');
    buildElementFields(fakeCtx(), card, 'multiselect', cfg);
    const rows = [...card.querySelectorAll('div')]
      .filter(r => r.firstElementChild?.tagName === 'LABEL');
    const names = rows.map(r => r.firstElementChild!.textContent);
    expect(names.slice(0, 4)).toEqual(['label', 'format', 'column', 'delimiter']);
    const field = (label: string) => rows.find(r => r.firstElementChild!.textContent === label)!;
    const input = (label: string) => field(label).querySelector('input') as HTMLInputElement;

    type(input('label'), 'Sound sources');
    expect(cfg.column).toBe('sound_sources');               // list: column follows the label
    expect(field('column').textContent).toContain('required');

    const format = field('format').querySelector('select') as HTMLSelectElement;
    format.value = 'columns';
    format.dispatchEvent(new Event('change'));
    expect(field('column').style.display).toBe('none');
    expect('column' in cfg).toBe(false);
    const placeholders = ['column_prefix', 'true_value', 'false_value'].map(k => input(k).placeholder);
    expect(placeholders).toEqual(['none', '1', '0']);
    type(input('label'), 'Sources');
    expect('column' in cfg).toBe(false);                   // columns: the label sets no column

    format.value = 'list';
    format.dispatchEvent(new Event('change'));
    expect(cfg.column).toBe('sources');
    expect(input('column').value).toBe('sources');

    // vector: the column and delimiter, plus the true / false values; no prefix
    format.value = 'vector';
    format.dispatchEvent(new Event('change'));
    const visible = (label: string) => field(label).style.display === 'flex';
    expect(['column', 'delimiter', 'true_value', 'false_value'].every(visible)).toBe(true);
    expect(visible('column_prefix')).toBe(false);
    expect(cfg.column).toBe('sources');
  });

  it('select card has no id column', () => {
    const cfg: any = { ...defaultElementConfig('select'), items: { path: 'labels.txt' } };
    const card = document.createElement('div');
    buildElementFields(fakeCtx(), card, 'select', cfg);
    expect(card.textContent).not.toContain('id column');
  });
});


describe('formCards: hot keys, button switches, layout options', () => {
  const card = () => document.createElement('div');

  it('select hot keys: rows become hot_keys; empty rows are left out; pin checkbox', () => {
    const ctx = fakeCtx();
    const cfg = defaultElementConfig('select');
    const el = card();
    buildElementFields(ctx, el, 'select', cfg);
    const add = [...el.querySelectorAll('button')].find(b => b.textContent === '+ hot key')!;
    add.click();
    add.click();
    const keys = el.querySelectorAll<HTMLInputElement>('input[placeholder="key"]');
    const values = el.querySelectorAll<HTMLInputElement>('input[placeholder="item value"]');
    type(keys[0], '1');
    type(values[0], 'owl');
    expect(cfg.hot_keys).toEqual({ 1: 'owl' });          // the second row is still empty
    const pin = [...el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
      .find(i => i.parentElement!.textContent!.includes('pin hot-keyed'))!;
    pin.checked = true;
    pin.dispatchEvent(new Event('change'));
    expect(cfg.pin_hot_keys).toBe(true);
    type(values[0], '');
    expect(cfg.hot_keys).toBeUndefined();
  });

  it('button show_hot_key / highlight: on by default, unchecking writes false', () => {
    const ctx = fakeCtx();
    const cfg = defaultElementConfig('button');
    const el = card();
    buildElementFields(ctx, el, 'button', cfg);
    const box = (text: string) => [...el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
      .find(i => i.parentElement!.textContent!.includes(text))!;
    expect(box('show hot key badge').checked).toBe(true);
    box('pressed ring').checked = false;
    box('pressed ring').dispatchEvent(new Event('change'));
    expect(cfg.highlight).toBe(false);
    box('pressed ring').checked = true;
    box('pressed ring').dispatchEvent(new Event('change'));
    expect('highlight' in cfg).toBe(false);
  });

  it('layout options: grid columns, align, unique, button column', () => {
    const ctx = fakeCtx();
    const cfg = defaultElementConfig('grid');
    expect(cfg).toEqual({ columns: 2 });
    const el = card();
    buildElementFields(ctx, el, 'grid', cfg);
    const [align, unique] = [...el.querySelectorAll('select')];
    align.value = 'center';
    align.dispatchEvent(new Event('change'));
    unique.value = 'false';
    unique.dispatchEvent(new Event('change'));
    type(el.querySelector<HTMLInputElement>('input[placeholder="column (for buttons inside)"]')!, 'tags');
    expect(cfg).toMatchObject({ columns: 2, align: 'center', unique: false, column: 'tags' });
    unique.value = '(per column)';
    unique.dispatchEvent(new Event('change'));
    expect('unique' in cfg).toBe(false);
  });
});
