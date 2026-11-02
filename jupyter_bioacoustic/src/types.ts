/**
 * Shared types for the annotator widget.
 *
 * Specific sections may define their own internal types; this module holds the types used
 * across multiple files (rows, annotation config, kernel config, status messages).
 *
 * License: BSD 3-Clause
 */
//
// Types
//
/** A single row of the input data. Requires at minimum start_time, end_time. */
export interface Detection {
  start_time: number;
  end_time: number;
  [key: string]: any;
}

/** A parsed expression-filter clause (from the filter bar). */
export interface FilterClause {
  col: string;
  op: string;
  val: string | number | null;
}

/** Metadata for a filterable column (auto-detected or configured). */
export interface FilterColumnMeta {
  key: string;
  label: string;
  dtype: 'float' | 'string' | 'date';
}

/** Column definition for the clip table. */
export interface TableCol {
  key: string;
  label: string;
}

/** The ``fixed_duration`` annotation tool's window settings. */
export interface FixedDurationConfig {
  /** Window length (s). */
  value: number;
  /** Whether the user may change the window length. */
  editable: boolean;
  min?: number;
  max?: number;
  step?: number;
}

/** The four annotation bounds a box or time selection can set. */
export type AnnotField = 'startTime' | 'endTime' | 'minFreq' | 'maxFreq';

/**
 * Parsed `annotation` element config — the subset of fields used by
 * FormPanel and Player to coordinate spectrogram annotation tools.
 */
export interface AnnotConfig {
  startTime?: { col: string; sourceValue?: string };
  endTime?: { col: string; sourceValue?: string };
  minFreq?: { col: string };
  maxFreq?: { col: string };
  /** Tool names in dropdown order (``time_select``, ``bounding_box``, ``multibox``...). */
  tools: string[];
  fixedDuration?: FixedDurationConfig;
  /** Name of the dynamic form shown per box (multibox) or once (other tools). */
  form?: string | null;
}

/** The current annotation bounds (null when a bound is unset or not configured). */
export interface AnnotBounds {
  st: number | null;
  et: number | null;
  flo: number | null;
  fhi: number | null;
}

/** A single bounding box in multibox mode. */
export interface MultiboxEntry {
  id: number;
  startTime: number;
  endTime: number;
  minFreq: number;
  maxFreq: number;
  formValues: Record<string, any>;
  color: string;
}

/** Resolved audio configuration passed from Python to TypeScript. */
export interface AudioConfig {
  type: 'path' | 'url' | 'column';
  value: string;
  prefix: string;
  suffix: string;
  fallback: string;
}

/** One entry of the spectrogram "Type" dropdown (``_BA_VIZ_META``). */
export interface VizMeta {
  /** ``'builtin'`` or ``'custom'`` (a user visualization function). */
  type: string;
  key?: string;
  label: string;
  /** Frequency axis scale: ``linear``, ``mel``, ``log`` or ``lut``. */
  freq_scale?: string;
  index: number;
}

/** Output sync settings (``output.uri`` + optional sync button). */
export interface SyncConfig {
  uri?: string;
  button?: string;
  recursive?: boolean;
}

/** Spectrogram audio segment metadata returned from the Python loader. */
export interface SegmentInfo {
  sampleRate: number;
  freqMin: number;
  freqMax: number;
  loadStart: number;
  duration: number;
  detectionStart: number;
  detectionEnd: number;
}

/** A message for the widget header's status line. */
export interface StatusMessage {
  message: string;
  error: boolean;
  warning?: boolean;
}

/**
 * The ``_BA_*`` kernel globals as printed by ``python.readKernelVars()``. Every value is a
 * string; structured ones (``data``, ``form_config``, ``audio``...) are JSON to parse.
 */
export interface KernelVars {
  data: string;
  audio: string;
  output: string;
  info_card_title: string;
  app_title: string;
  info_card_text: string;
  data_cols: string;
  form_config: string;
  capture: string;
  capture_dir: string;
  capture_height: string;
  duplicate_entries: string;
  sort: string;
  sort_order: string;
  default_buffer: string;
  spec_resolutions: string;
  viz_meta: string;
  sync_config: string;
  clip_table_height: string;
  player_height: string;
  info_card_height: string;
  form_panel_height: string;
  description: string;
  description_height: string;
  project_path: string;
  config_path: string;
  form_path: string;
  merged_config: string;
  data_index_col: string;
  output_index_col: string;
}
