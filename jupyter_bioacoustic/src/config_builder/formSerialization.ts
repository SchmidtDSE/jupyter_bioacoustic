/**
 * Form-builder element <-> form YAML conversion (pure, no DOM).
 *
 * The builder edits each form element as a flat "card config" (e.g. an annotation's
 * ``start_time_col``); the form YAML the annotator reads uses a different shape (e.g.
 * ``start_time: {column, source_value}``). ``serializeElement`` and ``deserializeElement`` are
 * exact mirrors and are used for EVERY element — top level, inside the ``form:`` list, and in
 * ``dynamic_forms`` — so loading and re-saving a form never changes it.
 *
 * License: BSD 3-Clause
 */


//
// Types
//
export type ElementType = 'title' | 'select' | 'textbox' | 'checkbox' | 'number' |
  'annotation' | 'pass_value' | 'fixed_value' | 'submission_buttons' |
  'break' | 'line' | 'text';

/** Builder card config for one element (flat; shape depends on the element type). */
export type CardConfig = Record<string, any>;


//
// Public
//
/**
 * The YAML value for ``{[type]: value}`` built from a card config.
 *
 * @param type - Element type.
 * @param cfg - The element's card config.
 */
export function serializeElement(type: ElementType, cfg: CardConfig): any {
  switch (type) {
    case 'title':
      return cfg.progress_tracker
        ? { value: cfg.value || '', progress_tracker: true }
        : cfg.value || '';
    case 'pass_value':
      return { source_column: cfg.source_column || '', column: cfg.column || '' };
    case 'fixed_value':
      return { column: cfg.column || '', value: cfg.value ?? '' };
    case 'annotation':
      return _serializeAnnotation(cfg);
    case 'submission_buttons':
      return _serializeSubmissionButtons(cfg);
    case 'break':
    case 'line':
      return true;
    case 'text':
      return cfg.value || '';
    default:
      return _withoutEmpty(cfg);
  }
}


/**
 * The card config for an element read from YAML (the inverse of ``serializeElement``).
 *
 * @param type - Element type (the YAML key).
 * @param raw - The YAML value under that key.
 */
export function deserializeElement(type: ElementType, raw: any): CardConfig {
  switch (type) {
    case 'title':
      return typeof raw === 'object' && raw !== null
        ? { value: raw.value || '', progress_tracker: !!raw.progress_tracker }
        : { value: raw ?? '' };
    case 'annotation':
      return _deserializeAnnotation(raw ?? {});
    case 'submission_buttons':
      return _deserializeSubmissionButtons(raw ?? {});
    case 'break':
    case 'line':
      return {};
    default:
      return typeof raw === 'object' && raw !== null ? { ...raw } : { value: raw };
  }
}


//
// Internal
//
const ANNOTATION_BOUNDS: Array<[string, string, string | null]> = [
  // [yaml key, card column key, default source_value]
  ['start_time', 'start_time_col', 'start_time'],
  ['end_time', 'end_time_col', 'end_time'],
  ['min_frequency', 'min_freq_col', null],
  ['max_frequency', 'max_freq_col', null],
];


function _serializeAnnotation(cfg: CardConfig): Record<string, any> {
  const annot: Record<string, any> = {};
  for (const [yamlKey, colKey, defaultSource] of ANNOTATION_BOUNDS) {
    if (!cfg[colKey]) continue;
    const bound: Record<string, any> = { column: cfg[colKey] };
    const source = cfg[`${colKey}_source`] ?? defaultSource;
    if (source) bound.source_value = source;
    annot[yamlKey] = bound;
  }
  if (cfg.tools) annot.tools = cfg.tools;
  if (cfg.form) annot.form = cfg.form;
  return annot;
}


function _deserializeAnnotation(a: Record<string, any>): CardConfig {
  const cfg: CardConfig = {};
  for (const [yamlKey, colKey, defaultSource] of ANNOTATION_BOUNDS) {
    const bound = a[yamlKey];
    if (!bound) continue;
    cfg[colKey] = typeof bound === 'object' ? bound.column : bound;
    const source = typeof bound === 'object' ? bound.source_value : undefined;
    if (source && source !== defaultSource) cfg[`${colKey}_source`] = source;
  }
  if (a.tools) cfg.tools = a.tools;
  if (a.form) cfg.form = a.form;
  return cfg;
}


function _serializeSubmissionButtons(cfg: CardConfig): Record<string, any> {
  const icon = cfg.show_icon !== false;
  const sb: Record<string, any> = {};
  if (cfg.line) sb.line = true;
  for (const name of ['previous', 'next', 'submit']) {
    const label = cfg[`${name}_label`];
    if (label && (cfg[name] || name !== 'previous')) sb[name] = { label, icon };
    else if (cfg[name]) sb[name] = true;
  }
  return sb;
}


function _deserializeSubmissionButtons(sb: Record<string, any>): CardConfig {
  // one "show icon" switch in the UI: off if any labelled button says icon: false (a button
  // that isn't there must not count as "icon on", which used to drop icon: false on load)
  const labelled = ['previous', 'next', 'submit'].map(n => sb[n]).filter(b => b && typeof b === 'object');
  const cfg: CardConfig = { show_icon: !labelled.some(b => b.icon === false) };
  if (sb.line) cfg.line = true;
  for (const name of ['previous', 'next', 'submit']) {
    if (!sb[name]) continue;
    cfg[name] = true;
    if (typeof sb[name] === 'object' && sb[name].label) cfg[`${name}_label`] = sb[name].label;
  }
  return cfg;
}


/** Copy of ``cfg`` without unset / empty / false values. */
function _withoutEmpty(cfg: CardConfig): CardConfig {
  const cleaned: CardConfig = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) cleaned[k] = v;
  }
  return cleaned;
}
