/**
 * @jest-environment jsdom
 *
 * The ``button`` form element: config parsing (form/buttons) and FormPanel behaviour —
 * radio-like column values, submit buttons, required columns and per-row reset.
 *
 * License: BSD 3-Clause
 */

import { FormPanel } from '../sections/FormPanel';
import {
  BUILTIN_ICONS, DEFAULT_BUTTON_SIZE, builtinIcon, formButtonStyle, isDirectImageSrc,
  nextToggleIndex, parseFormButton, toggleStart,
} from '../sections/form/buttons';

const ROWS = [{ id: 1, start_time: 0, end_time: 5 }, { id: 2, start_time: 5, end_time: 9 }];

/** Fake kernel: records writes (resolved at once) and image reads. */
function fakeKernel() {
  const writes: string[] = [];
  const images: string[] = [];
  const kernel: any = {
    exec: (code: string) => {
      if (code.includes('write_output_rows')) writes.push(code);
      if (code.includes('image_data_url')) {
        images.push(code);
        return Promise.resolve('data:image/png;base64,AAAA\n');
      }
      return Promise.resolve('[]');
    },
  };
  return { kernel, writes, images };
}

async function panel(kernel: any, form: any): Promise<FormPanel> {
  const p = new FormPanel(kernel);
  document.body.appendChild(p.element);           // required inputs only count when connected
  p.setContext({
    formConfig: form, rows: ROWS, duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await p.build();
  p.updateFromRow(ROWS[0]);
  return p;
}

function payloadRows(code: string): any[] {
  const m = code.match(/_j\.loads\('(.*)'\)/);
  return JSON.parse(m![1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')).rows;
}

/** The form buttons (not the submission row's), in order. */
function formButtons(p: FormPanel): HTMLButtonElement[] {
  return [...p.element.querySelectorAll('button')].filter(
    b => !b.closest('[data-form-buttons]') && !b.dataset.collapseToggle) as HTMLButtonElement[];
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('parseFormButton', () => {
  it('defaults to a 25px square, no column, no submit', () => {
    const b = parseFormButton({ icon: 'go', submit: true });
    expect(b).toMatchObject({
      column: null, submit: true, toggle: null, hasOwnFace: true, highlight: true, hasInitialValue: false,
      width: DEFAULT_BUTTON_SIZE, height: DEFAULT_BUTTON_SIZE,
    });
    expect(b.face.icon).toBe('go');
  });

  it('size sets both sides; width / height override it', () => {
    expect(parseFormButton({ icon: 'x', size: 30 })).toMatchObject({ width: 30, height: 30 });
    expect(parseFormButton({ icon: 'x', size: 30, width: 80 }))
      .toMatchObject({ width: 80, height: 30 });
  });

  it('an image replaces the icon', () => {
    expect(parseFormButton({ icon: 'x', image: 'owl.png' }).face)
      .toMatchObject({ icon: '', image: 'owl.png' });
  });

  it('jba: built-ins have a symbol and colours; color / background override them', () => {
    const check = parseFormButton({ icon: 'jba:check' }).face;
    expect(check).toMatchObject({
      icon: BUILTIN_ICONS.check.symbol, color: BUILTIN_ICONS.check.color,
      background: BUILTIN_ICONS.check.background,
    });
    expect(parseFormButton({ icon: 'jba:x', background: '#000' }).face)
      .toMatchObject({ icon: '✗', color: BUILTIN_ICONS.x.color, background: '#000' });
    expect(builtinIcon('jba:nope')).toBeNull();
    expect(builtinIcon('check')).toBeNull();
  });

  it('reads initial_value (even null)', () => {
    expect(parseFormButton({ icon: 'x', initial_value: null }).hasInitialValue).toBe(true);
  });

  it('pressed_* keys make the pressed look; the rest falls back to the normal look', () => {
    const plain = parseFormButton({ icon: 'A', color: '#111' });
    expect(plain.pressedFace).toEqual(plain.face);
    const bg = parseFormButton({ icon: 'A', color: '#111', pressed_background: '#0f0' }).pressedFace;
    expect(bg).toMatchObject({ icon: 'A', color: '#111', background: '#0f0' });
    const swap = parseFormButton({ icon: 'jba:unchecked', pressed_icon: 'jba:checked' }).pressedFace;
    expect(swap).toMatchObject({
      icon: BUILTIN_ICONS.checked.symbol, background: BUILTIN_ICONS.checked.background,
    });
    const text = parseFormButton({ icon: 'off', background: '#222', pressed_icon: 'on' }).pressedFace;
    expect(text).toMatchObject({ icon: 'on', background: '#222' });
    expect(parseFormButton({ image: 'a.png', pressed_image: 'b.png' }).pressedFace.image).toBe('b.png');
    expect(parseFormButton({ icon: 'x', highlight: false }).highlight).toBe(false);
  });

  it('a toggle reads its states; states inherit the button colours; no submit', () => {
    const b = parseFormButton({
      color: '#111', submit: true,
      toggle: [{ value: 1, icon: 'jba:checked' }, { value: 0, icon: 'off', color: '#222' }],
    });
    expect(b.submit).toBe(false);
    expect(b.toggle!.map(st => [st.value, st.face.icon, st.face.color]))
      .toEqual([[1, '☑', '#111'], [0, 'off', '#222']]);
  });

  it('toggleStart: first state, the initial_value state, or unset', () => {
    const states = [{ value: 1, icon: 'a' }, { value: 0, icon: 'b' }];
    expect(toggleStart(parseFormButton({ toggle: states }))).toEqual({ index: 0, value: 1 });
    expect(toggleStart(parseFormButton({ toggle: states, initial_value: 0 })))
      .toEqual({ index: 1, value: 0 });
    expect(toggleStart(parseFormButton({ toggle: states, initial_value: null })))
      .toEqual({ index: -1, value: null });
    expect(toggleStart(parseFormButton({ toggle: states, icon: '?' })))
      .toEqual({ index: -1, value: null });
  });

  it('nextToggleIndex wraps and leaves unset for the first state', () => {
    const spec = parseFormButton({ toggle: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] });
    expect([-1, 0, 1, 2].map(i => nextToggleIndex(spec, i))).toEqual([0, 1, 2, 0]);
  });

  it('only http(s) and data URLs are used as img src directly', () => {
    expect(isDirectImageSrc('https://x/a.png')).toBe(true);
    expect(isDirectImageSrc('data:image/png;base64,AA')).toBe(true);
    expect(isDirectImageSrc('icons/a.png')).toBe(false);
  });

  it('styles: size, colours, selection border, dimming', () => {
    const spec = parseFormButton({ icon: 'jba:check' });
    const css = formButtonStyle(spec, spec.face);
    expect(css).toContain('width:25px;height:25px;');
    expect(css).toContain(`background:${BUILTIN_ICONS.check.background}`);
    expect(formButtonStyle(spec, spec.face, { pressed: true })).toContain('box-shadow:0 0 0 2px #ffffff');
    expect(formButtonStyle(spec, spec.face, { faded: true })).toContain('opacity:0.5');
    expect(formButtonStyle(spec, spec.face, { dimmed: true })).toContain('opacity:0.45');
  });
});

describe('FormPanel button element', () => {
  const yesNo = {
    form: [
      { button: { column: 'call', value: 'yes', icon: '✓' } },
      { button: { column: 'call', value: 'no', icon: '✗' } },
    ],
  };

  it('a click sets the column; the column\'s buttons act like radio buttons', async () => {
    const p = await panel(fakeKernel().kernel, yesNo);
    const [yes, no] = formButtons(p);
    yes.click();
    expect(p.getFormValue('call')).toBe('yes');
    no.click();
    expect(p.getFormValue('call')).toBe('no');
    expect(no.getAttribute('aria-pressed')).toBe('true');
    expect(no.style.boxShadow).not.toBe('');
    expect(yes.getAttribute('aria-pressed')).toBe('false');
    expect(yes.style.opacity).toBe('0.5');               // faded: another in its group is pressed
    no.click();                                        // clicking the selected one clears it
    expect(p.getFormValue('call')).toBeNull();
  });

  it('is reset when the next row is shown', async () => {
    const p = await panel(fakeKernel().kernel, yesNo);
    formButtons(p)[0].click();
    p.updateFromRow(ROWS[1]);
    expect(p.getFormValue('call')).toBeNull();
  });

  it('submit writes its value and emits submitted', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ button: { column: 'call', value: 'yes', icon: '✓', submit: true } }],
    });
    const submitted = jest.fn();
    p.submitted.connect(submitted);
    formButtons(p)[0].click();
    await flush();
    expect(k.writes).toHaveLength(1);
    expect(payloadRows(k.writes[0])[0].call).toBe('yes');
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it('a submit button waits for other required inputs, but not its own column', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [
        { textbox: { label: 'notes', required: true } },
        { button: { column: 'call', value: 'yes', icon: '✓', submit: true, required: true } },
      ],
    });
    const [btn] = formButtons(p);
    expect(btn.disabled).toBe(true);                   // notes is empty
    const notes = p.element.querySelector('input[type=text]') as HTMLInputElement;
    notes.value = 'hi';
    notes.dispatchEvent(new Event('input'));
    expect(btn.disabled).toBe(false);                  // its own required column doesn't block it
  });

  it('a required button column blocks the Submit button until one is picked', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ button: { column: 'call', value: 'yes', icon: '✓', required: true } }],
    });
    const submit = [...p.element.querySelectorAll('[data-form-buttons] button')]
      .find(b => b.textContent?.includes('Submit')) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    formButtons(p)[0].click();
    expect(submit.disabled).toBe(false);
  });

  it('initial_value: the column starts with it, and clicking the selected one returns to it',
    async () => {
      const p = await panel(fakeKernel().kernel, {
        form: [
          { button: { column: 'call', value: 'yes', icon: 'jba:check', initial_value: 'unknown' } },
          { button: { column: 'call', value: 'no', icon: 'jba:x' } },
        ],
      });
      expect(p.getFormValue('call')).toBe('unknown');
      const [yes] = formButtons(p);
      yes.click();
      expect(p.getFormValue('call')).toBe('yes');
      yes.click();
      expect(p.getFormValue('call')).toBe('unknown');
    });

  it('pressed_icon shows while the button is pressed', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ button: { column: 'ok', value: 1, icon: 'jba:unchecked', pressed_icon: 'jba:checked' } }],
    });
    const [btn] = formButtons(p);
    expect(btn.textContent).toBe('☐');
    btn.click();
    expect(btn.textContent).toBe('☑');
    p.updateFromRow(ROWS[1]);
    expect(btn.textContent).toBe('☐');
  });

  it('a toggle starts on its first state and cycles; the next row resets it', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ button: { column: 'call', toggle: [
        { value: 'yes', icon: 'jba:check' }, { value: 'no', icon: 'jba:x' },
        { value: 'unsure', icon: 'jba:unsure' },
      ] } }],
    });
    const [btn] = formButtons(p);
    const seen = [[p.getFormValue('call'), btn.textContent]];
    for (let i = 0; i < 3; i++) {
      btn.click();
      seen.push([p.getFormValue('call'), btn.textContent]);
    }
    expect(seen).toEqual([['yes', '✓'], ['no', '✗'], ['unsure', '?'], ['yes', '✓']]);
    btn.click();
    p.updateFromRow(ROWS[1]);
    expect(p.getFormValue('call')).toBe('yes');
  });

  it('a toggle with its own icon starts unset showing it', async () => {
    const p = await panel(fakeKernel().kernel, {
      form: [{ button: { column: 't', icon: 'jba:na', toggle: [{ value: 1, icon: 'a' }, { value: 0, icon: 'b' }] } }],
    });
    const [btn] = formButtons(p);
    expect([btn.textContent, p.getFormValue('t'), btn.style.opacity]).toEqual(['∅', null, '1']);
    btn.click();
    expect([btn.textContent, p.getFormValue('t')]).toEqual(['a', 1]);
  });

  it('a toggle with initial_value null starts unset (dimmed), then goes to its first state',
    async () => {
      const p = await panel(fakeKernel().kernel, {
        form: [{ button: { column: 'present', initial_value: null, toggle: [
          { value: 1, icon: 'jba:checked' }, { value: 0, icon: 'jba:unchecked' },
        ] } }],
      });
      const [btn] = formButtons(p);
      expect(p.getFormValue('present')).toBeNull();
      expect(btn.style.opacity).toBe('0.45');
      btn.click();
      expect(p.getFormValue('present')).toBe(1);
      expect(btn.style.opacity).toBe('1');
    });

  it('a toggle value is written on submit', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ button: { column: 'present', toggle: [{ value: 1, icon: 'a' }, { value: 0, icon: 'b' }] } }],
    });
    formButtons(p)[0].click();
    await (p as any)._onVerify();
    expect(payloadRows(k.writes[0])[0].present).toBe(0);
  });

  it('reads an image file in the kernel once, across rebuilds', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ button: { column: 'call', value: 'owl', image: 'icons/owl.png' } }],
    });
    await flush();
    const img = formButtons(p)[0].querySelector('img') as HTMLImageElement;
    expect(img.src).toBe('data:image/png;base64,AAAA');
    await p.build();
    expect(k.images).toHaveLength(1);
  });
});

describe('FormPanel collapse', () => {
  const toggleEl = () => {
    const t = document.createElement('button');
    t.dataset.collapseToggle = '';
    return t;
  };

  it('collapsed, only the row holding the toggle is kept', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ textbox: { label: 'notes' } }] });
    p.setLeading(toggleEl());
    p.setCollapsed(true);
    const dyn = p.element.firstElementChild as HTMLElement;
    expect(dyn.classList.contains('jp-BA-collapsed')).toBe(true);
    expect(dyn.querySelectorAll(':scope > [data-collapse-keep]')).toHaveLength(1);
    expect(p.element.style.minHeight).toBe('0px');
    p.setCollapsed(false);
    expect(dyn.classList.contains('jp-BA-collapsed')).toBe(false);
    expect(p.element.style.minHeight).not.toBe('0px');
  });

  it('the toggle goes in the title / progress row, across rebuilds', async () => {
    const p = await panel(fakeKernel().kernel, {
      title: { value: 'REVIEW', progress_tracker: true },
      form: [{ textbox: { label: 'notes' } }],
    });
    const toggle = toggleEl();
    p.setLeading(toggle);
    await p.build();
    const row = toggle.parentElement!;
    expect(row.dataset.formHeading).toBe('');
    expect(row.dataset.collapseKeep).toBe('');
    expect(row.textContent).toContain('REVIEW');
    expect(p.element.querySelector('[data-form-buttons]')!.hasAttribute('data-collapse-keep')).toBe(false);
  });

  it('a progress_tracker row counts as the title row', async () => {
    const p = await panel(fakeKernel().kernel, {
      progress_tracker: true, form: [{ textbox: { label: 'notes' } }],
    });
    const toggle = toggleEl();
    p.setLeading(toggle);
    expect(toggle.parentElement!.dataset.formHeading).toBe('');
  });

  it('without a title the toggle gets a slim row of its own at the top', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ textbox: { label: 'notes' } }] });
    const toggle = document.createElement('button');
    toggle.dataset.collapseToggle = '';
    p.setLeading(toggle);
    await p.build();
    const row = toggle.parentElement!;
    expect(row.dataset.formToggleRow).toBe('');
    expect(row.dataset.collapseKeep).toBe('');
    expect(row.parentElement!.firstElementChild).toBe(row);
    expect(row.style.height).toBe('12px');
    expect(p.element.querySelectorAll('[data-form-toggle-row]')).toHaveLength(1);
  });

  it('Enter on a focused form button clicks it (does not submit)', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ button: { column: 'call', value: 'yes', icon: 'jba:check' } }],
    });
    const [btn] = formButtons(p);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(p.getFormValue('call')).toBe('yes');
    expect(k.writes).toHaveLength(0);
  });

  it('Enter on a focused checkbox toggles it (does not submit)', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ checkbox: { label: 'ok', checked_value: 'y', unchecked_value: 'n' } }],
    });
    const cb = p.element.querySelector('input[type=checkbox]') as HTMLInputElement;
    cb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(cb.checked).toBe(true);
    expect(p.getFormValue('ok')).toBe('y');
    expect(k.writes).toHaveLength(0);
  });

  it('Enter on a focused submit button submits once', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, {
      form: [{ button: { column: 'v', value: 1, icon: 'jba:check', submit: true } }],
    });
    formButtons(p)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(k.writes).toHaveLength(1);
    expect(payloadRows(k.writes[0])[0].v).toBe(1);
  });

  it('Enter elsewhere (a number input) still submits', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, { form: [{ number: { label: 'n', value: 2 } }] });
    const inp = p.element.querySelector('input[type=number]') as HTMLInputElement;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(k.writes).toHaveLength(1);
  });

  it('Enter on the toggle does not submit', async () => {
    const k = fakeKernel();
    const p = await panel(k.kernel, { form: [{ textbox: { label: 'notes' } }] });
    const toggle = document.createElement('button');
    toggle.dataset.collapseToggle = '';
    p.setLeading(toggle);
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(k.writes).toHaveLength(0);
  });
});


describe('button groups from row / column / grid', () => {
  const b = (value: any, extra: any = {}) => ({ button: { value, icon: String(value), ...extra } });

  it('a container column passes on to its buttons (unique by default)', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ row: { column: 'sp', items: [b('owl'), b('cat')] } }] });
    const [owl, cat] = formButtons(p);
    owl.click();
    cat.click();
    expect(p.getFormValue('sp')).toBe('cat');
    expect(owl.getAttribute('aria-pressed')).toBe('false');
  });

  it('unique: false on a shared column joins the pressed values (button order, delimiter)', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ grid: {
      columns: 3, column: 'tags', unique: false, delimiter: ';', items: [b('a'), b('b'), b('c')],
    } }] });
    const [a, , c] = formButtons(p);
    c.click();
    a.click();
    expect(p.getFormValue('tags')).toBe('a;c');
    expect(a.style.opacity).toBe('1');                   // no fading in a non-unique group
    c.click();
    expect(p.getFormValue('tags')).toBe('a');
    a.click();
    expect(p.getFormValue('tags')).toBeNull();
  });

  it('unique: true across columns: one-hot', async () => {
    const hot = (col: string) => ({ button: { column: col, value: 1, initial_value: 0, icon: col } });
    const p = await panel(fakeKernel().kernel, { form: [{ row: { unique: true, items: [hot('owl'), hot('cat'), hot('frog')] } }] });
    const [owl, cat] = formButtons(p);
    expect(['owl', 'cat', 'frog'].map(c => p.getFormValue(c))).toEqual([0, 0, 0]);
    owl.click();
    cat.click();
    expect(['owl', 'cat', 'frog'].map(c => p.getFormValue(c))).toEqual([0, 1, 0]);
  });

  it('unique: false with a column each: independent switches', async () => {
    const sw = (col: string) => ({ button: { column: col, value: 'y', icon: col } });
    const p = await panel(fakeKernel().kernel, { form: [{ row: { unique: false, items: [sw('a'), sw('b')] } }] });
    const [a, bb] = formButtons(p);
    a.click();
    bb.click();
    expect([p.getFormValue('a'), p.getFormValue('b')]).toEqual(['y', 'y']);
  });

  it("a button's own column wins over the container's", async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ row: { column: 'x', items: [b(1), b(2, { column: 'y' })] } }] });
    formButtons(p)[1].click();
    expect([p.getFormValue('x'), p.getFormValue('y')]).toEqual([null, 2]);
  });

  it('a nested container without unique stays in the outer group', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ column: { column: 'n', unique: true, items: [
      { row: [b(1), b(2)] }, { row: [b(3)] },
    ] } }] });
    const [one, , three] = formButtons(p);
    one.click();
    three.click();
    expect(p.getFormValue('n')).toBe(3);
    expect(one.getAttribute('aria-pressed')).toBe('false');
  });

  it('initial_value presses the matching buttons; reset per row', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ row: {
      column: 't', unique: false, items: [b('a', { initial_value: 'a,c' }), b('b'), b('c')],
    } }] });
    const [a, bb, c] = formButtons(p);
    expect([a, bb, c].map(x => x.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    expect(p.getFormValue('t')).toBe('a,c');
    bb.click();
    expect(p.getFormValue('t')).toBe('a,b,c');
    p.updateFromRow(ROWS[1]);
    expect(p.getFormValue('t')).toBe('a,c');
  });

  it('highlight: false: no ring, no fading', async () => {
    const p = await panel(fakeKernel().kernel, { form: [{ row: { column: 'h', items: [
      b(1, { highlight: false }), b(2, { highlight: false }),
    ] } }] });
    const [one, two] = formButtons(p);
    one.click();
    expect(one.style.boxShadow).toBe('');
    expect(two.style.opacity).toBe('1');
  });
});
