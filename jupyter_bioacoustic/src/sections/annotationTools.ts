/**
 * Mouse / keyboard behaviour of the annotation tools on the spectrogram canvas
 * (``time_select``, ``start_end_time_select``, ``bounding_box``, ``fixed_duration``,
 * ``multibox``).
 *
 * The Player handles zoom, pan, playhead and playback, and forwards the remaining canvas
 * events here. Values are read from and written to the FormPanel; canvas coordinates come
 * from the Player through ``ToolCanvas``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { BoxEdge, dragBoxEdge } from '../boxEdges';
import { COLORS } from '../styles';
import { AnnotBounds, AnnotField } from '../types';
import { fmtTime } from '../util';
import { FormPanel } from './FormPanel';
import { PixelBox, clampWindow, hitTestBox, pointInBox } from './playerGeometry';
import { drawDashedRect } from './playerRender';


//
// Constants
//
/** How close (px) the pointer must be to an edge / line to grab it. */
export const GRAB_PX = 10;
/** Smallest new multibox (px per side) that is kept on release. */
const MIN_BOX_PX = 5;
const FIXED_DURATION_NUDGE_SEC = 0.05;


//
// Types
//
/** What the tools need from the Player's canvas. */
export interface ToolCanvas {
  /** Absolute time (s) -> canvas x. */
  timeToX(t: number): number;
  /** Canvas x -> absolute time (s). */
  xToTime(x: number): number;
  /** Canvas y -> frequency (Hz). */
  yToFreq(y: number): number;
  /** A data-space box in canvas pixels. */
  pixelBox(st: number, et: number, flo: number, fhi: number): PixelBox;
  /** The loaded segment as ``[start, end]`` (absolute seconds). */
  segmentRange(): [number, number];
  /** Redraw the canvas. */
  renderFrame(): void;
  /** 2-D context of the on-screen canvas (for drag previews). */
  context(): CanvasRenderingContext2D | null;
  /** Play ``[start, end]`` (absolute seconds) once. */
  playRange(start: number, end: number): void;
  /** Refresh the annotation readout in the playback bar. */
  updateAnnotDisplay(): void;
}

/** What a mouse drag on the canvas is changing. */
interface AnnotDrag {
  target: string;
  anchorTime?: number;
  anchorFreq?: number;
  boxIndex?: number;
}


//
// Public
//
/** Annotation-tool interaction for one Player. */
export class AnnotationTools {
  private _drag: AnnotDrag | null = null;

  /**
   * @param _form - Annotation config and values.
   * @param _canvas - Coordinates and redraws.
   */
  constructor(
    private readonly _form: FormPanel,
    private readonly _canvas: ToolCanvas,
  ) {}

  /** True while an annotation drag is in progress. */
  get dragging(): boolean {
    return this._drag !== null;
  }

  /**
   * The form value of annotation ``field``, or ``noCol`` when the annotation has no column
   * for it.
   */
  value(field: AnnotField, noCol: number | null = null): number | null {
    const col = this._form.getAnnotConfig()?.[field]?.col;
    return col ? this._form.getFormValue(col) : noCol;
  }

  /** All four annotation values (null when unset or not configured). */
  bounds(): AnnotBounds {
    return {
      st: this.value('startTime'),
      et: this.value('endTime'),
      flo: this.value('minFreq'),
      fhi: this.value('maxFreq'),
    };
  }

  /** The playback-bar readout for the current values (``⏱ 0:01.00 – 0:02.00 100–200 Hz``). */
  displayText(): string {
    const { st, et, flo, fhi } = this.bounds();
    const parts: string[] = [];
    if (st != null) parts.push(fmtTime(st));
    if (et != null) parts.push(`– ${fmtTime(et)}`);
    if (flo != null && fhi != null) parts.push(`${Math.round(flo)}–${Math.round(fhi)} Hz`);
    return parts.length ? `⏱ ${parts.join(' ')}` : '';
  }

  /**
   * Mouse down at ``(cx, cy)`` with the active tool.
   * @returns true if fully handled; false if the caller should redraw and refresh the readout.
   */
  down(cx: number, cy: number): boolean {
    switch (this._form.getActiveTool()) {
      case 'time_select':
        this._form.setAnnotValue('startTime', this._canvas.xToTime(cx));
        this._drag = { target: 'start' };
        return false;
      case 'start_end_time_select':
        this._downStartEnd(cx);
        return false;
      case 'bounding_box': return this._downBoundingBox(cx, cy);
      case 'fixed_duration': return this._downFixedDuration(cx);
      case 'multibox': return this._downMultibox(cx, cy);
      default: return false;
    }
  }

  /** Mouse move during a drag, at time ``t`` / frequency ``f`` (clamped to the segment). */
  move(t: number, f: number): void {
    const drag = this._drag;
    if (!drag) return;
    if (drag.target === 'multibox-new') {
      this._renderNewBoxPreview(drag, t, f);
      return;
    }
    this._applyDrag(drag, t, f);
    this._canvas.renderFrame();
    this._canvas.updateAnnotDisplay();
  }

  /** Mouse up at ``(cx, cy)``: commit a new multibox if it is big enough; end the drag. */
  up(cx: number, cy: number): void {
    const drag = this._drag;
    if (drag?.target === 'multibox-new') {
      const t = this._canvas.xToTime(cx);
      const f = this._canvas.yToFreq(cy);
      const tMin = Math.min(drag.anchorTime!, t), tMax = Math.max(drag.anchorTime!, t);
      const fMin = Math.min(drag.anchorFreq!, f), fMax = Math.max(drag.anchorFreq!, f);
      const box = this._canvas.pixelBox(tMin, tMax, fMin, fMax);
      if (Math.abs(box.ex - box.sx) > MIN_BOX_PX && Math.abs(box.ylo - box.yhi) > MIN_BOX_PX) {
        this._form.addMultiboxEntry(tMin, tMax, fMin, fMax);
      }
    }
    this._drag = null;
  }

  /** Abandon the current drag (pointer left the canvas). */
  cancel(): void {
    this._drag = null;
  }

  /** Double-click inside the annotation (or a multibox box) plays that range. */
  dblClick(cx: number, cy: number): void {
    const tool = this._form.getActiveTool();
    if (tool === 'bounding_box' || tool === 'fixed_duration') {
      const { st, et, flo, fhi } = this.bounds();
      if (st == null || et == null) return;
      if (tool === 'fixed_duration') {
        if (cx >= this._canvas.timeToX(st) && cx <= this._canvas.timeToX(et)) {
          this._canvas.playRange(st, et);
        }
      } else if (flo != null && fhi != null) {
        if (pointInBox(cx, cy, this._canvas.pixelBox(st, et, flo, fhi))) {
          this._canvas.playRange(st, et);
        }
      }
    } else if (tool === 'multibox') {
      const entries = this._form.getMultiboxEntries();
      for (let i = entries.length - 1; i >= 0; i--) {
        const b = entries[i];
        if (pointInBox(cx, cy, this._canvas.pixelBox(b.startTime, b.endTime, b.minFreq, b.maxFreq))) {
          this._form.setActiveBox(i);
          this._canvas.playRange(b.startTime, b.endTime);
          return;
        }
      }
    }
  }

  /** Hover cursor for the active tool: resize near grabbable lines/edges, else crosshair. */
  cursorAt(cx: number, cy: number): string {
    const { st, et, flo, fhi } = this.bounds();
    const near = (t: number | null) =>
      t != null && Math.abs(cx - this._canvas.timeToX(t)) <= GRAB_PX;
    switch (this._form.getActiveTool()) {
      case 'time_select':
        return near(st) ? 'ew-resize' : 'crosshair';
      case 'start_end_time_select':
        return near(st) || near(et) ? 'ew-resize' : 'crosshair';
      case 'bounding_box': {
        if (st == null || et == null || flo == null || fhi == null) return 'crosshair';
        const hit = hitTestBox(cx, cy, this._canvas.pixelBox(st, et, flo, fhi), GRAB_PX);
        if (hit === 'left' || hit === 'right') return 'ew-resize';
        if (hit === 'top' || hit === 'bottom') return 'ns-resize';
        return 'crosshair';
      }
      case 'fixed_duration':
        return st != null && et != null &&
          cx >= this._canvas.timeToX(st) && cx <= this._canvas.timeToX(et) ? 'grab' : 'crosshair';
      default:
        return 'crosshair';
    }
  }

  /**
   * Move the fixed window by one nudge step (``direction`` -1 = left, 1 = right), staying in
   * the segment.
   * @returns false if there is no window to move.
   */
  nudgeFixedWindow(direction: -1 | 1): boolean {
    const { st, et } = this.bounds();
    if (st == null || et == null) return false;
    const [lo, hi] = this._canvas.segmentRange();
    const dur = et - st;
    let ns = st + direction * FIXED_DURATION_NUDGE_SEC;
    if (ns < lo) ns = lo;
    if (ns + dur > hi) ns = hi - dur;
    this._form.setAnnotValue('startTime', ns);
    this._form.setAnnotValue('endTime', ns + dur);
    return true;
  }

  // ── Private: mouse down per tool ─────────────────────────────

  /** start/end tool: grab the nearer line, else move the nearer bound to the click. */
  private _downStartEnd(cx: number): void {
    const { st, et } = this.bounds();
    const sx = st != null ? this._canvas.timeToX(st) : -Infinity;
    const ex = et != null ? this._canvas.timeToX(et) : Infinity;
    if (Math.abs(cx - sx) <= GRAB_PX && Math.abs(cx - sx) <= Math.abs(cx - ex)) {
      this._drag = { target: 'start' };
    } else if (Math.abs(cx - ex) <= GRAB_PX) {
      this._drag = { target: 'end' };
    } else if (cx < (sx + ex) / 2) {
      this._form.setAnnotValue('startTime', this._canvas.xToTime(cx));
      this._drag = { target: 'start' };
    } else {
      this._form.setAnnotValue('endTime', this._canvas.xToTime(cx));
      this._drag = { target: 'end' };
    }
  }

  /** Bounding box: grab an edge, ignore clicks inside, else start a new box at the click. */
  private _downBoundingBox(cx: number, cy: number): boolean {
    const { st, et, flo, fhi } = this.bounds();
    if (st != null && et != null && flo != null && fhi != null) {
      const hit = hitTestBox(cx, cy, this._canvas.pixelBox(st, et, flo, fhi), GRAB_PX);
      if (hit === 'inside') return true;
      if (hit) {
        this._drag = { target: `box-${hit}` };
        this._canvas.renderFrame();
        this._canvas.updateAnnotDisplay();
        return true;
      }
    }
    const t = this._canvas.xToTime(cx);
    const f = this._canvas.yToFreq(cy);
    this._form.setAnnotValue('startTime', t);
    this._form.setAnnotValue('endTime', t);
    this._form.setAnnotValue('minFreq', f);
    this._form.setAnnotValue('maxFreq', f);
    this._drag = { target: 'box-corner', anchorTime: t, anchorFreq: f };
    return false;
  }

  /** Fixed window: grab it to move it; a click elsewhere clears it, or places it when unset. */
  private _downFixedDuration(cx: number): boolean {
    const { st, et } = this.bounds();
    if (st != null && et != null) {
      const sx = this._canvas.timeToX(st), ex = this._canvas.timeToX(et);
      if (cx >= sx - GRAB_PX && cx <= ex + GRAB_PX) {
        this._drag = { target: 'fixed-move', anchorTime: this._canvas.xToTime(cx) - (st + et) / 2 };
        this._canvas.renderFrame();
        this._canvas.updateAnnotDisplay();
        return true;
      }
      this._form.setAnnotValue('startTime', null);
      this._form.setAnnotValue('endTime', null);
    } else {
      const dur = this._form.getFixedDuration();
      const [s, en] = this._clampToSegment(this._canvas.xToTime(cx) - dur / 2, dur);
      this._form.setAnnotValue('startTime', s);
      this._form.setAnnotValue('endTime', en);
    }
    return false;
  }

  /**
   * Multibox: grab any box's edge (top-most box first), else select the box under the
   * click, else start drawing a new box.
   */
  private _downMultibox(cx: number, cy: number): boolean {
    const hits = this._form.getMultiboxEntries().map(b => hitTestBox(
      cx, cy, this._canvas.pixelBox(b.startTime, b.endTime, b.minFreq, b.maxFreq), GRAB_PX));
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i];
      if (hit && hit !== 'inside') {
        this._form.setActiveBox(i);
        this._drag = { target: `mb-${hit}`, boxIndex: i };
        this._canvas.renderFrame();
        return true;
      }
    }
    for (let i = hits.length - 1; i >= 0; i--) {
      if (hits[i] === 'inside') {
        this._form.setActiveBox(i);
        this._canvas.renderFrame();
        return true;
      }
    }
    this._drag = {
      target: 'multibox-new',
      anchorTime: this._canvas.xToTime(cx),
      anchorFreq: this._canvas.yToFreq(cy),
    };
    return false;
  }

  // ── Private: dragging ────────────────────────────────────────

  /** Apply a drag to time ``t`` / frequency ``f``; edges never cross their opposite edge. */
  private _applyDrag(drag: AnnotDrag, t: number, f: number): void {
    const form = this._form;
    switch (drag.target) {
      case 'start': {
        const endVal = this.value('endTime', Infinity);
        const keepOrder = form.getActiveTool() === 'start_end_time_select' && endVal != null;
        form.setAnnotValue('startTime', keepOrder ? Math.min(t, endVal!) : t);
        break;
      }
      case 'end':
      case 'box-right': {
        const startVal = this.value('startTime', -Infinity);
        if (startVal != null) form.setAnnotValue('endTime', Math.max(t, startVal));
        break;
      }
      case 'box-corner': {
        const at = drag.anchorTime ?? t;
        const af = drag.anchorFreq ?? f;
        form.setAnnotValue('startTime', Math.min(at, t));
        form.setAnnotValue('endTime', Math.max(at, t));
        form.setAnnotValue('minFreq', Math.min(af, f));
        form.setAnnotValue('maxFreq', Math.max(af, f));
        break;
      }
      case 'box-left': {
        const endVal = this.value('endTime', Infinity);
        if (endVal != null) form.setAnnotValue('startTime', Math.min(t, endVal));
        break;
      }
      case 'box-top': {
        const loVal = this.value('minFreq', 0);
        if (loVal != null) form.setAnnotValue('maxFreq', Math.max(f, loVal));
        break;
      }
      case 'box-bottom': {
        const hiVal = this.value('maxFreq', Infinity);
        if (hiVal != null) form.setAnnotValue('minFreq', Math.min(f, hiVal));
        break;
      }
      case 'fixed-move': {
        const dur = form.getFixedDuration();
        const [s, en] = this._clampToSegment(t - (drag.anchorTime ?? 0) - dur / 2, dur);
        form.setAnnotValue('startTime', s);
        form.setAnnotValue('endTime', en);
        break;
      }
      default:
        // multibox edges use their own 'mb-*' targets: they used to share the single-box
        // 'box-*' names, so the branches above caught them and the box never moved
        if (drag.target.startsWith('mb-') && drag.boxIndex != null) {
          const entry = form.getMultiboxEntries()[drag.boxIndex];
          if (entry) {
            const { field, value } = dragBoxEdge(entry, drag.target.slice(3) as BoxEdge, t, f);
            form.updateMultiboxBounds(drag.boxIndex, field, value);
          }
        }
    }
  }

  /** Redraw with a dashed preview of the multibox being drawn (committed on mouse up). */
  private _renderNewBoxPreview(drag: AnnotDrag, t: number, f: number): void {
    if (drag.anchorTime == null || drag.anchorFreq == null) return;
    this._canvas.renderFrame();
    const ctx = this._canvas.context();
    if (ctx) {
      const box = this._canvas.pixelBox(
        Math.min(drag.anchorTime, t), Math.max(drag.anchorTime, t),
        Math.min(drag.anchorFreq, f), Math.max(drag.anchorFreq, f));
      drawDashedRect(
        ctx, box.sx, box.yhi, box.ex - box.sx, box.ylo - box.yhi, COLORS.textPrimary, 1.5);
    }
    this._canvas.updateAnnotDisplay();
  }

  /** ``[start, start + dur]`` slid inside the loaded segment. */
  private _clampToSegment(start: number, dur: number): [number, number] {
    const [lo, hi] = this._canvas.segmentRange();
    return clampWindow(start, dur, lo, hi);
  }
}
