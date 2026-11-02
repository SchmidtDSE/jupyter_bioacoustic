/**
 * The "REVIEWED" view the FormPanel shows instead of the form for an already-submitted row
 * (when ``duplicate_entries`` is off): the saved values, Prev / Next, and "Delete this
 * review". Also works out which annotation to draw from the saved values.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS, DISPLAY_CHIP_COLORS, btnStyle, dividerStyle } from '../../styles';
import { AnnotConfig, MultiboxEntry } from '../../types';


//
// Types
//
/** The annotation recovered from saved output rows. */
export interface ReviewedAnnotation {
  /** Tool to draw it with ('' when the rows hold no annotation). */
  tool: string;
  /** One box per row (multibox only). */
  boxes: MultiboxEntry[];
  /** Annotation column values to show (single-row tools). */
  values: Record<string, number>;
}

/** Handlers and state for the reviewed view's buttons. */
export interface ReviewedViewOptions {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
}


//
// Public
//
/**
 * Which annotation saved ``rows`` describe: several rows with times + frequencies are
 * multibox boxes; one such row is a bounding box; otherwise a start/end or a start time.
 */
export function reviewedAnnotation(
  rows: Record<string, any>[], ac: AnnotConfig | null,
): ReviewedAnnotation {
  const result: ReviewedAnnotation = { tool: '', boxes: [], values: {} };
  if (!ac || rows.length === 0) return result;

  const cols = {
    st: ac.startTime?.col, et: ac.endTime?.col, lo: ac.minFreq?.col, hi: ac.maxFreq?.col,
  };
  const first = rows[0];
  const has = (col?: string) => !!col && first[col] != null && first[col] !== '';
  const num = (row: Record<string, any>, col: string) => parseFloat(String(row[col]));
  const hasTimes = has(cols.st) && has(cols.et);
  const hasFreqs = has(cols.lo) && has(cols.hi);
  const take = (...keys: Array<keyof typeof cols>) => {
    for (const k of keys) result.values[cols[k]!] = num(first, cols[k]!);
  };

  if (rows.length > 1 && hasTimes && hasFreqs) {
    result.tool = 'multibox';
    result.boxes = rows.map((r, i) => ({
      id: i,
      startTime: num(r, cols.st!),
      endTime: num(r, cols.et!),
      minFreq: num(r, cols.lo!),
      maxFreq: num(r, cols.hi!),
      formValues: {},
      color: DISPLAY_CHIP_COLORS[i % DISPLAY_CHIP_COLORS.length],
    }));
  } else if (rows.length === 1 && hasTimes && hasFreqs) {
    result.tool = 'bounding_box';
    take('st', 'et', 'lo', 'hi');
  } else if (hasTimes) {
    result.tool = 'start_end_time_select';
    take('st', 'et');
  } else if (has(cols.st)) {
    result.tool = 'time_select';
    take('st');
  }
  return result;
}


/**
 * The reviewed view's elements, in order: title, saved-value cards (one per row, colored
 * when there are several), divider, button row.
 */
export function buildReviewedView(
  rows: Record<string, any>[], opts: ReviewedViewOptions,
): HTMLElement[] {
  const title = document.createElement('div');
  title.style.cssText =
    `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${COLORS.green};`;
  title.textContent = 'REVIEWED';

  const container = document.createElement('div');
  container.style.cssText = `display:flex;flex-direction:column;gap:6px;padding:4px 0;overflow-y:auto;`;
  rows.forEach((data, ri) => container.appendChild(_reviewedCard(data, ri, rows.length > 1)));

  const divider = document.createElement('div');
  divider.style.cssText = dividerStyle('4px -2px');

  return [title, container, divider, _buttonRow(opts)];
}


//
// Internal
//
/** One saved row as ``key value`` lines (compact chips when ``multi``). */
function _reviewedCard(data: Record<string, any>, index: number, multi: boolean): HTMLDivElement {
  const card = document.createElement('div');
  card.style.cssText = multi
    ? `display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:4px 8px;` +
      `border-radius:4px;border-left:3px solid ${DISPLAY_CHIP_COLORS[index % DISPLAY_CHIP_COLORS.length]};`
    : `display:flex;flex-direction:column;gap:2px;`;
  for (const [key, val] of Object.entries(data)) {
    const line = document.createElement('span');
    line.style.cssText = multi
      ? `display:inline-flex;gap:4px;font-size:12px;white-space:nowrap;`
      : `display:flex;gap:8px;font-size:12px;`;
    const keyEl = document.createElement('span');
    keyEl.style.cssText = multi
      ? `color:${COLORS.textMuted};`
      : `color:${COLORS.textMuted};min-width:140px;flex-shrink:0;`;
    keyEl.textContent = key;
    const valEl = document.createElement('span');
    valEl.style.cssText = `color:${COLORS.textPrimary};`;
    valEl.textContent = val != null && val !== '' ? String(val) : '—';
    line.append(keyEl, valEl);
    card.appendChild(line);
  }
  return card;
}


/** Prev / Next on the left, "Delete this review" on the right. */
function _buttonRow(opts: ReviewedViewOptions): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:2px;`;
  const navBtnStyle = btnStyle() + `font-size:12px;width:75px;height:28px`;

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '◀ Prev';
  prevBtn.style.cssText = navBtnStyle;
  prevBtn.disabled = !opts.canPrev;
  prevBtn.addEventListener('click', opts.onPrev);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next ▶';
  nextBtn.style.cssText = navBtnStyle;
  nextBtn.disabled = !opts.canNext;
  nextBtn.addEventListener('click', opts.onNext);

  const spacer = document.createElement('span');
  spacer.style.flex = '1';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete this review';
  deleteBtn.style.cssText = btnStyle() + `font-size:12px;color:${COLORS.red};`;
  deleteBtn.addEventListener('click', opts.onDelete);

  row.append(prevBtn, nextBtn, spacer, deleteBtn);
  return row;
}
