/**
 * Player — spectrogram canvas, audio playback, annotation tools, capture.
 *
 * Owns the player controls bar, spectrogram canvas, playback bar, and all mouse / keyboard
 * interaction for the annotation tools. Reads annotation config and values from FormPanel
 * and writes them back through its setters.
 *
 * Related modules: ``playerControls`` builds the DOM, ``playerGeometry`` holds the pure
 * coordinate math, ``playerRender`` draws the overlays.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { Signal } from '@lumino/signaling';

import { KernelBridge } from '../kernel';
import { promptText } from '../modal';
import { resolveOutputTemplates, savePng, spectrogramPipeline } from '../python';
import { COLORS } from '../styles';
import { AudioConfig, Detection, StatusMessage, VizMeta } from '../types';
import {
  errorMessage, fmtTime, remoteScheme, resolveTemplate, slugify, splitSelected,
} from '../util';
import { AnnotationTools, GRAB_PX } from './annotationTools';
import { resolveAudioPath } from './audioPath';
import { FormPanel } from './FormPanel';
import { PlayerDom, buildPlayerDom } from './playerControls';
import {
  FreqScale, PixelBox, Segment, ViewWindow, fracToFreq, freqToFrac, freqToY, isTimeZoomed,
  isZoomed, panView, timeToX, xToTime, yToFreq, zoomToBox, zoomView,
} from './playerGeometry';
import {
  ZOOM_BOX_FILL, drawAnnotation, drawBufferShading, drawDashedRect, drawFreqAxis, drawPlayhead,
} from './playerRender';


//
// Constants
//
const DEFAULT_CANVAS_HEIGHT = 260;
/** Smallest zoom box (fraction of the view per side) that zooms. */
const MIN_ZOOM_BOX_FRAC = 0.02;
/** Arrow-key pan step (fraction of the view). */
const PAN_STEP = 0.1;
const RESIZE_DEBOUNCE_MS = 150;
/** Length loaded when the row has no end_time (s). */
const DEFAULT_ROW_DURATION_SEC = 12;
const REMOTE_LOAD_MSG: Record<string, string> = {
  url: '⬇ Downloading audio (first load may take a moment)…',
  s3: '⬇ Loading audio from S3…',
  gcs: '⬇ Loading audio from GCS…',
};
const DEFAULT_VIZ_META: VizMeta[] = [
  { type: 'builtin', key: 'linear', label: 'Linear', freq_scale: 'linear', index: 0 },
  { type: 'builtin', key: 'mel', label: 'Mel', freq_scale: 'mel', index: 1 },
];


//
// Types
//
/** What the Python spectrogram pipeline returns. */
interface SpectrogramResult {
  spec: string;
  wav: string;
  duration: number;
  sample_rate: number;
  freq_min: number;
  freq_max: number;
  freq_scale?: string;
  freq_scale_lut?: number[] | null;
  audio_warning?: string | null;
}


//
// Public
//
/** The spectrogram player section of the annotator. */
export class Player {
  /** Vertical padding (px) at top/bottom of canvas for freq axis labels. */
  private static readonly SPEC_PAD_Y = 8;
  /** Width (px) of the frequency axis strip on the left. */
  private static readonly AXIS_W = 40;

  /** The root element — contains player controls, canvas, playback bar, audio. */
  readonly element: HTMLDivElement;

  /** Status message for the widget header. */
  readonly statusChanged = new Signal<this, StatusMessage>(this);

  // ── Player state ─────────────────────────────────────────────
  private _specBitmap: ImageBitmap | null = null;
  private _segLoadStart = 0;
  private _segDuration = 0;
  private _detectionStart = 0;
  private _detectionEnd = 0;
  private _bufferSec = 5;
  private _playing = false;
  private _rafId = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private _freqMin = 0;
  private _freqMax = 0;
  private _playheadDrag = false;
  private _playRegion: { start: number; end: number } | null = null;

  // ── Zoom state (client-side crop of the spectrogram image) ───
  // View fractions: 0..1 range over the full spectrogram image (y: 0 = low freq)
  private _viewXMin = 0;
  private _viewXMax = 1;
  private _viewYMin = 0;
  private _viewYMax = 1;
  private _panDrag: { startX: number; startY: number; orig: ViewWindow } | null = null;
  private _zoomBoxActive = false;
  private _panToolActive = false;
  private _zoomBoxDrag: { startCx: number; startCy: number } | null = null;
  private _zoomBoxMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _zoomBoxUpHandler: ((e: MouseEvent) => void) | null = null;
  private _specResolutions: string[] = ['1000', '2000', '4000'];
  private _canvasHeight: number = DEFAULT_CANVAS_HEIGHT;

  // ── Visualization state ──────────────────────────────────────
  private _vizMeta: VizMeta[] = [];
  private _currentFreqScale: string = 'linear';
  private _freqScaleLUT: number[] | null = null; // 256 frac values for 'lut' scale

  // ── DOM ──────────────────────────────────────────────────────
  private readonly _dom: PlayerDom;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _audio: HTMLAudioElement;
  private readonly _tools: AnnotationTools;

  // ── Context ──────────────────────────────────────────────────
  private _audioConfig: AudioConfig = { type: 'path', value: '', prefix: '', suffix: '', fallback: '' };
  private _captureLabel = '';
  private _captureDir = '';
  private _captureHeight: number | undefined;
  private _titleTemplate = '';
  private _currentRow: Detection | null = null;
  private _dataIndexCol = 'id';

  /**
   * @param _kernel - Runs the spectrogram pipeline and capture saves.
   * @param _form - Source of the annotation config and values.
   */
  constructor(
    private readonly _kernel: KernelBridge,
    private readonly _form: FormPanel,
  ) {
    this.element = document.createElement('div');
    this.element.style.cssText = `display:contents;`; // transparent wrapper
    this._dom = buildPlayerDom({
      onLoad: () => void this._loadAudio(),
      onDirty: () => this._setLoadBtnDirty(),
      onApplyViewBounds: () => this._applyViewBounds(),
      onToggleZoomBox: () => this._setViewTool(this._zoomBoxActive ? null : 'zoom'),
      onTogglePan: () => this._setViewTool(this._panToolActive ? null : 'pan'),
      onResetZoom: () => this._resetZoom(),
      onCapture: () => void this._onCapture(),
      onTogglePlay: () => this._togglePlay(),
    }, DEFAULT_CANVAS_HEIGHT);
    this._canvas = this._dom.canvas;
    this._audio = this._dom.audio;
    this._tools = new AnnotationTools(_form, {
      timeToX: t => this._timeToX(t),
      xToTime: x => this._xToTime(x),
      yToFreq: y => this._yToFreq(y),
      pixelBox: (st, et, flo, fhi) => this._pixelBox(st, et, flo, fhi),
      segmentRange: () => [this._segLoadStart, this._segLoadStart + this._segDuration],
      renderFrame: () => this._renderFrame(),
      context: () => this._canvas.getContext('2d'),
      playRange: (start, end) => this._playRange(start, end),
      updateAnnotDisplay: () => this._updateAnnotDisplay(),
    });
    this._connectCanvasEvents();
    this.element.append(...this._dom.bars);
  }

  // ── Public API ───────────────────────────────────────────────

  /** Set context after kernel vars are read. */
  setContext(opts: {
    audioConfig: AudioConfig;
    captureLabel: string;
    captureDir: string;
    captureHeight?: number;
    titleTemplate: string;
    defaultBuffer: number;
    specResolutions: string[];
    vizMeta: VizMeta[];
    dataIndexCol: string;
    height?: number;
  }): void {
    if (opts.height) {
      this._canvasHeight = opts.height;
      this._dom.canvasContainer.style.flex = `0 0 ${opts.height}px`;
    }
    this._audioConfig = opts.audioConfig;
    this._captureLabel = opts.captureLabel;
    this._captureDir = opts.captureDir;
    this._captureHeight = opts.captureHeight;
    this._titleTemplate = opts.titleTemplate;
    this._dataIndexCol = opts.dataIndexCol;
    this._dom.bufferInput.value = String(opts.defaultBuffer);
    this._specResolutions = opts.specResolutions;
    this._rebuildResolutionSelect();
    this._vizMeta = opts.vizMeta.length > 0 ? opts.vizMeta : DEFAULT_VIZ_META;
    this._rebuildVizSelect();
    if (this._captureLabel) {
      this._dom.captureBtn.textContent = this._captureLabel;
      this._dom.captureBtn.style.display = '';
    }
    this._updateCursorForZoom();
  }

  /** Load audio for a row (called when a row is selected). */
  async loadRow(row: Detection): Promise<void> {
    this._currentRow = row;
    this._resetZoom();
    await this._loadAudio();
  }

  /** Re-render the spectrogram frame (after annotation change, etc.). */
  renderFrame(): void {
    this._renderFrame();
  }

  /** Update cursor for annotation mode. */
  updateCursor(): void {
    this._updateCursorForZoom();
  }

  /** Clear the annotation readout in the playback bar (a new row was selected). */
  clearAnnotDisplay(): void {
    this._dom.signalTimeDisplay.textContent = '';
  }

  /** Set up the resize observer (call from Widget.onAfterAttach). */
  attach(): void {
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
          this._canvas.width = Math.floor(width);
          this._canvas.height = Math.floor(height);
          if (this._specBitmap) this._renderFrame();
        }, RESIZE_DEBOUNCE_MS);
      }
    });
    this._resizeObserver.observe(this._dom.canvasContainer);
  }

  /** Tear down the resize observer (call from Widget.onBeforeDetach). */
  detach(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
    cancelAnimationFrame(this._rafId);
  }

  // ── Private: wiring ──────────────────────────────────────────

  /** Canvas mouse / keyboard handlers and the audio ``ended`` handler. */
  private _connectCanvasEvents(): void {
    this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
    this._canvas.addEventListener('dblclick', e => this._onCanvasDblClick(e));
    this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
    this._canvas.addEventListener('mouseup', e => this._onCanvasMouseUp(e));
    this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseLeave());
    // Note: no wheel zoom — two-finger trackpad scroll should not zoom the spectrogram
    this._canvas.addEventListener('keydown', e => this._onCanvasKeyDown(e));
    this._audio.addEventListener('ended', () => {
      this._stopPlayback();
      this._audio.currentTime = this._zoomStartTime();
      this._renderFrame();
    });
  }

  /** Activate the zoom-box or pan tool (they are exclusive), or neither. */
  private _setViewTool(tool: 'zoom' | 'pan' | null): void {
    this._zoomBoxActive = tool === 'zoom';
    this._panToolActive = tool === 'pan';
    this._dom.zoomBoxBtn.style.background = this._zoomBoxActive ? COLORS.overlay : COLORS.bgSurface1;
    this._dom.panToolBtn.style.background = this._panToolActive ? COLORS.overlay : COLORS.bgSurface1;
    this._updateCursorForZoom();
  }

  /** Zoom to the time / frequency window typed into the view-bounds bar. */
  private _applyViewBounds(): void {
    if (this._segDuration <= 0) return;
    const d = this._dom;
    const tMin = parseFloat(d.viewTimeMin.value);
    const tMax = parseFloat(d.viewTimeMax.value);
    if (!isNaN(tMin) && !isNaN(tMax) && tMax > tMin) {
      this._viewXMin = Math.max(0, (tMin - this._segLoadStart) / this._segDuration);
      this._viewXMax = Math.min(1, (tMax - this._segLoadStart) / this._segDuration);
    }
    const fMinKhz = parseFloat(d.viewFreqMin.value);
    const fMaxKhz = parseFloat(d.viewFreqMax.value);
    if (!isNaN(fMinKhz) && !isNaN(fMaxKhz) && fMaxKhz > fMinKhz && this._freqMax - this._freqMin > 0) {
      this._viewYMin = Math.max(0, this._freqToFrac(fMinKhz * 1000));
      this._viewYMax = Math.min(1, this._freqToFrac(fMaxKhz * 1000));
    }
    this._updateCursorForZoom();
    this._renderFrame();
  }

  // ── Private: audio loading ───────────────────────────────────

  /**
   * Load the current row's audio (± the buffer) and its spectrogram from the kernel, then
   * redraw. Stops playback first; reports progress / errors through ``statusChanged``.
   */
  private async _loadAudio(): Promise<void> {
    const audioPath = resolveAudioPath(this._audioConfig, this._currentRow);
    if (!audioPath) {
      console.error('[JBA] No audio configured — set audio param');
      this.statusChanged.emit({ message: '❌ No audio configured — set audio param', error: true });
      return;
    }

    const { loadBtn, canvasContainer } = this._dom;
    loadBtn.disabled = true;
    loadBtn.textContent = 'Updating…';
    loadBtn.style.opacity = '0.4';
    canvasContainer.style.opacity = '0.5';

    if (this._playing) {
      this._audio.pause();
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._dom.playBtn.textContent = '▶';
    }

    const bufVal = parseFloat(this._dom.bufferInput.value);
    this._bufferSec = Math.max(0, isNaN(bufVal) ? 0 : bufVal);
    const startTime = this._currentRow?.start_time ?? 0;
    const endTime = this._currentRow?.end_time ?? startTime + DEFAULT_ROW_DURATION_SEC;
    const loadStart = Math.max(0, startTime - this._bufferSec);
    const loadDur = (endTime + this._bufferSec) - loadStart;

    this._detectionStart = startTime;
    this._detectionEnd = endTime;
    this._segLoadStart = loadStart;

    const scheme = remoteScheme(audioPath);
    this.statusChanged.emit({
      message: scheme ? REMOTE_LOAD_MSG[scheme] : 'Loading audio…', error: false,
    });

    let result: SpectrogramResult;
    try {
      const vizIdx = parseInt(this._dom.spectTypeSelect.value) || 0;
      const viz = this._vizMeta[vizIdx] ?? this._vizMeta[0];
      const resW = parseInt(this._dom.resolutionSelect.value) || 2000;
      const raw = await this._kernel.exec(spectrogramPipeline(
        audioPath, loadStart, loadDur,
        viz.type === 'custom' ? 'custom' : 'builtin',
        viz.key, viz.index, resW, this._canvasHeight,
      ));
      result = JSON.parse(raw) as SpectrogramResult;
    } catch (e: unknown) {
      this.statusChanged.emit({ message: `❌ ${errorMessage(e)}`, error: true });
      this._resetLoadBtn();
      return;
    }

    this._segDuration = result.duration;
    this._freqMin = result.freq_min;
    this._freqMax = result.freq_max;
    this._currentFreqScale = result.freq_scale ?? 'linear';
    this._freqScaleLUT = result.freq_scale_lut ?? null;

    this.statusChanged.emit({ message: 'Decoding spectrogram…', error: false });
    try {
      const bytes = Uint8Array.from(atob(result.spec), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      if (this._specBitmap) this._specBitmap.close();
      this._specBitmap = await createImageBitmap(blob);
    } catch (e: unknown) {
      this.statusChanged.emit({ message: `❌ Image decode: ${errorMessage(e)}`, error: true });
      this._resetLoadBtn();
      return;
    }

    this._audio.src = `data:audio/wav;base64,${result.wav}`;
    this._audio.load();
    this._renderFrame();
    this._resetLoadBtn();

    const fname = audioPath.split('/').pop() ?? audioPath;
    if (result.audio_warning) {
      this.statusChanged.emit({
        message: `⚠ ${fname}: ${result.audio_warning}`, error: false, warning: true,
      });
    } else {
      this.statusChanged.emit({
        message: `✓ ${fname}  ${fmtTime(loadStart)}–${fmtTime(loadStart + result.duration)}`,
        error: false,
      });
    }
  }

  /** Put the Update button back in its clean (disabled) state and un-dim the canvas. */
  private _resetLoadBtn(): void {
    const btn = this._dom.loadBtn;
    btn.disabled = true;
    btn.textContent = 'Update';
    btn.style.opacity = '0.5';
    btn.style.cursor = 'default';
    this._dom.canvasContainer.style.opacity = '1';
  }

  /** Enable the Update button (a load control changed). */
  private _setLoadBtnDirty(): void {
    const btn = this._dom.loadBtn;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }

  // ── Private: rendering ───────────────────────────────────────

  /** Redraw the canvas: spectrogram crop, shading, playhead, annotation, axis, readouts. */
  private _renderFrame(): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const W = this._canvas.width, H = this._canvas.height;
    if (!W || !H) return;

    const padY = Player.SPEC_PAD_Y;
    const ax = Player.AXIS_W;

    ctx.fillStyle = COLORS.bgCrust;
    ctx.fillRect(0, 0, W, padY);
    ctx.fillRect(0, H - padY, W, padY);
    ctx.fillRect(0, 0, ax, H);

    if (this._specBitmap) {
      const src = this._bitmapViewRect(this._specBitmap);
      ctx.drawImage(this._specBitmap, src.sx, src.sy, src.sw, src.sh, ax, padY, W - ax, H - 2 * padY);
    } else {
      ctx.fillStyle = COLORS.bgCrust;
      ctx.fillRect(0, 0, W, H);
    }

    if (this._specBitmap && this._segDuration > 0) {
      drawBufferShading(
        ctx, this._timeToX(this._detectionStart), this._timeToX(this._detectionEnd), ax, W, H);
      drawPlayhead(ctx, Math.floor(Math.max(ax, Math.min(W, this._playheadX()))), H);
    }

    this._renderAnnotation(ctx, W, H);
    if (this._specBitmap && this._freqMax > this._freqMin) {
      const [fMin, fMax] = this._visibleFreqRange();
      drawFreqAxis(ctx, H, ax, padY, fMin, fMax, f => this._freqToY(f));
    }
    this._updateViewBoundsDisplay();

    const absNow = this._segLoadStart + this._audio.currentTime;
    const absEnd = this._segLoadStart + this._segDuration;
    this._dom.timeDisplay.textContent = `${fmtTime(absNow)} / ${fmtTime(absEnd)}`;
  }

  /**
   * Draw the annotation for the active tool (or the reviewed result). The capture canvas
   * passes its own size and no axis / padding.
   */
  private _renderAnnotation(
    ctx: CanvasRenderingContext2D, W: number, H: number, axisW?: number, padY?: number,
  ): void {
    if (!this._form.getAnnotConfig() || this._segDuration === 0) return;
    const reviewed = this._form.isShowingReviewedView();
    drawAnnotation(ctx, {
      tx: t => this._timeToX(t, W, axisW),
      ty: f => this._freqToY(f, H, padY),
      height: H,
    }, {
      tool: reviewed ? this._form.getReviewedTool() : this._form.getActiveTool(),
      bounds: this._tools.bounds(),
      boxes: reviewed ? this._form.getReviewedMultiboxEntries() : this._form.getMultiboxEntries(),
      activeBox: reviewed ? -1 : this._form.getActiveBoxIndex(),
    });
  }

  /** The source rectangle of ``bitmap`` that the current view shows. */
  private _bitmapViewRect(bitmap: ImageBitmap): { sx: number; sy: number; sw: number; sh: number } {
    const bw = bitmap.width, bh = bitmap.height;
    return {
      sx: this._viewXMin * bw,
      sw: (this._viewXMax - this._viewXMin) * bw,
      sy: (1 - this._viewYMax) * bh,
      sh: (this._viewYMax - this._viewYMin) * bh,
    };
  }

  /** Show the annotation values (time range, frequency range) in the playback bar. */
  private _updateAnnotDisplay(): void {
    if (!this._form.getAnnotConfig()) return;
    this._dom.signalTimeDisplay.textContent = this._tools.displayText();
  }

  /** Mirror the view window into the view-bounds inputs (skipping the focused one). */
  private _updateViewBoundsDisplay(): void {
    if (this._segDuration === 0) return;
    const d = this._dom;
    const [fMin, fMax] = this._visibleFreqRange();
    const values: Array<[HTMLInputElement, string]> = [
      [d.viewTimeMin, (this._segLoadStart + this._viewXMin * this._segDuration).toFixed(2)],
      [d.viewTimeMax, (this._segLoadStart + this._viewXMax * this._segDuration).toFixed(2)],
      [d.viewFreqMin, (fMin / 1000).toFixed(1)],
      [d.viewFreqMax, (fMax / 1000).toFixed(1)],
    ];
    for (const [input, value] of values) {
      if (document.activeElement !== input) input.value = value;
    }
  }

  /** Fill the resolution dropdown; ``selected::`` marks the default, else the 2nd option. */
  private _rebuildResolutionSelect(): void {
    const select = this._dom.resolutionSelect;
    select.innerHTML = '';
    let hasSelected = false;
    for (const raw of this._specResolutions) {
      const { value, selected } = splitSelected(String(raw));
      const o = document.createElement('option');
      o.value = value;
      o.textContent = `${value}px`;
      if (selected) { o.selected = true; hasSelected = true; }
      select.appendChild(o);
    }
    if (!hasSelected && select.options.length > 0) {
      select.options[Math.min(1, select.options.length - 1)].selected = true;
    }
  }

  /** Fill the spectrogram type dropdown from the viz metadata (first one selected). */
  private _rebuildVizSelect(): void {
    const select = this._dom.spectTypeSelect;
    select.innerHTML = '';
    this._vizMeta.forEach((v, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = v.label;
      if (i === 0) o.selected = true;
      select.appendChild(o);
    });
  }

  // ── Private: playback ────────────────────────────────────────

  /** Play / pause. When zoomed in time, playback is limited to the visible window. */
  private _togglePlay(): void {
    if (!this._specBitmap) return;
    if (this._playing) {
      this._audio.pause();
      this._stopPlayback();
      return;
    }
    if (isTimeZoomed(this._view) && this._segDuration > 0) {
      const start = this._viewXMin * this._segDuration;
      const end = this._viewXMax * this._segDuration;
      this._playRegion = { start, end };
      if (this._audio.currentTime < start || this._audio.currentTime >= end) {
        this._audio.currentTime = start;
      }
    } else {
      this._playRegion = null;
    }
    this._startPlayback();
  }

  /** Play ``[startSec, endSec]`` (absolute seconds) once — double-click on an annotation. */
  private _playRange(startSec: number, endSec: number): void {
    if (!this._specBitmap || this._segDuration <= 0) return;
    if (this._playing) {
      this._audio.pause();
      cancelAnimationFrame(this._rafId);
    }
    const start = Math.max(0, startSec - this._segLoadStart);
    const end = Math.min(this._segDuration, endSec - this._segLoadStart);
    if (end <= start) return;
    this._playRegion = { start, end };
    this._audio.currentTime = start;
    this._startPlayback();
  }

  /**
   * Start the audio and the redraw loop. The loop stops at the end of ``_playRegion`` (and
   * rewinds to its start) when one is set.
   */
  private _startPlayback(): void {
    void this._audio.play();
    this._playing = true;
    this._dom.playBtn.textContent = '⏸';
    const loop = () => {
      if (this._playRegion && this._audio.currentTime >= this._playRegion.end) {
        this._audio.pause();
        this._audio.currentTime = this._playRegion.start;
        this._stopPlayback();
        this._renderFrame();
        return;
      }
      this._renderFrame();
      if (this._playing) this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /** Mark playback stopped (the caller pauses / rewinds the audio as needed). */
  private _stopPlayback(): void {
    this._playing = false;
    this._playRegion = null;
    cancelAnimationFrame(this._rafId);
    this._dom.playBtn.textContent = '▶';
  }

  /** Where playback (re)starts: the start of the visible time window, or 0. */
  private _zoomStartTime(): number {
    return isTimeZoomed(this._view) ? this._viewXMin * this._segDuration : 0;
  }

  // ── Private: coordinates ─────────────────────────────────────

  /** The current view window. */
  private get _view(): ViewWindow {
    return { xMin: this._viewXMin, xMax: this._viewXMax, yMin: this._viewYMin, yMax: this._viewYMax };
  }

  private set _view(v: ViewWindow) {
    this._viewXMin = v.xMin;
    this._viewXMax = v.xMax;
    this._viewYMin = v.yMin;
    this._viewYMax = v.yMax;
  }

  /** The loaded segment. */
  private get _segment(): Segment {
    return { loadStart: this._segLoadStart, duration: this._segDuration };
  }

  /** The spectrogram's frequency scale. */
  private get _scale(): FreqScale {
    return {
      min: this._freqMin, max: this._freqMax, kind: this._currentFreqScale, lut: this._freqScaleLUT,
    };
  }

  /** Mouse position in canvas pixels. */
  private _canvasXY(e: MouseEvent): { cx: number; cy: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (this._canvas.width / rect.width),
      cy: (e.clientY - rect.top) * (this._canvas.height / rect.height),
    };
  }

  /** Like _canvasXY but clamped to canvas bounds. */
  private _canvasXYClamped(e: MouseEvent): { cx: number; cy: number } {
    const { cx, cy } = this._canvasXY(e);
    return {
      cx: Math.max(0, Math.min(this._canvas.width, cx)),
      cy: Math.max(0, Math.min(this._canvas.height, cy)),
    };
  }

  /** Convert absolute time to screen X, accounting for zoom. */
  private _timeToX(t: number, canvasW?: number, axisW?: number): number {
    return timeToX(
      t, this._segment, this._view, canvasW ?? this._canvas.width, axisW ?? Player.AXIS_W);
  }

  /** Convert screen X to absolute time, accounting for zoom. */
  private _xToTime(x: number): number {
    return xToTime(x, this._segment, this._view, this._canvas.width, Player.AXIS_W);
  }

  /** Map frequency to 0..1 fraction based on the current freq scale. */
  private _freqToFrac(f: number): number {
    return freqToFrac(f, this._scale);
  }

  /** Inverse: map 0..1 fraction to frequency based on the current freq scale. */
  private _fracToFreq(frac: number): number {
    return fracToFreq(frac, this._scale);
  }

  /** The frequencies (Hz) at the bottom and top of the current vertical view, on its scale. */
  private _visibleFreqRange(): [number, number] {
    return [this._fracToFreq(this._viewYMin), this._fracToFreq(this._viewYMax)];
  }

  /**
   * Convert frequency to Y on a canvas, accounting for zoom and padding. Defaults to the
   * on-screen canvas; capture passes its own height and no padding.
   */
  private _freqToY(f: number, canvasH?: number, padYOverride?: number): number {
    return freqToY(
      f, this._scale, this._view, canvasH ?? this._canvas.height,
      padYOverride ?? Player.SPEC_PAD_Y);
  }

  /** Convert screen Y to frequency, accounting for zoom and padding. */
  private _yToFreq(y: number): number {
    return yToFreq(y, this._scale, this._view, this._canvas.height, Player.SPEC_PAD_Y);
  }

  /** The playhead's x on the canvas (unclamped). */
  private _playheadX(): number {
    return this._timeToX(this._segLoadStart + this._audio.currentTime);
  }

  /** A data-space box in canvas pixels. */
  private _pixelBox(st: number, et: number, flo: number, fhi: number): PixelBox {
    return { sx: this._timeToX(st), ex: this._timeToX(et), yhi: this._freqToY(fhi), ylo: this._freqToY(flo) };
  }

  // ── Private: canvas mouse handlers ───────────────────────────

  /**
   * Mouse down, in priority order: zoom-box drag, playhead scrub, pan (pan tool, or zoomed
   * with no annotation tool), then the active annotation tool.
   */
  private _onCanvasMouseDown(e: MouseEvent): void {
    if (this._zoomBoxActive && this._specBitmap) {
      this._startZoomBoxDrag(e);
      return;
    }

    if (this._specBitmap && this._segDuration > 0) {
      const { cx } = this._canvasXY(e);
      if (Math.abs(cx - this._playheadX()) <= GRAB_PX) {
        this._playheadDrag = true;
        this._dom.canvasContainer.style.cursor = 'ew-resize';
        return;
      }
    }

    const ac = this._form.getAnnotConfig();
    const noTool = !ac || !this._form.getActiveTool();
    if ((this._panToolActive || noTool) && isZoomed(this._view) && this._specBitmap) {
      this._panDrag = { startX: e.clientX, startY: e.clientY, orig: this._view };
      this._dom.canvasContainer.style.cursor = 'grabbing';
      return;
    }
    if (!ac || !this._specBitmap || this._segDuration === 0 || this._form.isShowingReviewedView()) {
      return;
    }

    const { cx, cy } = this._canvasXY(e);
    if (this._tools.down(cx, cy)) return;
    this._renderFrame();
    this._updateAnnotDisplay();
  }

  /** Mouse move: playhead scrub, pan, hover cursor, or the current annotation drag. */
  private _onCanvasMouseMove(e: MouseEvent): void {
    if (this._zoomBoxDrag) return;   // handled at document level

    if (this._playheadDrag) {
      const { cx } = this._canvasXY(e);
      const frac = (this._xToTime(cx) - this._segLoadStart) / this._segDuration;
      this._audio.currentTime = Math.max(0, Math.min(this._segDuration, frac * this._segDuration));
      this._renderFrame();
      return;
    }

    if (this._panDrag) {
      const rect = this._canvas.getBoundingClientRect();
      const specCssW = rect.width * (1 - Player.AXIS_W / this._canvas.width);
      const { orig } = this._panDrag;
      const dx = (e.clientX - this._panDrag.startX) / specCssW;
      const dy = (e.clientY - this._panDrag.startY) / rect.height;
      this._view = panView(orig, -dx * (orig.xMax - orig.xMin), dy * (orig.yMax - orig.yMin));
      this._renderFrame();
      return;
    }

    const ac = this._form.getAnnotConfig();
    if (!this._specBitmap || this._segDuration === 0) return;
    const { cx, cy } = this._canvasXY(e);

    if (!this._tools.dragging) {
      if (Math.abs(cx - this._playheadX()) <= GRAB_PX) {
        this._dom.canvasContainer.style.cursor = 'ew-resize';
      } else if (ac && !this._form.isShowingReviewedView()) {
        this._dom.canvasContainer.style.cursor = this._tools.cursorAt(cx, cy);
      } else {
        this._updateCursorForZoom();
      }
      return;
    }
    if (!ac) return;

    const t = Math.max(this._segLoadStart, Math.min(
      this._segLoadStart + this._segDuration, this._xToTime(cx)));
    const f = Math.max(0, this._yToFreq(Math.max(0, Math.min(this._canvas.height, cy))));
    this._tools.move(t, f);
  }

  /** Cancel pan, playhead and annotation drags (but not a zoom-box drag) when leaving. */
  private _onCanvasMouseLeave(): void {
    if (this._zoomBoxDrag) return;
    this._panDrag = null;
    this._playheadDrag = false;
    this._tools.cancel();
    if (this._specBitmap) this._renderFrame();
  }

  /** Mouse up: end a scrub / pan, or commit a new multibox if it is big enough. */
  private _onCanvasMouseUp(e: MouseEvent): void {
    if (this._playheadDrag || this._panDrag) {
      this._playheadDrag = false;
      this._panDrag = null;
      this._updateCursorForZoom();
      return;
    }
    const { cx, cy } = this._canvasXY(e);
    this._tools.up(cx, cy);
    this._renderFrame();
  }

  /** Double-click: play the annotation / box under the pointer. */
  private _onCanvasDblClick(e: MouseEvent): void {
    if (!this._specBitmap || this._segDuration <= 0 || !this._form.getAnnotConfig()) return;
    const { cx, cy } = this._canvasXY(e);
    this._tools.dblClick(cx, cy);
  }

  // ── Private: zoom + pan ──────────────────────────────────────

  /** Begin a zoom-box drag; tracked on the document so it continues outside the canvas. */
  private _startZoomBoxDrag(e: MouseEvent): void {
    const { cx, cy } = this._canvasXYClamped(e);
    this._zoomBoxDrag = { startCx: cx, startCy: cy };
    this._zoomBoxMoveHandler = (ev: MouseEvent) => this._onZoomBoxMove(ev);
    this._zoomBoxUpHandler = (ev: MouseEvent) => this._onZoomBoxUp(ev);
    document.addEventListener('mousemove', this._zoomBoxMoveHandler);
    document.addEventListener('mouseup', this._zoomBoxUpHandler);
  }

  /** Redraw with the zoom-box preview. */
  private _onZoomBoxMove(e: MouseEvent): void {
    if (!this._zoomBoxDrag) return;
    const { cx, cy } = this._canvasXYClamped(e);
    this._renderFrame();
    const ctx = this._canvas.getContext('2d');
    if (ctx) {
      const { startCx, startCy } = this._zoomBoxDrag;
      drawDashedRect(
        ctx, Math.min(startCx, cx), Math.min(startCy, cy),
        Math.abs(cx - startCx), Math.abs(cy - startCy), COLORS.blue, 2, ZOOM_BOX_FILL);
    }
  }

  /** Finish a zoom-box drag: zoom if the box is big enough, then turn the tool off. */
  private _onZoomBoxUp(e: MouseEvent): void {
    if (this._zoomBoxMoveHandler) document.removeEventListener('mousemove', this._zoomBoxMoveHandler);
    if (this._zoomBoxUpHandler) document.removeEventListener('mouseup', this._zoomBoxUpHandler);
    this._zoomBoxMoveHandler = null;
    this._zoomBoxUpHandler = null;

    if (!this._zoomBoxDrag) return;
    const { cx, cy } = this._canvasXYClamped(e);
    const { startCx, startCy } = this._zoomBoxDrag;
    const H = this._canvas.height;
    const ax = Player.AXIS_W;
    const specW = this._canvas.width - ax;
    const x1 = Math.max(0, Math.min(startCx, cx) - ax) / specW;
    const x2 = Math.max(0, Math.max(startCx, cx) - ax) / specW;
    const y1 = Math.min(startCy, cy) / H;
    const y2 = Math.max(startCy, cy) / H;
    this._zoomBoxDrag = null;

    if ((x2 - x1) > MIN_ZOOM_BOX_FRAC && (y2 - y1) > MIN_ZOOM_BOX_FRAC) {
      this._view = zoomToBox(this._view, x1, x2, y1, y2);
    }
    this._setViewTool(null);
    this._renderFrame();
  }

  /**
   * Canvas shortcuts: ``+``/``-`` zoom, ``0`` reset, Space play/pause (Shift: from the
   * window start), arrows nudge the fixed window or pan when zoomed, Delete/Backspace remove
   * the active box or the fixed window.
   */
  private _onCanvasKeyDown(e: KeyboardEvent): void {
    const tool = this._form.getActiveTool();
    const isDelete = e.key === 'Delete' || e.key === 'Backspace';
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this._zoomBy(0.8);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this._zoomBy(1.25);
    } else if (e.key === '0') {
      e.preventDefault();
      this._resetZoom();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) {
        this._audio.currentTime = this._zoomStartTime();
        if (!this._playing) this._togglePlay();
        this._renderFrame();
      } else {
        this._togglePlay();
      }
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tool === 'fixed_duration') {
      if (this._tools.nudgeFixedWindow(e.key === 'ArrowLeft' ? -1 : 1)) {
        e.preventDefault();
        this._renderFrame();
      }
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (!isZoomed(this._view)) return;
      e.preventDefault();
      const vw = this._viewXMax - this._viewXMin;
      const vh = this._viewYMax - this._viewYMin;
      const dx = e.key === 'ArrowLeft' ? -PAN_STEP * vw : e.key === 'ArrowRight' ? PAN_STEP * vw : 0;
      const dy = e.key === 'ArrowUp' ? PAN_STEP * vh : e.key === 'ArrowDown' ? -PAN_STEP * vh : 0;
      this._view = panView(this._view, dx, dy);
      this._renderFrame();
    } else if (isDelete && this._form.isMultiboxMode()) {
      e.preventDefault();
      this._form.removeActiveMultiboxEntry();
      this._renderFrame();
    } else if (isDelete && tool === 'fixed_duration') {
      e.preventDefault();
      this._form.setAnnotValue('startTime', null);
      this._form.setAnnotValue('endTime', null);
      this._renderFrame();
    }
  }

  /** Zoom by ``factor`` around the view center (< 1 zooms in). */
  private _zoomBy(factor: number): void {
    this._view = zoomView(this._view, factor);
    this._updateCursorForZoom();
    this._renderFrame();
  }

  /** Show the whole spectrogram. */
  private _resetZoom(): void {
    this._view = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    this._updateCursorForZoom();
    this._renderFrame();
  }

  /** Canvas cursor for the current tool / zoom state (when not hovering anything). */
  private _updateCursorForZoom(): void {
    const panCursor = isZoomed(this._view) ? 'grab' : 'default';
    let cursor: string;
    if (this._zoomBoxActive) {
      cursor = 'crosshair';
    } else if (this._panToolActive) {
      cursor = panCursor;
    } else {
      cursor = this._form.getAnnotConfig() && this._form.getActiveTool() ? 'crosshair' : panCursor;
    }
    this._dom.canvasContainer.style.cursor = cursor;
  }

  // ── Private: capture ─────────────────────────────────────────

  /**
   * Default capture file name: the info-card title as a slug plus a timestamp, else
   * ``clip_<id>.png``.
   */
  private async _buildCaptureFilename(): Promise<string> {
    const row = this._currentRow;
    if (!row) return 'spectrogram.png';
    const resolved = this._titleTemplate ? resolveTemplate(this._titleTemplate, row) : '';
    if (!resolved) return `clip_${row[this._dataIndexCol]}.png`;
    const slug = slugify(resolved);
    try {
      const result = await this._kernel.exec(resolveOutputTemplates(`${slug}.[[%Y%m%d-%H%M]].png`));
      return JSON.parse(result).resolved;
    } catch (e: unknown) {
      console.error('Failed to resolve capture filename template:', e);
      return `${slug}.png`;
    }
  }

  /**
   * Save the visible spectrogram (with shading and annotation, no axis) as a PNG, after
   * asking for the file name.
   */
  private async _onCapture(): Promise<void> {
    if (!this._specBitmap) return;
    const defaultName = await this._buildCaptureFilename();
    const suggested = this._captureDir ? `${this._captureDir}/${defaultName}` : defaultName;
    const filename = await promptText({
      title: 'Save spectrogram as:', value: suggested, okLabel: 'Save',
    });
    if (!filename || !this._specBitmap) return;

    const b64 = this._renderCapture(this._specBitmap);
    if (!b64) return;
    try {
      await this._kernel.exec(savePng(filename, b64));
      this.statusChanged.emit({ message: `✓ Saved ${filename}`, error: false });
    } catch (e: unknown) {
      this.statusChanged.emit({ message: `❌ Save failed: ${errorMessage(e)}`, error: true });
    }
  }

  /**
   * Draw the capture image offscreen: the visible crop at the bitmap's horizontal resolution
   * and the display's aspect ratio (or the configured height).
   * @returns The PNG as base64, or null after reporting a failure.
   */
  private _renderCapture(bitmap: ImageBitmap): string | null {
    const fail = (why: string) => {
      this.statusChanged.emit({ message: `❌ Capture failed: ${why}`, error: true });
      return null;
    };
    const src = this._bitmapViewRect(bitmap);
    const W = Math.round(src.sw);
    const displayAspect = this._canvas.height / Math.max(1, this._canvas.width - Player.AXIS_W);
    const H = this._captureHeight ?? Math.round(W * displayAspect);
    if (W <= 0 || H <= 0) return fail('zoom region too small');

    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return fail('could not create canvas');

    ctx.drawImage(bitmap, src.sx, src.sy, src.sw, src.sh, 0, 0, W, H);
    if (this._segDuration > 0) {
      drawBufferShading(
        ctx, this._timeToX(this._detectionStart, W, 0), this._timeToX(this._detectionEnd, W, 0),
        0, W, H);
    }
    this._renderAnnotation(ctx, W, H, 0, 0);   // capture canvas: no axis, no padding

    let dataUrl: string;
    try {
      dataUrl = offscreen.toDataURL('image/png');
    } catch {
      return fail('image too large to encode');
    }
    return dataUrl.split(',')[1] || fail('image too large to encode');
  }
}
