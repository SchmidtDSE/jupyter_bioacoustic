/**
 * Side form: the form beside the spectrogram instead of below it (``side_form: true`` at the
 * top of the form config). Pure helpers (unit-tested): the config, and how the spectrogram /
 * form columns are sized for the current split and collapse state. BioacousticWidget builds
 * the row, the draggable divider and applies these sizes.
 *
 * License: BSD 3-Clause
 */
//
// Constants
//
/** The spectrogram's share of the row when ``side_form_split`` isn't set. */
export const DEFAULT_SIDE_FORM_SPLIT = 2 / 3;
/** Limits for ``side_form_split`` and for dragging the divider. */
export const MIN_SIDE_FORM_SPLIT = 0.2;
export const MAX_SIDE_FORM_SPLIT = 0.95;
/** Below this row width (px) the form goes back below the spectrogram. */
export const SIDE_FORM_STACK_WIDTH = 640;
/** Width of the draggable divider (px). */
export const SIDE_FORM_DIVIDER_PX = 6;


//
// Types
//
/** CSS for the three parts of the side-form row. */
export interface SideFormSizes {
  /** The row: side by side, or stacked when narrow. */
  direction: 'row' | 'column';
  /** ``flex`` of the spectrogram column. */
  player: string;
  /** ``flex`` of the form column. */
  form: string;
  /** The divider is shown (both sections open, side by side). */
  divider: boolean;
}


//
// Public
//
/**
 * The side-form split from a form config: the spectrogram's share of the width (clamped), or
 * null when ``side_form`` isn't true.
 */
export function parseSideForm(formConfig: any): number | null {
  if (!formConfig || typeof formConfig !== 'object' || formConfig.side_form !== true) return null;
  const raw = Number(formConfig.side_form_split);
  return clampSplit(Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SIDE_FORM_SPLIT);
}


/** ``split`` kept within the allowed range. */
export function clampSplit(split: number): number {
  return Math.min(MAX_SIDE_FORM_SPLIT, Math.max(MIN_SIDE_FORM_SPLIT, split));
}


/**
 * How to size the columns. Open + open: the split (the divider takes its few px from the
 * form). A collapsed spectrogram shrinks to its play row and a collapsed form to its strip;
 * the other side takes the rest. Narrow rows stack.
 */
export function sideFormSizes(
  split: number, playerOpen: boolean, formOpen: boolean, stacked: boolean,
): SideFormSizes {
  if (stacked) return { direction: 'column', player: '0 0 auto', form: '0 0 auto', divider: false };
  if (playerOpen && formOpen) {
    const pct = (clampSplit(split) * 100).toFixed(2);
    return { direction: 'row', player: `0 0 ${pct}%`, form: '1 1 0', divider: true };
  }
  return {
    direction: 'row',
    player: playerOpen ? '1 1 0' : '0 0 auto',
    form: formOpen ? '1 1 0' : '0 0 auto',
    divider: false,
  };
}
