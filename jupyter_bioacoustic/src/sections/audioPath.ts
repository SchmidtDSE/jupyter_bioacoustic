/**
 * Resolve the audio file for a row from the ``audio`` config (pure, unit-tested): a fixed
 * path / URL, or a per-row column with a fallback, plus optional prefix / suffix.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { AudioConfig, Detection } from '../types';


//
// Constants
//
/** A remote path: scheme in group 1, the rest in group 2. */
const REMOTE_PATH_RE = /^(https?:\/\/|s3:\/\/|gs:\/\/)(.*)/;


//
// Public
//
/**
 * Join ``prefix`` / ``suffix`` onto a raw audio path with ``/``. For URLs (``type: url`` or
 * a ``http(s)://``, ``s3://``, ``gs://`` path) the prefix goes after the scheme
 * (``s3://prefix/rest``).
 */
export function applyPrefixSuffix(raw: string, cfg: AudioConfig): string {
  const { prefix, suffix, type } = cfg;
  if (!prefix && !suffix) return raw;

  if (type === 'url' || raw.match(/^(https?|s3|gs):\/\//)) {
    const m = raw.match(REMOTE_PATH_RE);
    if (m) {
      let rest = m[2];
      if (prefix) rest = prefix + '/' + rest;
      if (suffix) rest = rest + '/' + suffix;
      return m[1] + rest;
    }
  }

  let result = raw;
  if (prefix) result = prefix + '/' + result;
  if (suffix) result = result + '/' + suffix;
  return result;
}


/**
 * The audio path for ``row``: the configured path / URL, or (``type: column``) the row's
 * column value, falling back to ``fallback`` (used as-is, without prefix / suffix) when the
 * cell is empty. Returns '' when nothing is configured.
 */
export function resolveAudioPath(cfg: AudioConfig, row: Detection | null): string {
  if (cfg.type === 'column') {
    const colVal = row?.[cfg.value];
    if (colVal != null && String(colVal).trim()) return applyPrefixSuffix(String(colVal), cfg);
    return cfg.fallback || '';
  }
  return applyPrefixSuffix(cfg.value, cfg);
}
