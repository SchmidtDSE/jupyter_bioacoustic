/**
 * Pure coordinate math for the spectrogram Player (no DOM), so it can be unit-tested.
 *
 * Terms:
 * - a *fraction* is a 0..1 position over the whole loaded spectrogram image (x: time,
 *   y: frequency with 0 = lowest frequency, on the image's frequency scale);
 * - the *view* is the zoomed-in window, as fractions (``xMin..xMax``, ``yMin..yMax``);
 * - *canvas* coordinates are pixels; the spectrogram is drawn right of a frequency axis
 *   ``axisW`` px wide, with ``padY`` px of padding above and below.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { BoxEdge } from '../boxEdges';


//
// Constants
//
/** The whole spectrogram (no zoom). */
export const FULL_VIEW: Readonly<ViewWindow> = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };


//
// Types
//
/** The visible window, as fractions of the full spectrogram. */
export interface ViewWindow {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** The loaded audio segment (absolute seconds). */
export interface Segment {
  loadStart: number;
  duration: number;
}

/** The spectrogram's frequency range and axis scale. */
export interface FreqScale {
  min: number;
  max: number;
  /** ``linear`` (default), ``mel``, ``log``, or ``lut`` (custom lookup table). */
  kind: string;
  /** For ``lut``: increasing fractions at evenly spaced frequencies from ``min`` to ``max``. */
  lut: number[] | null;
}

/** A box in canvas pixels (``yhi`` is the top edge, so ``yhi <= ylo``). */
export interface PixelBox {
  sx: number;
  ex: number;
  yhi: number;
  ylo: number;
}

/** Where a point is relative to a box: near an edge, inside it, or neither. */
export type BoxHit = BoxEdge | 'inside' | null;


//
// Public
//
// ── Frequency scales ──────────────────────────────────────────
/** Hz -> mel (HTK formula). */
export function hzToMel(f: number): number {
  return 2595 * Math.log10(1 + f / 700);
}


/** mel -> Hz (inverse of ``hzToMel``). */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}


/** Map a frequency (Hz) to its 0..1 fraction on ``scale``. */
export function freqToFrac(f: number, scale: FreqScale): number {
  const { min: fMin, max: fMax } = scale;
  if (scale.kind === 'mel') {
    const melMin = hzToMel(fMin);
    const melMax = hzToMel(fMax);
    return (melMax - melMin) > 0 ? (hzToMel(f) - melMin) / (melMax - melMin) : 0;
  } else if (scale.kind === 'log') {
    const logMin = Math.log(Math.max(1, fMin));
    const logMax = Math.log(Math.max(1, fMax));
    return (logMax - logMin) > 0 ? (Math.log(Math.max(1, f)) - logMin) / (logMax - logMin) : 0;
  } else if (scale.kind === 'lut' && scale.lut) {
    // Interpolate: the frac value at position (f - fMin) / (fMax - fMin) in the LUT
    const lut = scale.lut;
    const pos = (fMax - fMin) > 0 ? (f - fMin) / (fMax - fMin) * (lut.length - 1) : 0;
    const lo = Math.floor(pos), hi = Math.min(lo + 1, lut.length - 1);
    const t = pos - lo;
    return lut[lo] * (1 - t) + lut[hi] * t;
  }
  return (fMax - fMin) > 0 ? (f - fMin) / (fMax - fMin) : 0;
}


/** Map a 0..1 fraction on ``scale`` back to a frequency (Hz); inverse of ``freqToFrac``. */
export function fracToFreq(frac: number, scale: FreqScale): number {
  const { min: fMin, max: fMax } = scale;
  if (scale.kind === 'mel') {
    const melMin = hzToMel(fMin);
    const melMax = hzToMel(fMax);
    return melToHz(melMin + frac * (melMax - melMin));
  } else if (scale.kind === 'log') {
    const logMin = Math.log(Math.max(1, fMin));
    const logMax = Math.log(Math.max(1, fMax));
    return Math.exp(logMin + frac * (logMax - logMin));
  } else if (scale.kind === 'lut' && scale.lut) {
    // Binary search for the frac in the LUT, then interpolate the frequency
    const lut = scale.lut;
    let lo = 0, hi = lut.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (lut[mid] <= frac) lo = mid; else hi = mid;
    }
    const t = (lut[hi] - lut[lo]) > 0 ? (frac - lut[lo]) / (lut[hi] - lut[lo]) : 0;
    return fMin + ((lo + t) / (lut.length - 1)) * (fMax - fMin);
  }
  return fMin + frac * (fMax - fMin);
}


// ── Canvas <-> data ───────────────────────────────────────────
/** Absolute time (s) -> canvas x, for a canvas ``canvasW`` px wide. */
export function timeToX(
  t: number, seg: Segment, view: ViewWindow, canvasW: number, axisW: number,
): number {
  const frac = (t - seg.loadStart) / seg.duration;
  return axisW + ((frac - view.xMin) / (view.xMax - view.xMin)) * (canvasW - axisW);
}


/** Canvas x -> absolute time (s); inverse of ``timeToX``. */
export function xToTime(
  x: number, seg: Segment, view: ViewWindow, canvasW: number, axisW: number,
): number {
  const viewFrac = view.xMin + ((x - axisW) / (canvasW - axisW)) * (view.xMax - view.xMin);
  return seg.loadStart + viewFrac * seg.duration;
}


/** Frequency (Hz) -> canvas y, for a canvas ``canvasH`` px tall with ``padY`` padding. */
export function freqToY(
  f: number, scale: FreqScale, view: ViewWindow, canvasH: number, padY: number,
): number {
  const specH = canvasH - 2 * padY;
  const viewFrac = (freqToFrac(f, scale) - view.yMin) / (view.yMax - view.yMin);
  return padY + specH * (1 - viewFrac);
}


/** Canvas y -> frequency (Hz); inverse of ``freqToY``. */
export function yToFreq(
  y: number, scale: FreqScale, view: ViewWindow, canvasH: number, padY: number,
): number {
  const specH = canvasH - 2 * padY;
  const viewFrac = 1 - (y - padY) / specH;
  return fracToFreq(view.yMin + viewFrac * (view.yMax - view.yMin), scale);
}


// ── View window ───────────────────────────────────────────────
/** True if the view is zoomed in on either axis. */
export function isZoomed(view: ViewWindow): boolean {
  return view.xMin > 0 || view.xMax < 1 || view.yMin > 0 || view.yMax < 1;
}


/** True if the view is zoomed in on the time axis. */
export function isTimeZoomed(view: ViewWindow): boolean {
  return view.xMin > 0 || view.xMax < 1;
}


/**
 * Move the view by ``dx`` / ``dy`` (fractions, +y = up), keeping its size and staying inside
 * the spectrogram.
 */
export function panView(view: ViewWindow, dx: number, dy: number): ViewWindow {
  const w = view.xMax - view.xMin;
  const h = view.yMax - view.yMin;
  const xMin = Math.max(0, Math.min(1 - w, view.xMin + dx));
  const yMin = Math.max(0, Math.min(1 - h, view.yMin + dy));
  return { xMin, xMax: xMin + w, yMin, yMax: yMin + h };
}


/**
 * Zoom the view by ``factor`` (< 1 zooms in) around a point given as a fraction of the
 * current view (default: its center), staying inside the spectrogram.
 */
export function zoomView(view: ViewWindow, factor: number, cx?: number, cy?: number): ViewWindow {
  const viewW = view.xMax - view.xMin;
  const viewH = view.yMax - view.yMin;
  const centerX = cx !== undefined ? view.xMin + cx * viewW : (view.xMin + view.xMax) / 2;
  const centerY = cy !== undefined ? view.yMin + cy * viewH : (view.yMin + view.yMax) / 2;
  const newW = Math.min(1, viewW * factor);
  const newH = Math.min(1, viewH * factor);
  let xMin = centerX - newW * ((centerX - view.xMin) / viewW);
  let yMin = centerY - newH * ((centerY - view.yMin) / viewH);
  xMin = Math.max(0, Math.min(1 - newW, xMin));
  yMin = Math.max(0, Math.min(1 - newH, yMin));
  return { xMin, xMax: xMin + newW, yMin, yMax: yMin + newH };
}


/**
 * Zoom into a box drawn on the canvas, given as fractions of the current view
 * (``x1 < x2`` left to right, ``y1 < y2`` top to bottom).
 */
export function zoomToBox(
  view: ViewWindow, x1: number, x2: number, y1: number, y2: number,
): ViewWindow {
  const vw = view.xMax - view.xMin;
  const vh = view.yMax - view.yMin;
  const xMin = view.xMin + x1 * vw;
  // y is inverted: the top of the canvas is the high frequency
  return {
    xMin,
    xMax: xMin + (x2 - x1) * vw,
    yMin: view.yMin + (1 - y2) * vh,
    yMax: view.yMin + (1 - y1) * vh,
  };
}


/**
 * Place a fixed-length window ``[start, start + dur]`` inside ``[lo, hi]``, sliding it
 * back in when it sticks out.
 */
export function clampWindow(start: number, dur: number, lo: number, hi: number): [number, number] {
  let s = start, e = start + dur;
  if (s < lo) { s = lo; e = lo + dur; }
  if (e > hi) { e = hi; s = hi - dur; }
  return [s, e];
}


// ── Hit testing / axis ────────────────────────────────────────
/**
 * Which edge of ``box`` the point is within ``grab`` px of (left, right, top, bottom — in that
 * order), else ``'inside'`` if it is inside the box, else null.
 */
export function hitTestBox(cx: number, cy: number, box: PixelBox, grab: number): BoxHit {
  const { sx, ex, yhi, ylo } = box;
  const inY = cy >= yhi - grab && cy <= ylo + grab;
  const inX = cx >= sx - grab && cx <= ex + grab;
  if (inY && Math.abs(cx - sx) <= grab) return 'left';
  if (inY && Math.abs(cx - ex) <= grab) return 'right';
  if (inX && Math.abs(cy - yhi) <= grab) return 'top';
  if (inX && Math.abs(cy - ylo) <= grab) return 'bottom';
  return pointInBox(cx, cy, box) ? 'inside' : null;
}


/** True if the point is inside ``box`` (edges included, no tolerance). */
export function pointInBox(cx: number, cy: number, box: PixelBox): boolean {
  return cx >= box.sx && cx <= box.ex && cy >= box.yhi && cy <= box.ylo;
}


/** A "nice" axis tick step (1, 2 or 5 x 10^n) giving about ``targetTicks`` ticks over ``range``. */
export function niceTickInterval(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}
