/**
 * Modal dialogs: one backdrop + card helper (``createModal``) that every hand-built dialog in
 * the annotator uses (message boxes, text prompts, the project picker, the launcher chooser),
 * so they look and close the same way.
 *
 * Plain DOM, no framework. Escape closes the top-most modal; clicking the backdrop closes it
 * unless ``dismissOnBackdrop`` is false.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS, btnStyle, inputStyle } from './styles';


//
// Constants
//
const BACKDROP_CSS =
  `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;` +
  `background:rgba(0,0,0,0.55);`;
const CARD_CSS =
  `background:${COLORS.bgBase};border:1px solid ${COLORS.bgSurface1};border-radius:8px;` +
  `padding:20px 24px;max-width:520px;width:90%;max-height:80vh;display:flex;` +
  `flex-direction:column;gap:12px;font-family:var(--jp-ui-font-family,ui-sans-serif,sans-serif);` +
  `box-shadow:0 8px 32px rgba(0,0,0,0.5);box-sizing:border-box;`;
const TITLE_CSS = `font-size:14px;font-weight:700;color:${COLORS.textPrimary};`;
const MESSAGE_CSS =
  `font-size:12px;color:${COLORS.textSubtle};white-space:pre-wrap;` +
  `overflow-y:auto;max-height:50vh;line-height:1.5;`;
const BUTTON_ROW_CSS = `display:flex;gap:8px;justify-content:flex-end;margin-top:4px;`;
const DEFAULT_Z_INDEX = 100000;

/** Open modals, bottom to top: Escape only closes the top one. */
const openModals: ModalHandle[] = [];


//
// Types
//
/** Options for ``createModal``. */
export interface ModalOptions {
  /** Heading shown at the top of the card (omitted when empty). */
  title?: string;
  /** Extra CSS appended to the card's default style (e.g. a wider ``max-width``). */
  cardCss?: string;
  /** Extra CSS appended to the title's default style. */
  titleCss?: string;
  /** CSS z-index of the backdrop. */
  zIndex?: number;
  /** Close when the backdrop (outside the card) is clicked. Default true. */
  dismissOnBackdrop?: boolean;
  /** Called once when the modal is dismissed (Escape / backdrop), not on ``close()``. */
  onDismiss?: () => void;
}

/** A modal on screen: fill ``card``, then call ``close()`` when done. */
export interface ModalHandle {
  readonly backdrop: HTMLDivElement;
  readonly card: HTMLDivElement;
  /** Remove the modal (idempotent). Does not call ``onDismiss``. */
  close(): void;
}

/** A button in a ``showMessage`` dialog. */
export interface DialogButton {
  label: string;
  primary?: boolean;
}


//
// Public
//
/**
 * Show an empty modal (backdrop + themed card with an optional title) and return it.
 *
 * @param opts - See ``ModalOptions``.
 * @returns The modal; append content to ``card``.
 */
export function createModal(opts: ModalOptions = {}): ModalHandle {
  const backdrop = document.createElement('div');
  backdrop.style.cssText = BACKDROP_CSS + `z-index:${opts.zIndex ?? DEFAULT_Z_INDEX};`;

  const card = document.createElement('div');
  card.style.cssText = CARD_CSS + (opts.cardCss ?? '');
  if (opts.title) {
    const heading = document.createElement('div');
    heading.textContent = opts.title;
    heading.style.cssText = TITLE_CSS + (opts.titleCss ?? '');
    card.appendChild(heading);
  }
  backdrop.appendChild(card);

  let closed = false;
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && openModals[openModals.length - 1] === handle) {
      e.preventDefault();
      dismiss();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    const i = openModals.indexOf(handle);
    if (i >= 0) openModals.splice(i, 1);
    backdrop.remove();
  };
  const dismiss = () => {
    if (closed) return;
    close();
    opts.onDismiss?.();
  };
  const handle: ModalHandle = { backdrop, card, close };

  if (opts.dismissOnBackdrop ?? true) {
    backdrop.addEventListener('click', e => { if (e.target === backdrop) dismiss(); });
  }
  document.addEventListener('keydown', onKeydown);
  openModals.push(handle);
  document.body.appendChild(backdrop);
  return handle;
}


/**
 * A message box with buttons.
 *
 * @param opts.title - Heading.
 * @param opts.body - Plain-text message (newlines kept).
 * @param opts.buttons - Buttons, left to right (default: a single primary "OK"). The last one
 *     gets focus.
 * @param opts.dismissOnBackdrop - Close on a backdrop click (default false).
 * @returns The clicked button's label, or null if dismissed with Escape / the backdrop.
 */
export function showMessage(opts: {
  title?: string;
  body: string;
  buttons?: DialogButton[];
  dismissOnBackdrop?: boolean;
}): Promise<string | null> {
  const buttons = opts.buttons ?? [{ label: 'OK', primary: true }];
  return new Promise(resolve => {
    const modal = createModal({
      title: opts.title,
      dismissOnBackdrop: opts.dismissOnBackdrop ?? false,
      onDismiss: () => resolve(null),
    });
    const body = document.createElement('div');
    body.style.cssText = MESSAGE_CSS;
    body.textContent = opts.body;
    modal.card.appendChild(body);

    const row = buttonRow(buttons.map(b => ({
      ...b,
      onClick: () => { modal.close(); resolve(b.label); },
    })));
    modal.card.appendChild(row);
    (row.lastElementChild as HTMLButtonElement | null)?.focus();
  });
}


/**
 * Ask for a line of text (replaces ``window.prompt``).
 *
 * @param opts.title - Heading.
 * @param opts.label - Text above the input.
 * @param opts.value - Initial value (selected, so typing replaces it).
 * @param opts.placeholder - Input placeholder.
 * @param opts.okLabel - Label of the confirm button (default "OK").
 * @returns The entered text (trimmed), or null if cancelled / left empty.
 */
export function promptText(opts: {
  title?: string;
  label?: string;
  value?: string;
  placeholder?: string;
  okLabel?: string;
}): Promise<string | null> {
  return new Promise(resolve => {
    const modal = createModal({ title: opts.title, onDismiss: () => resolve(null) });
    if (opts.label) {
      const lbl = document.createElement('div');
      lbl.style.cssText = MESSAGE_CSS;
      lbl.textContent = opts.label;
      modal.card.appendChild(lbl);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.value = opts.value ?? '';
    input.placeholder = opts.placeholder ?? '';
    input.style.cssText = inputStyle('100%') + `font-size:13px;padding:6px 8px;`;
    modal.card.appendChild(input);

    const finish = (value: string | null) => {
      modal.close();
      const text = value?.trim() ?? '';
      resolve(text ? text : null);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
    });
    modal.card.appendChild(buttonRow([
      { label: 'Cancel', onClick: () => finish(null) },
      { label: opts.okLabel ?? 'OK', primary: true, onClick: () => finish(input.value) },
    ]));
    input.focus();
    input.select();
  });
}


/**
 * A right-aligned row of buttons styled like the rest of the annotator.
 *
 * @param buttons - Label, primary flag and click handler for each button.
 */
export function buttonRow(
  buttons: Array<DialogButton & { onClick: () => void }>,
): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = BUTTON_ROW_CSS;
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.style.cssText = btnStyle(b.primary);
    btn.addEventListener('click', b.onClick);
    row.appendChild(btn);
  }
  return row;
}
