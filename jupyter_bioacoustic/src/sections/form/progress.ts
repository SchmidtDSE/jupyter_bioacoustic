/**
 * Progress-tracker text and accuracy for the FormPanel (no DOM, unit-tested).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { AccuracyConfig, isTruthyValue } from '../../util';


//
// Public
//
/**
 * The progress line: ``session s/N · total t/N · accuracy a%`` (session only once something
 * was saved this session; accuracy only when known). File rows count at most ``total``.
 */
export function formatProgress(
  sessionCount: number, fileCount: number, total: number, accuracy: number | null,
): string {
  const done = Math.min(fileCount, total) + sessionCount;
  const parts: string[] = [];
  if (sessionCount > 0) parts.push(`session ${sessionCount}/${total}`);
  parts.push(`total ${done}/${total}`);
  if (accuracy !== null) parts.push(`accuracy ${accuracy}%`);
  return parts.join(' · ');
}


/**
 * Percentage (rounded) of output rows whose accuracy column counts as correct: equal to the
 * configured value (case-insensitive), or truthy (``isTruthyValue``) when none is set.
 * Null for no rows.
 */
export function accuracyPercent(
  rows: Record<string, any>[], config: AccuracyConfig,
): number | null {
  if (rows.length === 0) return null;
  const valid = rows.filter(r => isAccuracyValid(r[config.column], config.value)).length;
  return Math.round(100 * valid / rows.length);
}


/** Whether one cell counts as correct for the accuracy check. */
export function isAccuracyValid(cellValue: any, configValue: string | null): boolean {
  if (configValue !== null) {
    return String(cellValue ?? '').toLowerCase() === configValue.toLowerCase();
  }
  return isTruthyValue(cellValue);
}
