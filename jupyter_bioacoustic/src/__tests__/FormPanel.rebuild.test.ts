/**
 * @jest-environment jsdom
 *
 * FormPanel rebuilds: overlapping async rebuilds don't duplicate or misapply, and moving
 * between rows doesn't grow the input registrations.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';

const ROWS = Array.from({ length: 10 }, (_, i) => ({ id: i, start_time: i, end_time: i + 1, sp: `s${i}` }));
const FORM = {
  annotation: { tools: ['start_end_time_select'], form: 'box_form' },
  form: [{ textbox: { label: 'notes' } }],
  box_form: [{ textbox: { label: 'species', required: true, source_value: 'sp' } }],
  dynamic_forms: { box_form: [{ textbox: { label: 'species', required: true, source_value: 'sp' } }] },
};

async function panel(): Promise<FormPanel> {
  const kernel: any = { exec: async () => '[]' };
  const p = new FormPanel(kernel);
  p.setContext({
    formConfig: FORM, rows: ROWS, duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await p.build();
  return p;
}

const sizes = (p: any) => [p._requiredInputs.length, p._sourceValueFields.length, p._inputRefs.size];

describe('FormPanel rebuilds', () => {
  it('moving through rows does not grow the input registrations', async () => {
    const p = await panel();
    p.updateFromRow(ROWS[0]);
    await (p as any)._formWork;
    const first = sizes(p);
    for (const row of ROWS) p.updateFromRow(row);
    await (p as any)._formWork;
    expect(sizes(p)).toEqual(first);
    expect(p.getFormValue('species')).toBe('s9');          // the sub-form still follows the row
  });

  it('overlapping rebuilds leave exactly one sub-form', async () => {
    const p: any = await panel();
    const real = p._buildFormSection.bind(p);
    p._buildFormSection = async (cfg: any, el: HTMLElement) => {
      await new Promise(r => setTimeout(r, 5));             // e.g. select items loaded via the kernel
      return real(cfg, el);
    };
    await Promise.all([p._rebuildAnnotFormUI(), p._rebuildAnnotFormUI()]);
    expect(p._multiboxContainer.children.length).toBe(1);
    expect(p._multiboxContainer.querySelectorAll('input').length).toBe(1);
  });

  it('rows applied while a rebuild is queued land in call order', async () => {
    const p: any = await panel();
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });   // a slow rebuild in progress
    void p._enqueue(() => gate);
    p.updateFromRow(ROWS[1]);
    p.updateFromRow(ROWS[2]);
    release();
    await p._formWork;
    expect(p._currentRow.id).toBe(2);
  });
});
