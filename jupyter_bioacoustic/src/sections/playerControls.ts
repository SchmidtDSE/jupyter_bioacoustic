/**
 * DOM construction for the spectrogram Player: the controls bar (type, resolution, buffer,
 * Update, Capture), the view-bounds bar (time/frequency window, zoom-box, pan, Reset), the
 * canvas container and the playback bar.
 *
 * Only builds elements and forwards clicks/keys to handlers; the Player owns all state.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { TOOLTIP } from '../text';
import {
  COLORS,
  barBottomStyle,
  barTopBottomStyle,
  btnStyle,
  inputStyle,
  labelStyle,
  monoTextStyle,
  selectStyle,
} from '../styles';


//
// Constants
//
const PAN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;


//
// Types
//
/** What the Player does when a control is used. */
export interface PlayerControlHandlers {
  /** Update clicked, or Enter in a load control: reload the spectrogram. */
  onLoad: () => void;
  /** A load control (type, resolution, buffer) changed: enable Update. */
  onDirty: () => void;
  /** A view-bounds input was committed (change / Enter). */
  onApplyViewBounds: () => void;
  onToggleZoomBox: () => void;
  onTogglePan: () => void;
  onResetZoom: () => void;
  onCapture: () => void;
  onTogglePlay: () => void;
}

/** The Player's elements, in display order (``bars``) and by role. */
export interface PlayerDom {
  /** Top-level elements to append, in order. */
  bars: HTMLElement[];
  spectTypeSelect: HTMLSelectElement;
  resolutionSelect: HTMLSelectElement;
  bufferInput: HTMLInputElement;
  loadBtn: HTMLButtonElement;
  captureBtn: HTMLButtonElement;
  viewTimeMin: HTMLInputElement;
  viewTimeMax: HTMLInputElement;
  viewFreqMin: HTMLInputElement;
  viewFreqMax: HTMLInputElement;
  zoomBoxBtn: HTMLButtonElement;
  panToolBtn: HTMLButtonElement;
  canvasContainer: HTMLDivElement;
  canvas: HTMLCanvasElement;
  playBtn: HTMLButtonElement;
  timeDisplay: HTMLSpanElement;
  signalTimeDisplay: HTMLSpanElement;
  audio: HTMLAudioElement;
}


//
// Public
//
/**
 * Build the Player's bars, canvas and (hidden) audio element.
 *
 * @param h - Control handlers.
 * @param canvasHeight - Initial canvas container height (px).
 */
export function buildPlayerDom(h: PlayerControlHandlers, canvasHeight: number): PlayerDom {
  // ── Controls bar ──────────────────────────────────────────────
  const playerCtrls = document.createElement('div');
  playerCtrls.style.cssText = barBottomStyle();

  const spectTypeSelect = _labeledSelect('Type', playerCtrls);
  const resolutionSelect = _labeledSelect('Res', playerCtrls);
  const bufferInput = _labeledNumber('Buffer (s)', '3', '50px', playerCtrls);

  const loadBtn = _button('Update', btnStyle(true), h.onLoad);
  playerCtrls.appendChild(loadBtn);

  const loadOnEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); h.onLoad(); }
  };
  bufferInput.addEventListener('input', h.onDirty);
  bufferInput.addEventListener('keydown', loadOnEnter);
  for (const sel of [spectTypeSelect, resolutionSelect]) {
    sel.addEventListener('change', h.onDirty);
    sel.addEventListener('keydown', loadOnEnter);
  }

  const captureBtn = _button('Capture', btnStyle() + `display:none;margin-left:auto;`, h.onCapture);
  playerCtrls.appendChild(captureBtn);

  // ── View bounds bar ───────────────────────────────────────────
  const viewBar = document.createElement('div');
  viewBar.style.cssText = barBottomStyle();

  const viewTimeMin = _labeledNumber('Time min (s)', '0', '70px', viewBar);
  const viewTimeMax = _labeledNumber('Time max (s)', '0', '70px', viewBar);
  const viewFreqMin = _labeledNumber('Freq min (kHz)', '0', '65px', viewBar);
  const viewFreqMax = _labeledNumber('Freq max (kHz)', '0', '65px', viewBar);
  for (const inp of [viewTimeMin, viewTimeMax, viewFreqMin, viewFreqMax]) {
    inp.addEventListener('change', h.onApplyViewBounds);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); h.onApplyViewBounds(); }
    });
  }

  const zoomBoxBtn = _button('⬚', btnStyle() + `font-size:13px;padding:2px 8px;`, h.onToggleZoomBox);
  zoomBoxBtn.title = TOOLTIP.zoomBox;
  const panToolBtn = _button(
    '', btnStyle() + `font-size:13px;padding:2px 8px;display:inline-flex;align-items:center;`,
    h.onTogglePan);
  panToolBtn.innerHTML = PAN_ICON_SVG;
  panToolBtn.title = TOOLTIP.panTool;
  viewBar.append(zoomBoxBtn, panToolBtn, _button('Reset', btnStyle(), h.onResetZoom));

  // ── Spectrogram canvas ────────────────────────────────────────
  const canvasContainer = document.createElement('div');
  canvasContainer.style.cssText =
    `flex:0 0 ${canvasHeight}px;position:relative;background:${COLORS.bgCrust};` +
    `overflow:hidden;cursor:default;transition:opacity 0.2s ease;`;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `display:block;width:100%;height:100%;`;
  canvas.tabIndex = 0; // focusable, for keyboard shortcuts
  canvas.style.outline = 'none';
  canvasContainer.appendChild(canvas);

  // ── Playback bar ──────────────────────────────────────────────
  const playBar = document.createElement('div');
  playBar.style.cssText = barTopBottomStyle();

  const playBtn = _button('▶', btnStyle() + `font-size:15px;width:34px;height:28px;`, h.onTogglePlay);

  const timeDisplay = document.createElement('span');
  timeDisplay.style.cssText = monoTextStyle();
  timeDisplay.textContent = '0:00.00 / 0:00.00';

  const signalTimeDisplay = document.createElement('span');
  signalTimeDisplay.style.cssText =
    `margin-left:auto;font-size:11px;color:${COLORS.mauve};font-family:ui-monospace,monospace;`;
  signalTimeDisplay.textContent = '';

  playBar.append(playBtn, timeDisplay, signalTimeDisplay);

  const audio = document.createElement('audio');
  audio.style.display = 'none';

  return {
    bars: [playerCtrls, viewBar, canvasContainer, playBar, audio],
    spectTypeSelect, resolutionSelect, bufferInput, loadBtn, captureBtn,
    viewTimeMin, viewTimeMax, viewFreqMin, viewFreqMax, zoomBoxBtn, panToolBtn,
    canvasContainer, canvas, playBtn, timeDisplay, signalTimeDisplay, audio,
  };
}


//
// Internal
//
/** A button with text, inline CSS and a click handler. */
function _button(text: string, css: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = css;
  btn.addEventListener('click', onClick);
  return btn;
}


/** ``<label>text <select></label>`` appended to ``parent``; returns the select. */
function _labeledSelect(text: string, parent: HTMLElement): HTMLSelectElement {
  const lbl = document.createElement('label');
  lbl.style.cssText = labelStyle();
  lbl.textContent = text;
  const sel = document.createElement('select');
  sel.style.cssText = selectStyle();
  lbl.appendChild(sel);
  parent.appendChild(lbl);
  return sel;
}


/** ``<label>text <input type=number></label>`` appended to ``parent``; returns the input. */
function _labeledNumber(
  text: string, value: string, width: string, parent: HTMLElement,
): HTMLInputElement {
  const lbl = document.createElement('label');
  lbl.style.cssText = labelStyle();
  lbl.textContent = text;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.value = value;
  inp.style.cssText = inputStyle(width);
  lbl.appendChild(inp);
  parent.appendChild(lbl);
  return inp;
}
