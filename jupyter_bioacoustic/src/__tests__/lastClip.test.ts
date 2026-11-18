/**
 * @jest-environment jsdom
 *
 * Issue 14: without duplicate entries a submit replaces the clip's earlier entry (and does
 * not count again), and the form can show an "all done" notice that the next row removes.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';
import { writeOutputRows } from '../python';

const ROWS = [{ id: 1, start_time: 0, end_time: 5 }, { id: 2, start_time: 5, end_time: 9 }];

function fakeKernel() {
  const writes: string[] = [];
  const kernel: any = {
    exec: (code: string) => {
      if (code.includes('write_output_rows')) writes.push(code);
      return Promise.resolve('[]');
    },
  };
  return { kernel, writes };
}

async function panel(duplicateEntries: boolean, kernel: any): Promise<FormPanel> {
  const p = new FormPanel(kernel);
  document.body.appendChild(p.element);
  p.setContext({
    formConfig: { title: { value: 'R', progress_tracker: true }, form: [{ textbox: { label: 'notes' } }] },
    rows: ROWS, duplicateEntries, outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'detection_id',
  });
  await p.build();
  p.updateFromRow(ROWS[0]);
  return p;
}

const payload = (code: string) =>
  JSON.parse(code.match(/_j\.loads\('(.*)'\)/)![1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));

describe('issue 14: one entry per clip', () => {
  it('writeOutputRows passes replace to the kernel', () => {
    const code = writeOutputRows('o.csv', [{ id: 1 }], { column: 'id', value: '1' });
    expect(payload(code).replace).toEqual({ column: 'id', value: '1' });
    expect(code).toContain("_p['replace']");
    expect(payload(writeOutputRows('o.csv', [{ id: 1 }])).replace).toBeNull();
  });

  it('without duplicate entries a submit replaces the clip\'s entry', async () => {
    const k = fakeKernel();
    const p = await panel(false, k.kernel);
    await (p as any)._onVerify();
    expect(payload(k.writes[0]).replace).toEqual({ column: 'detection_id', value: '1' });
  });

  it('with duplicate entries it appends', async () => {
    const k = fakeKernel();
    const p = await panel(true, k.kernel);
    await (p as any)._onVerify();
    expect(payload(k.writes[0]).replace).toBeNull();
  });

  it('a re-submit (replacement) does not count again', async () => {
    const k = fakeKernel();
    const p = await panel(false, k.kernel);
    await (p as any)._onVerify();
    (p as any)._applyRow(ROWS[0]);           // force the form back onto the same clip
    await (p as any)._onVerify();
    expect((p as any)._sessionCount).toBe(1);
  });

  it('showNotice sits below the title; the next row removes it', async () => {
    const p = await panel(true, fakeKernel().kernel);
    const go = jest.fn();
    p.showNotice('✓ All done', { label: 'Go', onClick: go });
    const notice = p.element.querySelector('[data-form-notice]') as HTMLElement;
    expect(notice.previousElementSibling!.hasAttribute('data-form-heading')).toBe(true);
    (notice.querySelector('button') as HTMLButtonElement).click();
    expect(go).toHaveBeenCalled();
    p.updateFromRow(ROWS[1]);
    expect(p.element.querySelector('[data-form-notice]')).toBeNull();
  });
});
