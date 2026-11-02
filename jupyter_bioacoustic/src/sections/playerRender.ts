/**
 * Canvas drawing for the spectrogram Player: annotation overlays (per tool), playhead,
 * detection shading, frequency axis and drag previews.
 *
 * Functions here only draw: they get canvas coordinates (or projection functions) from the
 * Player and never read its state, so the same code draws the on-screen canvas and the
 * capture image.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from '../styles';
import { AnnotBounds, MultiboxEntry } from '../types';
import { niceTickInterval } from './playerGeometry';


//
// Constants
//
/** Translucent overlay colors (palette colors with alpha). */
const RGBA = {
  shade: 'rgba(0,0,0,0.25)',
  playhead: 'rgba(205,214,244,0.9)',
  blueLine: 'rgba(137,180,250,0.85)',
  blueFill: 'rgba(137,180,250,0.1)',
  blueBand: 'rgba(137,180,250,0.08)',
  greenLine: 'rgba(166,227,161,0.85)',
  redLine: 'rgba(243,139,168,0.85)',
  yellowLine: 'rgba(249,226,175,0.85)',
  yellowFill: 'rgba(249,226,175,0.12)',
};
const MARKER_HALF_W = 6;
const MARKER_H = 10;
const PLAYHEAD_MARKER_H = 11;
const HANDLE_RADIUS = 4;
const DASH = [4, 4];
const AXIS_FONT_SIZE = 10;
const AXIS_TICK_LEN = 4;
/** Target spacing (px) between frequency-axis ticks. */
const AXIS_TICK_SPACING = 40;

/** The zoom-box preview fill color. */
export const ZOOM_BOX_FILL = RGBA.blueFill;


//
// Types
//
/** Maps data to canvas pixels for one canvas (on-screen or capture). */
export interface Projection {
  /** Absolute time (s) -> x. */
  tx: (t: number) => number;
  /** Frequency (Hz) -> y. */
  ty: (f: number) => number;
  /** Canvas height (px). */
  height: number;
}

/** What to draw for the annotation: the tool and its current values. */
export interface AnnotationView {
  tool: string;
  bounds: AnnotBounds;
  /** Multibox boxes (multibox tool only). */
  boxes: MultiboxEntry[];
  /** Index of the highlighted box, or -1. */
  activeBox: number;
}


//
// Public
//
/** Draw the annotation overlay for ``view.tool`` (nothing for unset values). */
export function drawAnnotation(
  ctx: CanvasRenderingContext2D, p: Projection, view: AnnotationView,
): void {
  const { st, et, flo, fhi } = view.bounds;
  const H = p.height;
  switch (view.tool) {
    case 'time_select':
      if (st == null) return;
      _drawTimeLine(ctx, p.tx(st), H, RGBA.blueLine, COLORS.blue);
      return;
    case 'start_end_time_select':
      if (st != null && et != null) {
        const sx = p.tx(st);
        ctx.fillStyle = RGBA.blueBand;
        ctx.fillRect(sx, 0, p.tx(et) - sx, H);
      }
      if (st != null) _drawTimeLine(ctx, p.tx(st), H, RGBA.greenLine, COLORS.green);
      if (et != null) _drawTimeLine(ctx, p.tx(et), H, RGBA.redLine, COLORS.red);
      return;
    case 'bounding_box': {
      if (st == null || et == null || flo == null || fhi == null) return;
      const sx = p.tx(st), ex = p.tx(et), yhi = p.ty(fhi), ylo = p.ty(flo);
      ctx.fillStyle = RGBA.blueFill;
      ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
      ctx.strokeStyle = RGBA.blueLine; ctx.lineWidth = 2;
      ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
      _drawCornerHandles(ctx, sx, ex, yhi, ylo, COLORS.blue);
      return;
    }
    case 'fixed_duration': {
      if (st == null || et == null) return;
      const sx = p.tx(st), ex = p.tx(et);
      ctx.fillStyle = RGBA.yellowFill;
      ctx.fillRect(sx, 0, ex - sx, H);
      _drawTimeLine(ctx, sx, H, RGBA.yellowLine, COLORS.yellow);
      _drawTimeLine(ctx, ex, H, RGBA.yellowLine, COLORS.yellow);
      return;
    }
    case 'multibox':
      view.boxes.forEach((box, i) => _drawMultibox(ctx, p, box, i === view.activeBox));
      return;
  }
}


/**
 * Darken everything left of ``left`` and right of ``right`` (the buffer around the
 * detection), within ``[x0, width]``.
 */
export function drawBufferShading(
  ctx: CanvasRenderingContext2D, left: number, right: number, x0: number, width: number,
  height: number,
): void {
  ctx.fillStyle = RGBA.shade;
  if (left > x0) ctx.fillRect(x0, 0, Math.floor(left) - x0, height);
  if (right < width) { const rx = Math.ceil(right); ctx.fillRect(rx, 0, width - rx, height); }
}


/** The playhead: a vertical line at ``x`` with a triangle marker on top. */
export function drawPlayhead(ctx: CanvasRenderingContext2D, x: number, height: number): void {
  ctx.strokeStyle = RGBA.playhead;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  _drawMarker(ctx, x, COLORS.textPrimary, PLAYHEAD_MARKER_H);
}


/** A dashed rectangle between two corners (drag previews), optionally filled. */
export function drawDashedRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  stroke: string, lineWidth: number, fill?: string,
): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(DASH);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
}


/**
 * The frequency axis strip (``axisW`` px wide): kHz tick labels at "nice" intervals over the
 * visible range ``[fMin, fMax]``, positioned with ``freqToY`` (so mel/log scales are right).
 */
export function drawFreqAxis(
  ctx: CanvasRenderingContext2D, height: number, axisW: number, padY: number,
  fMin: number, fMax: number, freqToY: (f: number) => number,
): void {
  const specH = height - 2 * padY;
  ctx.fillStyle = COLORS.bgCrust;
  ctx.fillRect(0, 0, axisW, height);

  const targetTicks = Math.max(2, Math.floor(specH / AXIS_TICK_SPACING));
  const tickInterval = niceTickInterval(fMax - fMin, targetTicks);
  const firstTick = Math.ceil(fMin / tickInterval) * tickInterval;

  ctx.fillStyle = COLORS.textSubtle;
  ctx.strokeStyle = COLORS.textMuted;
  ctx.lineWidth = 1;
  ctx.font = `${AXIS_FONT_SIZE}px ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let f = firstTick; f <= fMax; f += tickInterval) {
    const y = freqToY(f);
    ctx.beginPath();
    ctx.moveTo(axisW - AXIS_TICK_LEN, y);
    ctx.lineTo(axisW, y);
    ctx.stroke();
    // label in kHz (integer when possible)
    const khz = f / 1000;
    ctx.fillText(Number.isInteger(khz) ? String(khz) : khz.toFixed(1), axisW - AXIS_TICK_LEN - 2, y);
  }

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${AXIS_FONT_SIZE - 1}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('kHz', 2, AXIS_FONT_SIZE);
}


//
// Internal
//
/** A full-height vertical line with a triangle marker on top. */
function _drawTimeLine(
  ctx: CanvasRenderingContext2D, x: number, height: number, line: string, marker: string,
): void {
  ctx.strokeStyle = line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  _drawMarker(ctx, x, marker);
}


/** A downward triangle at the top of the canvas, centered on ``x``. */
function _drawMarker(
  ctx: CanvasRenderingContext2D, x: number, color: string, h: number = MARKER_H,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - MARKER_HALF_W, 0); ctx.lineTo(x + MARKER_HALF_W, 0); ctx.lineTo(x, h);
  ctx.closePath(); ctx.fill();
}


/** Round handles on the four corners of a box. */
function _drawCornerHandles(
  ctx: CanvasRenderingContext2D, sx: number, ex: number, yhi: number, ylo: number, color: string,
): void {
  ctx.fillStyle = color;
  for (const [px, py] of [[sx, yhi], [ex, yhi], [sx, ylo], [ex, ylo]]) {
    ctx.beginPath(); ctx.arc(px, py, HANDLE_RADIUS, 0, Math.PI * 2); ctx.fill();
  }
}


/** One multibox box: solid with handles when active, faint and dashed otherwise. */
function _drawMultibox(
  ctx: CanvasRenderingContext2D, p: Projection, box: MultiboxEntry, isActive: boolean,
): void {
  const sx = p.tx(box.startTime), ex = p.tx(box.endTime);
  const yhi = p.ty(box.maxFreq), ylo = p.ty(box.minFreq);
  ctx.fillStyle = isActive ? `${box.color}20` : `${box.color}0a`;
  ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
  ctx.strokeStyle = box.color;
  ctx.lineWidth = isActive ? 2.5 : 1;
  if (!isActive) ctx.setLineDash(DASH);
  ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
  ctx.setLineDash([]);
  if (isActive) _drawCornerHandles(ctx, sx, ex, yhi, ylo, box.color);
}
