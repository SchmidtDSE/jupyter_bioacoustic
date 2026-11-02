/**
 * Helpers shared by the Data and Audio sections' "source_type + value" fields: switching the
 * source type from the typed value, and the ✓ / ✗ badge next to the value.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from '../../styles';
import { REMOTE_SCHEME_RE } from '../constants';


//
// Public
//
/**
 * Drive ``source_type`` from the value: a remote scheme (``https://``, ``s3://``, ...) selects
 * ``remoteType``, anything else ``path``. Only switches between those two value-detectable
 * types — a deliberate choice of any other type (sql, api, column) is left alone.
 *
 * @param select - The source_type dropdown.
 * @param value - The current value text.
 * @param remoteType - The option meaning "remote" (``url`` for data, ``url/uri`` for audio).
 * @returns Whether the dropdown was changed.
 */
export function autoDetectSourceType(
  select: HTMLSelectElement, value: string, remoteType: string,
): boolean {
  const type = select.value;
  if (type !== 'path' && type !== remoteType) return false;
  const val = value.trim();
  if (!val) return false;
  const detected = REMOTE_SCHEME_RE.test(val) ? remoteType : 'path';
  if (detected === type) return false;
  select.value = detected;
  return true;
}


/** A hidden ✓ / ✗ badge (see ``setStatusBadge``). */
export function makeStatusBadge(): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.style.cssText = `font-size:14px;font-weight:700;display:none;`;
  return badge;
}


/**
 * Show ✓ (``ok``) or ✗ (failed) with a tooltip, or hide the badge (``null``).
 *
 * @param badge - Badge from ``makeStatusBadge``.
 * @param ok - Result, or null to clear.
 * @param okTitle - Tooltip for ✓.
 * @param failTitle - Tooltip for ✗.
 */
export function setStatusBadge(
  badge: HTMLSpanElement, ok: boolean | null, okTitle: string, failTitle: string,
): void {
  if (ok === null) { badge.style.display = 'none'; return; }
  badge.style.display = '';
  badge.textContent = ok ? '✓' : '✗';
  badge.style.color = ok ? COLORS.green : COLORS.red;
  badge.title = ok ? okTitle : failTitle;
}
