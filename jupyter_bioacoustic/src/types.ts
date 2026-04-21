/**
 * Shared types for the BioacousticWidget.
 *
 * Specific sections may define their own internal types; this module
 * holds types used across multiple files.
 */

/** A single row of the input data. Requires at minimum id, start_time, end_time. */
export interface Detection {
  id: number;
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
  dtype: 'float' | 'string';
}

/** Column definition for the clip table. */
export interface TableCol {
  key: string;
  label: string;
}

/**
 * Parsed `annotation` element config — the subset of fields used by
 * FormPanel and Player to coordinate spectrogram annotation tools.
 */
export interface AnnotConfig {
  startTime?: { col: string; sourceValue?: string };
  endTime?: { col: string; sourceValue?: string };
  minFreq?: { col: string };
  maxFreq?: { col: string };
  tools: string[];
}

/** Resolved audio configuration passed from Python to TypeScript. */
export interface AudioConfig {
  type: 'path' | 'url' | 'column';
  value: string;
  prefix: string;
  suffix: string;
  fallback: string;
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
