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
});
