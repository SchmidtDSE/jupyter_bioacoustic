/**
 * @jest-environment jsdom
 *
 * FormPanel submits (H11): a double-click writes once, and a multibox submit is ONE
 * kernel call carrying every box (no partial saves).
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';

const ROW = { id: 7, start_time: 0, end_time: 5 };

/** Fake kernel: records write calls; each write resolves only when release() is called. */
function fakeKernel() {
  const writes: string[] = [];
  let release: () => void = () => {};
  const kernel: any = {
    exec: (code: string) => {
      if (!code.includes('write_output_rows')) return Promise.resolve('[]');
      writes.push(code);
      return new Promise<string>(resolve => { release = () => resolve('ok'); });
    },
  };
  return { kernel, writes, release: () => release() };
}

async function panel(kernel: any, form: any): Promise<FormPanel> {
  const p = new FormPanel(kernel);
  p.setContext({
    formConfig: form, rows: [ROW], duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await p.build();
  p.updateFromRow(ROW);
  return p;
}

function payloadRows(code: string): any[] {
  const m = code.match(/_j\.loads\('(.*)'\)/);
  return JSON.parse(m![1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')).rows;
}

describe('FormPanel submit (H11)', () => {
  it('writes once when submit is triggered twice', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, { form: [{ textbox: { label: 'notes' } }] });
    const first = (p as any)._onVerify();
    const second = (p as any)._onVerify();             // double-click while first is in flight
    k.release();
    await Promise.all([first, second]);
    expect(k.writes).toHaveLength(1);
  });

  it('saves every multibox box in one call', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      annotation: { tools: ['multibox'] },
      form: [{ textbox: { label: 'notes', default: 'n' } }],
    });
    p.addMultiboxEntry(0, 1, 100, 200);
    p.addMultiboxEntry(1, 2, 300, 400);
    p.addMultiboxEntry(2, 3, 500, 600);
    const done = (p as any)._onVerify();
    k.release();
    await done;
    expect(k.writes).toHaveLength(1);
    const rows = payloadRows(k.writes[0]);
    expect(rows.map(r => [r.start_time, r.end_time, r.min_frequency, r.max_frequency]))
      .toEqual([[0, 1, 100, 200], [1, 2, 300, 400], [2, 3, 500, 600]]);
    expect(rows.every(r => r.notes === 'n')).toBe(true);
  });
});

describe('FormPanel sync button', () => {
  it('is busy while syncing and usable again afterwards', async () => {
    const k = fakeKernel();
    const p = new FormPanel(k.kernel);
    p.setContext({
      formConfig: { form: [{ textbox: { label: 'notes' } }] }, rows: [ROW], duplicateEntries: true,
      outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
      syncConfig: { uri: 's3://b/out/', button: 'Push' },
    });
    await p.build();
    const btn = (p as any)._syncBtn as HTMLButtonElement;
    let requested = 0;
    p.syncRequested.connect(() => requested++);
    btn.click();
    await Promise.resolve();
    expect(requested).toBe(1);
    expect([btn.disabled, btn.textContent]).toEqual([true, 'Syncing…']);
    p.setSyncBusy(false);                                // what the widget does when sync ends
    expect([btn.disabled, btn.textContent, btn.style.opacity]).toEqual([false, 'Push', '1']);
  });
});
