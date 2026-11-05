/**
 * @jest-environment jsdom
 *
 * FormPanel multiselects ("tags"): picking and removing tags, required / max, the stored
 * list or one-hot columns, per-row reset, source_value prefill and per-box tags.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';

const ROW = { id: 7, start_time: 0, end_time: 5, model_tags: '["cat"]' };
const ROW2 = { id: 8, start_time: 5, end_time: 9, model_tags: '' };
const ITEMS = ['owl', 'cat', 'generator'];

/** Fake kernel: records write payloads and resolves at once. */
function fakeKernel() {
  const writes: string[] = [];
  const kernel: any = {
    exec: (code: string) => {
      if (code.includes('write_output_rows')) writes.push(code);
      return Promise.resolve(code.includes('write_output_rows') ? 'ok' : '[]');
    },
  };
  return { kernel, writes };
}

async function panel(
  kernel: any, form: any, rows: any[] = [ROW], duplicateEntries = true,
): Promise<FormPanel> {
  const p = new FormPanel(kernel);
  document.body.appendChild(p.element);              // required checks skip detached inputs
  p.setContext({
    formConfig: form, rows, duplicateEntries,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await p.build();
  p.updateFromRow(rows[0]);
  return p;
}

function payloadRows(code: string): any[] {
  const m = code.match(/_j\.loads\('(.*)'\)/);
  return JSON.parse(m![1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')).rows;
}

/** Pick ``value`` in the n-th select of ``root`` (as a user would). */
function pick(root: HTMLElement, value: string, n = 0): void {
  const sel = root.querySelectorAll('select')[n] as HTMLSelectElement;
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
}

const tags = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-tag]')].map(t => t.dataset.tag);

const submitBtn = (p: FormPanel) => (p as any)._submitBtns[0] as HTMLButtonElement;

describe('FormPanel multiselect', () => {
  it('adds tags, removes them with ×, and needs one when required', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ multiselect: { label: 'sources', required: true, items: ITEMS } }],
    });
    expect(submitBtn(p).disabled).toBe(true);
    pick(p.element, 'generator');
    pick(p.element, 'owl');
    expect(tags(p.element)).toEqual(['generator', 'owl']);
    expect(submitBtn(p).disabled).toBe(false);
    (p.element.querySelector('[data-tag="generator"] button') as HTMLButtonElement).click();
    expect(tags(p.element)).toEqual(['owl']);
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[0])[0].sources).toEqual(['owl']);
  });

  it('writes the list in item order', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, { form: [{ multiselect: { label: 'sources', items: ITEMS } }] });
    pick(p.element, 'generator');
    pick(p.element, 'owl');
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[0])[0].sources).toEqual(['owl', 'generator']);
  });

  it('writes one column per item for format: columns', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ multiselect: { label: 'sources', items: ITEMS, output: { format: 'columns' } } }],
    });
    pick(p.element, 'cat');
    await (p as any)._onVerify();
    const row = payloadRows(k.writes[0])[0];
    expect(row).toMatchObject({ sources_owl: false, sources_cat: true, sources_generator: false });
    expect('sources' in row).toBe(false);
  });

  it('stops adding at max', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ multiselect: { label: 'sources', max: 1, items: ITEMS } }],
    });
    pick(p.element, 'owl');
    expect(p.element.querySelector('select')!.disabled).toBe(true);
    pick(p.element, 'cat');
    expect(tags(p.element)).toEqual(['owl']);
  });

  it('prefills from source_value and resets for the next row', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ multiselect: { label: 'sources', source_value: 'model_tags', items: ITEMS } }],
    }, [ROW, ROW2]);
    expect(tags(p.element)).toEqual(['cat']);
    pick(p.element, 'owl');
    p.updateFromRow(ROW2);
    expect(tags(p.element)).toEqual([]);
    expect(p.getFormValue('sources')).toEqual([]);
  });

  it('keeps tags per multibox box', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      annotation: { tools: ['multibox'], form: 'box_form' },
      dynamic_forms: { box_form: [{ multiselect: { label: 'sources', items: ITEMS } }] },
    });
    p.addMultiboxEntry(0, 1, 100, 200);
    p.addMultiboxEntry(1, 2, 300, 400);
    await (p as any)._formWork;
    pick(p.element, 'owl', 0);                         // one tool: no tool dropdown
    pick(p.element, 'cat', 1);
    pick(p.element, 'generator', 1);
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[0]).map(r => r.sources)).toEqual([['owl'], ['cat', 'generator']]);
  });

  it('shows saved tags in the reviewed view', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ multiselect: { label: 'sources', items: ITEMS } }],
    }, [ROW], false);
    pick(p.element, 'cat');
    pick(p.element, 'owl');
    await (p as any)._onVerify();
    p.updateFromRow(ROW);
    expect(p.isShowingReviewedView()).toBe(true);
    expect(p.element.textContent).toContain('owl, cat');
  });

  it('keeps working as the annotation tool changes', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      annotation: {
        tools: ['time_select', 'bounding_box', 'multibox', { fixed_duration: 3 }],
        form: 'tags',
      },
      dynamic_forms: { tags: [{ multiselect: { label: 'sources', required: true, items: ITEMS } }] },
    });
    const tool = (name: string) => pick(p.element, name, 0);   // select 0: the tool dropdown

    // time_select: one set of tags for the clip
    expect(submitBtn(p).disabled).toBe(true);
    pick(p.element, 'owl', 1);
    pick(p.element, 'cat', 1);
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[0])[0]).toMatchObject({ sources: ['owl', 'cat'], start_time: 0 });

    // bounding_box: the rebuilt tag form starts empty and is required again
    tool('bounding_box');
    await (p as any)._formWork;
    expect(tags(p.element)).toEqual([]);
    expect(submitBtn(p).disabled).toBe(true);
    p.setAnnotValue('startTime', 1);
    p.setAnnotValue('endTime', 2);
    p.setAnnotValue('minFreq', 100);
    p.setAnnotValue('maxFreq', 900);
    pick(p.element, 'generator', 1);
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[1])[0])
      .toMatchObject({ sources: ['generator'], min_frequency: 100, max_frequency: 900 });

    // multibox: tags per box, one row each
    tool('multibox');
    await (p as any)._formWork;
    p.addMultiboxEntry(0, 1, 100, 200);
    p.addMultiboxEntry(1, 2, 300, 400);
    await (p as any)._formWork;
    pick(p.element, 'owl', 1);
    expect(submitBtn(p).disabled).toBe(true);            // the second box has no tags yet
    pick(p.element, 'generator', 2);
    expect(submitBtn(p).disabled).toBe(false);
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[2]).map(r => r.sources)).toEqual([['owl'], ['generator']]);

    // fixed_duration: back to one set of tags
    tool('fixed_duration');
    await (p as any)._formWork;
    pick(p.element, 'cat', 1);
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[3])[0].sources).toEqual(['cat']);
  });
});
