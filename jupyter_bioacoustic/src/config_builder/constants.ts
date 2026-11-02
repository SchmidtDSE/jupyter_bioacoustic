/**
 * Config builder constants: file-picker extension lists, path patterns and the default
 * ``annotator_config/`` directories, shared by the panel and its sections.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import type { ConfigFileType } from './types';


//
// Constants
//
/** The three files a project is saved as, in cascade order. */
export const CONFIG_FILE_TYPES: readonly ConfigFileType[] = ['project', 'config', 'form'];

/** Default directory of each config file type (mirrors core.py's DEFAULT_*_DIR). */
export const CONFIG_DIRS: Readonly<Record<ConfigFileType, string>> = {
  project: 'annotator_config/projects',
  config: 'annotator_config/config',
  form: 'annotator_config/forms',
};

/** Tabular data files the kernel's ``read_columns`` can read. */
export const DATA_EXTS: readonly string[] = ['.csv', '.parquet', '.json', '.tsv', '.jsonl'];

/** Output files the annotator can write. */
export const OUTPUT_EXTS: readonly string[] = ['.csv', '.parquet', '.json', '.tsv'];

/** Audio files the annotator can play. */
export const AUDIO_EXTS: readonly string[] = ['.flac', '.wav', '.mp3', '.ogg', '.m4a', '.aac'];

/** Project / config / form files. */
export const YAML_EXTS: readonly string[] = ['.yaml', '.yml'];

/** Description-panel content files. */
export const DESCRIPTION_EXTS: readonly string[] = ['.md', '.txt', '.html'];

/** Files a select element's ``items: {path: ...}`` may point at. */
export const ITEMS_FILE_EXTS: readonly string[] = ['.csv', '.parquet', '.json', '.tsv', '.txt'];

/** A path whose columns can be loaded (one of ``DATA_EXTS``). */
export const DATA_FILE_RE = /\.(csv|parquet|json|jsonl|tsv)$/i;

/** A value that starts with a URL scheme (``https://``, ``s3://``, ``gs://``, ...). */
export const REMOTE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** A ``.yaml`` / ``.yml`` file name. */
export const YAML_FILE_RE = /\.(yaml|yml)$/i;
