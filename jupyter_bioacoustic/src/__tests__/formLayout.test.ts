/**
 * @jest-environment jsdom
 *
 * Layout containers (row / column / grid): parsing / styling (form/layout) and how FormPanel
 * builds them — nesting, revealed dynamic forms placed after the outermost container,
 * per-box (multibox) forms flattening them.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';
import { flattenLayout, layoutStyle, parseLayout } from '../sections/form/layout';

const ROW = { id: 1, start_time: 0, end_time: 5 };

async function panel(form: any): Promise<FormPanel> {
  const kernel: any = { exec: () => Promise.resolve('[]') };
  const p = new FormPanel(kernel);
  document.body.appendChild(p.element);
  p.setContext({
    formConfig: form, rows: [ROW], duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await p.build();
  p.updateFromRow(ROW);
  return p;
}

const btn = (value: number) => ({ button: { column: 'c', value, icon: String(value) } });

describe('parseLayout', () => {
  it('takes a list or {items, gap, align, columns}', () => {
    expect(parseLayout('row', [btn(1)])).toMatchObject({ kind: 'row', gap: 8, align: 'start' });
    expect(parseLayout('grid', { columns: 3, gap: '1em', align: 'center', items: [btn(1)] }))
      .toMatchObject({ kind: 'grid', columns: 3, gap: '1em', align: 'center' });
  });

  it('a grid without columns is one row of its items; bad align is start', () => {
    expect(parseLayout('grid', { items: [btn(1), btn(2)] })!.columns).toBe(2);
    expect(parseLayout('row', { align: 'middle', items: [] })!.align).toBe('start');
  });

  it('is null for other types or without items', () => {
    expect(parseLayout('button', [])).toBeNull();
    expect(parseLayout('row', 'nope')).toBeNull();
  });

  it('styles', () => {
    expect(layoutStyle(parseLayout('grid', { columns: 3, items: [] })!))
      .toContain('grid-template-columns:repeat(3,max-content)');
    expect(layoutStyle(parseLayout('row', { align: 'end', gap: 4, items: [] })!))
      .toContain('justify-content:flex-end;gap:4px;');
    expect(layoutStyle(parseLayout('column', [])!)).toContain('flex-direction:column');
  });

  it('flattenLayout removes containers recursively, in order', () => {
    const els = [{ text: 'a' }, { row: [btn(1), { grid: { columns: 2, items: [btn(2)] } }] }];
    expect(flattenLayout(els).map(e => Object.keys(e)[0])).toEqual(['text', 'button', 'button']);
  });
});

describe('FormPanel layout containers', () => {
  it('a column of rows of 3 / 2 / 3 buttons', async () => {
    const p = await panel({ form: [{ column: [
      { row: [btn(1), btn(2), btn(3)] },
      { row: [btn(4), btn(5)] },
      { row: [btn(6), btn(7), btn(8)] },
    ] }] });
    const col = p.element.querySelector('.jp-BA-layout-column')!;
    const rows = [...col.children].filter(c => c.classList.contains('jp-BA-layout-row'));
    expect(rows.map(r => r.querySelectorAll('button').length)).toEqual([3, 2, 3]);
  });

  it('a grid holds its items directly; buttons in it still work', async () => {
    const p = await panel({ form: [{ grid: { columns: 3, items: [1, 2, 3, 4, 5, 6, 7, 8].map(btn) } }] });
    const grid = p.element.querySelector('.jp-BA-layout-grid') as HTMLElement;
    expect(grid.style.display).toBe('grid');
    expect(grid.querySelectorAll(':scope > button')).toHaveLength(8);
    (grid.children[4] as HTMLButtonElement).click();
    expect(p.getFormValue('c')).toBe(5);
  });

  it('other inputs work inside containers', async () => {
    const p = await panel({ form: [{ row: [
      { checkbox: { label: 'ok', checked_value: 'y', unchecked_value: 'n' } },
      { textbox: { label: 'notes' } },
      { select: { label: 'sp', items: ['owl', 'cat'] } },
    ] }] });
    const row = p.element.querySelector('.jp-BA-layout-row')!;
    expect(row.querySelectorAll('label')).toHaveLength(3);
    (row.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    expect(p.getFormValue('ok')).toBe('y');
  });

  it('a dynamic form revealed from inside a row goes after the outermost container', async () => {
    const p = await panel({
      form: [{ column: [{ row: [
        { select: { label: 's', items: [{ value: 'a' }, { value: 'b', form: 'more' }] } },
      ] }] }],
      dynamic_forms: { more: [{ textbox: { label: 'why' } }] },
    });
    const col = p.element.querySelector('.jp-BA-layout-column')!;
    const section = p.element.querySelector('[data-form-section="more"]')!;
    expect(col.contains(section)).toBe(false);
    expect(col.nextElementSibling).toBe(section);
  });
});
