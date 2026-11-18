/**
 * @jest-environment jsdom
 *
 * Keyboard use of the form: hot key helpers (form/hotkeys), pinned select options, item
 * navigation (Tab / ← / → / Enter / Esc), hot keys scoped to the focused item, and focus
 * staying in the form after a submit.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';
import { isTypingTarget, normalizeHotKey, resolveHotKeys } from '../sections/form/hotkeys';
import { buildSelect } from '../sections/form/inputs';

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

async function panel(form: any, kernel = fakeKernel().kernel): Promise<FormPanel> {
  document.body.innerHTML = '';
  const p = new FormPanel(kernel);
  document.body.appendChild(p.element);
  p.setContext({
    formConfig: form, rows: ROWS, duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await p.build();
  p.updateFromRow(ROWS[0]);
  return p;
}

const press = (key: string, opts: KeyboardEventInit = {}) => {
  const el = (document.activeElement ?? document.body) as HTMLElement;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e);
  return e;
};
const focused = () => document.querySelector('.jp-BA-item-focus') as HTMLElement | null;
const flush = () => new Promise(r => setTimeout(r, 0));
const btn = (value: any, extra: any = {}) => ({ button: { value, icon: String(value), ...extra } });

describe('hot key helpers', () => {
  it('normalizeHotKey: one character, not a space', () => {
    expect([normalizeHotKey(1), normalizeHotKey('a'), normalizeHotKey('ab'),
      normalizeHotKey(' '), normalizeHotKey(true)]).toEqual(['1', 'a', null, null, null]);
  });

  it('resolveHotKeys matches values, then labels, in map order', () => {
    const items = [{ val: 'owl', label: 'Owl', isDefault: false }, { val: 'c', label: 'Cat', isDefault: false }];
    expect(resolveHotKeys({ 2: 'Cat', 1: 'owl', 3: 'nope' }, items).map(p => [p.key, p.item.val]))
      .toEqual([['1', 'owl'], ['2', 'c']]);
  });

  it('isTypingTarget', () => {
    const text = document.createElement('input');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    expect([isTypingTarget(text), isTypingTarget(cb), isTypingTarget(document.createElement('textarea')),
      isTypingTarget(document.createElement('select'))]).toEqual([true, false, true, false]);
  });

  it('buildSelect pins hot-keyed items in a "hot keys" group above "all"', () => {
    const items = ['a', 'b', 'c'].map(v => ({ val: v, label: v, isDefault: false }));
    const built = buildSelect({
      items, filterBox: false, customValue: false, variant: 'main', onChange: () => {},
      pinned: [{ key: '1', item: items[2] }],
    });
    const groups = [...built.select.querySelectorAll('optgroup')];
    expect(groups.map(g => g.label)).toEqual(['hot keys', 'all']);
    expect(groups[0].textContent).toBe('1 · c');
    expect(groups[1].querySelectorAll('option')).toHaveLength(3);
  });
});

describe('form keyboard navigation', () => {
  const form = {
    title: { value: 'REVIEW' },
    form: [
      { select: { label: 'sp', items: ['owl', 'cat'], hot_keys: { o: 'owl' } } },
      { row: { column: 'v', items: [btn('yes', { hot_key: '1' }), btn('no', { hot_key: '2' })] } },
      { textbox: { label: 'notes' } },
    ],
  };

  it('Tab enters at the first item and moves through items (wrapping); arrows too', async () => {
    const p = await panel(form);
    expect(p.focusForm()).toBe(true);
    expect(document.activeElement!.tagName).toBe('SELECT');
    press('Tab');
    expect(focused()!.classList.contains('jp-BA-layout')).toBe(true);
    expect(document.activeElement).toBe(focused());       // the row itself has focus
    press('ArrowRight');
    expect(document.activeElement!.tagName).toBe('INPUT');  // the textbox gets the cursor
    press('Tab');                                          // Tab leaves a textbox
    expect(focused()!.dataset.formButtons).toBe('');       // the Skip / Submit row
    press('Tab');
    expect(document.activeElement!.tagName).toBe('SELECT'); // wrapped
    press('ArrowLeft');
    expect(focused()!.dataset.formButtons).toBe('');
  });

  it('Enter steps into a container, ← / → move inside it, Esc steps back out', async () => {
    const p = await panel(form);
    p.focusForm();
    press('Tab');
    press('Enter');
    expect(document.activeElement!.textContent).toContain('yes');
    press('ArrowRight');
    expect(document.activeElement!.textContent).toContain('no');
    press('ArrowRight');                                   // stops at the end
    expect(document.activeElement!.textContent).toContain('no');
    press('Escape');
    expect(document.activeElement!.classList.contains('jp-BA-layout')).toBe(true);
  });

  it('Esc leaves a textbox to its item; arrows navigate again', async () => {
    const p = await panel(form);
    p.focusForm();
    press('ArrowLeft');                                    // wrap back to the button row
    press('ArrowLeft');                                    // the textbox
    expect(document.activeElement!.tagName).toBe('INPUT');
    press('Escape');
    expect(document.activeElement!.tagName).toBe('LABEL');
    press('ArrowLeft');
    expect(focused()!.classList.contains('jp-BA-layout')).toBe(true);
  });

  it('hot keys click buttons of the focused item; again un-presses; not from other items', async () => {
    const p = await panel(form);
    p.focusForm();
    press('1');                                            // the select is focused: no '1' there
    expect(p.getFormValue('v')).toBeNull();
    press('Tab');
    const e = press('1');
    expect(e.defaultPrevented).toBe(true);
    expect(p.getFormValue('v')).toBe('yes');
    press('2');
    expect(p.getFormValue('v')).toBe('no');
    press('2');
    expect(p.getFormValue('v')).toBeNull();
  });

  it('select hot keys pick the item', async () => {
    const p = await panel(form);
    p.focusForm();
    press('o');
    expect(p.getFormValue('sp')).toBe('owl');
  });

  it('a j / k hot key is claimed by the item (the widget never sees it)', async () => {
    const p = await panel({ form: [{ row: { column: 'v', items: [btn('a', { hot_key: 'j' })] } }] });
    const bubbled = jest.fn();
    document.body.addEventListener('keydown', bubbled);
    p.focusForm();
    press('j');
    expect(p.getFormValue('v')).toBe('a');
    expect(bubbled).not.toHaveBeenCalled();
    press('k');                                           // not a hot key: bubbles to the widget
    expect(bubbled).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', bubbled);
  });

  it('a submit hot key submits, and focus stays in the form (first item)', async () => {
    const k = fakeKernel();
    const p = await panel({
      title: { value: 'R' },
      form: [
        { textbox: { label: 'notes' } },
        { row: { column: 'v', items: [btn('yes', { hot_key: 'y', submit: true })] } },
      ],
    }, k.kernel);
    p.submitted.connect(() => p.updateFromRow(ROWS[1]));  // what the widget does
    p.focusForm();
    press('Tab');
    press('y');
    await flush();
    expect(k.writes).toHaveLength(1);
    expect(document.activeElement!.tagName).toBe('INPUT'); // the notes box: first item
  });

  it('buttons show their hot key unless show_hot_key: false', async () => {
    const p = await panel({ form: [{ row: { column: 'v', items: [
      btn('a', { hot_key: '1' }), btn('b', { hot_key: '2', show_hot_key: false }),
    ] } }] });
    const [a, b] = [...p.element.querySelectorAll('.jp-BA-layout button')] as HTMLElement[];
    expect(a.querySelector('[data-hot-key-badge]')!.textContent).toBe('1');
    expect(a.title).toContain('(1)');
    expect(b.querySelector('[data-hot-key-badge]')).toBeNull();
    expect(b.getAttribute('aria-keyshortcuts')).toBe('2');
  });

  it('text, titles and lines are not items', async () => {
    const p = await panel({ title: { value: 'T' }, form: [{ text: 'hi' }, { line: true }, { textbox: { label: 'n' } }] });
    p.focusForm();
    expect(document.activeElement!.tagName).toBe('INPUT');  // the textbox is the first item
    press('Tab');
    expect(focused()!.dataset.formButtons).toBe('');
    press('Tab');
    expect(document.activeElement!.tagName).toBe('INPUT');
  });
});
