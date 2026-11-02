/**
 * Parse a form's ``annotation`` element into an ``AnnotConfig`` (no DOM, unit-tested):
 * which output columns hold the start/end time and min/max frequency, which tools are
 * offered, the fixed-duration window and the per-box form.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { AnnotConfig, FixedDurationConfig } from '../../types';


//
// Constants
//
/** Tools that set a start time / an end time / a frequency range. */
const TIME_TOOLS = ['time_select', 'start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration'];
const END_TIME_TOOLS = ['start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration'];
const FREQ_TOOLS = ['bounding_box', 'multibox'];

/** The four bounds: config key, AnnotConfig field, default column. */
const BOUND_KEYS = [
  ['start_time', 'startTime'],
  ['end_time', 'endTime'],
  ['min_frequency', 'minFreq'],
  ['max_frequency', 'maxFreq'],
] as const;


//
// Types
//
/** The parsed annotation element. */
export interface ParsedAnnotation {
  config: AnnotConfig;
  /** Output columns the annotation writes, in first-use order (initialised to null). */
  columns: string[];
}


//
// Public
//
/**
 * Parse an ``annotation`` element.
 *
 * - each bound is a column name or ``{column, label, source_value}``;
 * - ``tools`` is a name, a list of names / ``{fixed_duration: ...}``, or absent
 *   (``time_select``);
 * - bounds the chosen tools need but the config omits get default columns
 *   (``start_time``, ``end_time``, ``min_frequency``, ``max_frequency``).
 */
export function parseAnnotationConfig(config: any): ParsedAnnotation {
  const ac: AnnotConfig = { tools: [] };
  const columns: string[] = [];

  for (const [key, field] of BOUND_KEYS) {
    const raw = config[key];
    if (!raw) continue;
    const c = typeof raw === 'string' ? { column: raw } : raw;
    const col = c.column ?? c.label ?? key;
    ac[field] = field === 'startTime' || field === 'endTime'
      ? { col, sourceValue: c.source_value }
      : { col };
    columns.push(col);
  }

  const rawTools = config.tools;
  if (typeof rawTools === 'string') {
    ac.tools = [rawTools];
  } else if (Array.isArray(rawTools)) {
    for (const t of rawTools) {
      if (typeof t === 'string') {
        ac.tools.push(t);
      } else if (typeof t === 'object' && t !== null && 'fixed_duration' in t) {
        ac.tools.push('fixed_duration');
        const fd = parseFixedDuration(t.fixed_duration);
        if (fd) ac.fixedDuration = fd;
      }
    }
  } else {
    ac.tools = ['time_select'];
  }

  const uses = (tools: string[]) => ac.tools.some(t => tools.includes(t));
  if (uses(TIME_TOOLS) && !ac.startTime) {
    ac.startTime = { col: 'start_time', sourceValue: 'start_time' };
    columns.push('start_time');
  }
  if (uses(END_TIME_TOOLS) && !ac.endTime) {
    ac.endTime = { col: 'end_time', sourceValue: 'end_time' };
    columns.push('end_time');
  }
  if (uses(FREQ_TOOLS) && !ac.minFreq) {
    ac.minFreq = { col: 'min_frequency' };
    columns.push('min_frequency');
  }
  if (uses(FREQ_TOOLS) && !ac.maxFreq) {
    ac.maxFreq = { col: 'max_frequency' };
    columns.push('max_frequency');
  }

  if (config.form) ac.form = typeof config.form === 'string' ? config.form : null;
  return { config: ac, columns };
}


/**
 * A ``fixed_duration`` tool setting: a number (fixed window), or ``{window}`` (fixed) /
 * ``{initial_window, min, max, step}`` (user-editable). Null for anything else.
 */
export function parseFixedDuration(raw: any): FixedDurationConfig | null {
  if (typeof raw === 'number') return { value: raw, editable: false };
  if (typeof raw === 'object' && raw !== null) {
    const hasInitial = raw.initial_window != null;
    return {
      value: hasInitial ? raw.initial_window : (raw.window ?? 1),
      editable: hasInitial,
      min: raw.min,
      max: raw.max,
      step: raw.step,
    };
  }
  return null;
}
