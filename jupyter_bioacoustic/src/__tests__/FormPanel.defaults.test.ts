/**
 * @jest-environment jsdom
 *
 * FormPanel keeps documented defaults on every row (H10): textbox/select `default:`,
 * `selected::` items, number `value`, and checkbox `unchecked_value`.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';

const FORM = {
  form: [
    { textbox: { label: 'notes', default: 'n/a' } },
    { select: { label: 'species', items: ['owl', 'selected::wren', 'hawk'] } },
    { select: { label: 'call', items: ['song', 'alarm'], default: 'alarm' } },
    { checkbox: { label: 'confident', checked_value: 'yes', unchecked_value: 'no' } },
    { checkbox: { label: 'flag', default: true, checked_form: 'why' } },
    { number: { label: 'count', value: 3 } },
  ],
  why: [{ textbox: { label: 'reason' } }],
};
const ROWS = [{ id: 1, start_time: 0, end_time: 1 }, { id: 2, start_time: 1, end_time: 2 }];

async function builtPanel(): Promise<FormPanel> {
  const kernel: any = { exec: async () => '[]' };
  const panel = new FormPanel(kernel);
  panel.setContext({
    formConfig: FORM, rows: ROWS, duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await panel.build();
  return panel;
}

function input(panel: FormPanel, col: string): any {
  return (panel as any)._inputRefs.get(col);
}

const EXPECTED = { notes: 'n/a', species: 'wren', call: 'alarm', confident: 'no', flag: true, count: 3 };

describe('FormPanel defaults (H10)', () => {
  it('shows and records defaults after build', async () => {
    const panel = await builtPanel();
    for (const [col, value] of Object.entries(EXPECTED)) {
      expect(panel.getFormValue(col)).toBe(value);
    }
    expect(input(panel, 'notes').value).toBe('n/a');
    expect(input(panel, 'call').value).toBe('alarm');
  });

  it('restores defaults on every row, after edits', async () => {
    const panel = await builtPanel();
    panel.updateFromRow(ROWS[0]);
    input(panel, 'notes').value = 'typed';
    input(panel, 'notes').dispatchEvent(new Event('input'));
    input(panel, 'confident').checked = true;
    input(panel, 'confident').dispatchEvent(new Event('change'));
    expect(panel.getFormValue('confident')).toBe('yes');

    panel.updateFromRow(ROWS[1]);
    for (const [col, value] of Object.entries(EXPECTED)) {
      expect(panel.getFormValue(col)).toBe(value);
    }
    expect(input(panel, 'notes').value).toBe('n/a');
    expect(input(panel, 'species').value).toBe('wren');
    expect(input(panel, 'count').value).toBe('3');
  });

  it("re-reveals a default-checked checkbox's form section on each row", async () => {
    const panel = await builtPanel();
    panel.updateFromRow(ROWS[0]);
    expect((panel as any)._namedSections.get('why').style.display).toBe('flex');
  });
});
