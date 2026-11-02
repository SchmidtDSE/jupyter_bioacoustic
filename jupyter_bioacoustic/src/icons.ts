/**
 * SVG icons used by the annotator plugin (tab / launcher icon and launcher-dialog tiles).
 *
 * All icons are 24x24 line drawings using ``currentColor``, so they take the text color of
 * the element they are placed in.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { LabIcon } from '@jupyterlab/ui-components';


//
// Constants
//
/** Waveform-in-a-circle: the annotator's icon. */
export const bioacousticIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 12 C2 12 4 6 6 6 C8 6 8 18 10 18 C12 18 12 3 14 3 C16 3 16 21 18 21 C20 21 22 12 22 12"/>
  <circle cx="12" cy="12" r="11" stroke-width="1"/>
</svg>`;

/** Notebook page: the launcher dialog's "Notebook" tile. */
export const notebookIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16v16H4z"/>
    <path d="M8 4v16"/>
    <line x1="12" y1="8" x2="18" y2="8"/>
    <line x1="12" y1="12" x2="18" y2="12"/>
    <line x1="12" y1="16" x2="16" y2="16"/>
  </svg>`;

/** Document with lines: the launcher dialog's "Config Builder" tile. */
export const builderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>`;

/** The annotator icon as a JupyterLab ``LabIcon`` (tabs, launcher, palette). */
export const bioacousticIcon = new LabIcon({
  name: 'jupyter-bioacoustic:icon',
  svgstr: bioacousticIconSvg,
});
