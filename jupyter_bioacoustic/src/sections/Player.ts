/**
 * Player — spectrogram canvas, audio playback, annotation tools, capture.
 *
 * Owns the player controls bar, spectrogram canvas, playback bar, and
 * all mouse interaction for annotation tools. Reads annotation config
 * and values from FormPanel.
 */
import { Signal } from '@lumino/signaling';
import { Detection } from '../types';
import { KernelBridge } from '../kernel';
import { FormPanel } from './FormPanel';
import { fmtTime } from '../util';
import { spectrogramPipeline, savePng } from '../python';
import {
  COLORS,
  inputStyle,
  selectStyle,
  labelStyle,
  btnStyle,
  barBottomStyle,
  barTopBottomStyle,
  monoTextStyle,
} from '../styles';

export class Player {
  /** The root element — contains player controls, canvas, playback bar, audio. */
  readonly element: HTMLDivElement;

  // ─── Signals ───────────────────────────────────────────────

  /** Status message for the widget header. */
  readonly statusChanged = new Signal<this, { message: string; error: boolean }>(this);

  // ─── Player state ─────────────────────────────────────────

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
  private _sampleRate = 0;
  private _freqMin = 0;
  private _freqMax = 0;
  private _annotDrag: { target: string; anchorTime?: number; anchorFreq?: number; boxIndex?: number } | null = null;

  // ─── Zoom state (client-side crop) ────────────────────────
  // View fractions: 0..1 range over the full spectrogram image
  private _viewXMin = 0;  // left edge (time fraction)
  private _viewXMax = 1;  // right edge
  private _viewYMin = 0;  // bottom edge (freq fraction, 0=low freq)
  private _viewYMax = 1;  // top edge
  private _panDrag: { startX: number; startY: number; origXMin: number; origXMax: number; origYMin: number; origYMax: number } | null = null;
  private _zoomBoxActive = false;
  private _zoomBoxDrag: { startCx: number; startCy: number } | null = null;
  private _zoomBoxMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _zoomBoxUpHandler: ((e: MouseEvent) => void) | null = null;
  private _specResolutions: string[] = ['1000', '2000', '4000'];
  /** Vertical padding (px) at top/bottom of canvas for freq axis labels. */
  private static readonly SPEC_PAD_Y = 8;

  // ─── DOM refs ──────────────────────────────────────────────

  private _spectTypeSelect!: HTMLSelectElement;
  private _resolutionSelect!: HTMLSelectElement;
  private _bufferInput!: HTMLInputElement;
  private _startInput!: HTMLInputElement;
  private _endInput!: HTMLInputElement;
  private _viewFreqMinDisplay!: HTMLInputElement;
  private _viewFreqMaxDisplay!: HTMLInputElement;
  private _viewTimeMinDisplay!: HTMLInputElement;
  private _viewTimeMaxDisplay!: HTMLInputElement;
  private _canvas!: HTMLCanvasElement;
  private _canvasContainer!: HTMLDivElement;
  private _playBtn!: HTMLButtonElement;
  private _timeDisplay!: HTMLSpanElement;
  private _signalTimeDisplay!: HTMLSpanElement;
  private _audio!: HTMLAudioElement;
  private _loadBtn!: HTMLButtonElement;
  private _zoomBoxBtn!: HTMLButtonElement;
  private _captureBtn!: HTMLButtonElement;

  // ─── Context ───────────────────────────────────────────────

  private _audioConfig = { type: 'path', value: '', prefix: '', suffix: '', fallback: '' };
  private _captureLabel = '';
  private _captureDir = '';
  private _identCol = '';
  private _displayCols: string[] = [];
  private _currentRow: Detection | null = null;
  private _rows: Detection[] = [];
  private _selectedIdx = -1;

  constructor(
    private _kernel: KernelBridge,
    private _form: FormPanel,
  ) {
    this.element = document.createElement('div');
    this.element.style.cssText = `display:contents;`; // transparent wrapper
    this._buildUI();
  }

  // ─── Public API ────────────────────────────────────────────

  /** Set context after kernel vars are read. */
  setContext(opts: {
    audioConfig: { type: string; value: string; prefix: string; suffix: string; fallback: string };
    captureLabel: string;
    captureDir: string;
    identCol: string;
    displayCols: string[];
    defaultBuffer: number;
    specResolutions: string[];
    rows: Detection[];
  }): void {
    this._audioConfig = opts.audioConfig;
    this._captureLabel = opts.captureLabel;
    this._captureDir = opts.captureDir;
    this._identCol = opts.identCol;
    this._displayCols = opts.displayCols;
    this._rows = opts.rows;
    this._bufferInput.value = String(opts.defaultBuffer);
    this._specResolutions = opts.specResolutions;
    this._rebuildResolutionSelect();
    if (this._captureLabel) {
      this._captureBtn.textContent = this._captureLabel;
      this._captureBtn.style.display = '';
    }
    this._updateCursorForZoom();
  }

  /** Load audio for a row (called when a row is selected). */
  async loadRow(row: Detection): Promise<void> {
    this._currentRow = row;
    this._startInput.value = String(row.start_time);
    this._endInput.value = String(row.end_time);
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
        }, 150);
      }
    });
    this._resizeObserver.observe(this._canvasContainer);
  }

  /** Tear down the resize observer (call from Widget.onBeforeDetach). */
  detach(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
    cancelAnimationFrame(this._rafId);
  }

  /** Get the signal time display element (for orchestrator to update text). */
  get signalTimeDisplay(): HTMLSpanElement {
    return this._signalTimeDisplay;
  }

  // ─── Private: UI ───────────────────────────────────────────

  private _buildUI(): void {
    // Player controls bar
    const playerCtrls = document.createElement('div');
    playerCtrls.style.cssText = barBottomStyle();

    const mkNumInput = (labelText: string, def: string, w = '65px', container?: HTMLElement): HTMLInputElement => {
      const lbl = document.createElement('label');
      lbl.style.cssText = labelStyle();
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = def;
      inp.style.cssText = inputStyle(w);
      lbl.appendChild(inp);
      (container ?? playerCtrls).appendChild(lbl);
      return inp;
    };

    const typeLbl = document.createElement('label');
    typeLbl.style.cssText = labelStyle();
    typeLbl.textContent = 'Type';
    this._spectTypeSelect = document.createElement('select');
    this._spectTypeSelect.style.cssText = selectStyle();
    ['plain', 'mel'].forEach(v => {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      this._spectTypeSelect.appendChild(o);
    });
    typeLbl.appendChild(this._spectTypeSelect);
    playerCtrls.appendChild(typeLbl);

    // Resolution selector
    const resLbl = document.createElement('label');
    resLbl.style.cssText = labelStyle();
    resLbl.textContent = 'Res';
    this._resolutionSelect = document.createElement('select');
    this._resolutionSelect.style.cssText = selectStyle();
    resLbl.appendChild(this._resolutionSelect);
    playerCtrls.appendChild(resLbl);

    this._bufferInput = mkNumInput('Buffer (s)', '3', '50px');
    this._startInput = mkNumInput('Start (s)', '0', '70px');
    this._endInput = mkNumInput('End (s)', '12', '70px');

    this._loadBtn = document.createElement('button');
    this._loadBtn.textContent = 'Update';
    this._loadBtn.style.cssText = btnStyle(true);
    this._loadBtn.addEventListener('click', () => void this._loadAudio());
    playerCtrls.appendChild(this._loadBtn);

    this._captureBtn = document.createElement('button');
    this._captureBtn.textContent = 'Capture';
    this._captureBtn.style.cssText = btnStyle() + `display:none;margin-left:auto;`;
    this._captureBtn.addEventListener('click', () => void this._onCapture());
    playerCtrls.appendChild(this._captureBtn);

    // View bounds bar (shows current zoom window)
    const viewBar = document.createElement('div');
    viewBar.style.cssText = barBottomStyle();

    this._viewTimeMinDisplay = mkNumInput('Time min (s)', '0', '70px', viewBar);
    this._viewTimeMaxDisplay = mkNumInput('Time max (s)', '0', '70px', viewBar);
    this._viewFreqMinDisplay = mkNumInput('Freq min (kHz)', '0', '65px', viewBar);
    this._viewFreqMaxDisplay = mkNumInput('Freq max (kHz)', '0', '65px', viewBar);

    const applyViewBounds = () => {
      if (this._segDuration <= 0) return;
      const tMin = parseFloat(this._viewTimeMinDisplay.value);
      const tMax = parseFloat(this._viewTimeMaxDisplay.value);
      if (!isNaN(tMin) && !isNaN(tMax) && tMax > tMin) {
        this._viewXMin = Math.max(0, (tMin - this._segLoadStart) / this._segDuration);
        this._viewXMax = Math.min(1, (tMax - this._segLoadStart) / this._segDuration);
      }
      const fMinKhz = parseFloat(this._viewFreqMinDisplay.value);
      const fMaxKhz = parseFloat(this._viewFreqMaxDisplay.value);
      const fRange = this._freqMax - this._freqMin;
      if (!isNaN(fMinKhz) && !isNaN(fMaxKhz) && fMaxKhz > fMinKhz && fRange > 0) {
        this._viewYMin = Math.max(0, (fMinKhz * 1000 - this._freqMin) / fRange);
        this._viewYMax = Math.min(1, (fMaxKhz * 1000 - this._freqMin) / fRange);
      }
      this._updateCursorForZoom();
      this._renderFrame();
    };

    const onEnterOrBlur = (inp: HTMLInputElement) => {
      inp.addEventListener('change', applyViewBounds);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyViewBounds(); } });
    };
    onEnterOrBlur(this._viewTimeMinDisplay);
    onEnterOrBlur(this._viewTimeMaxDisplay);
    onEnterOrBlur(this._viewFreqMinDisplay);
    onEnterOrBlur(this._viewFreqMaxDisplay);

    this._zoomBoxBtn = document.createElement('button');
    this._zoomBoxBtn.textContent = '⬚';
    this._zoomBoxBtn.title = 'Zoom to selection — draw a box on the spectrogram';
    this._zoomBoxBtn.style.cssText = btnStyle() + `font-size:13px;padding:2px 8px;`;
    this._zoomBoxBtn.addEventListener('click', () => {
      this._zoomBoxActive = !this._zoomBoxActive;
      this._zoomBoxBtn.style.background = this._zoomBoxActive ? COLORS.overlay : COLORS.bgSurface1;
      this._canvasContainer.style.cursor = this._zoomBoxActive ? 'crosshair' : 'default';
    });
    viewBar.appendChild(this._zoomBoxBtn);

    const zoomResetBtn = document.createElement('button');
    zoomResetBtn.textContent = 'Reset';
    zoomResetBtn.style.cssText = btnStyle();
    zoomResetBtn.addEventListener('click', () => this._resetZoom());
    viewBar.appendChild(zoomResetBtn);

    // Spectrogram canvas
    this._canvasContainer = document.createElement('div');
    this._canvasContainer.style.cssText =
      `flex:1;position:relative;min-height:80px;background:${COLORS.bgCrust};overflow:hidden;cursor:default;`;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `display:block;width:100%;height:100%;`;
    this._canvas.tabIndex = 0; // make focusable for keyboard events
    this._canvas.style.outline = 'none';
    this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
    this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
    this._canvas.addEventListener('mouseup', e => this._onCanvasMouseUp(e));
    this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseLeave());
    // Note: no wheel zoom — two-finger trackpad scroll should not zoom the spectrogram
    this._canvas.addEventListener('keydown', e => this._onCanvasKeyDown(e));
    this._canvasContainer.appendChild(this._canvas);

    // Playback bar
    const playBar = document.createElement('div');
    playBar.style.cssText = barTopBottomStyle();

    this._playBtn = document.createElement('button');
    this._playBtn.textContent = '▶';
    this._playBtn.style.cssText = btnStyle() + `font-size:15px;width:34px;height:28px;`;
    this._playBtn.addEventListener('click', () => this._togglePlay());

    this._timeDisplay = document.createElement('span');
    this._timeDisplay.style.cssText = monoTextStyle();
    this._timeDisplay.textContent = '0:00.00 / 0:00.00';

    this._signalTimeDisplay = document.createElement('span');
    this._signalTimeDisplay.style.cssText =
      `margin-left:auto;font-size:11px;color:${COLORS.mauve};font-family:ui-monospace,monospace;`;
    this._signalTimeDisplay.textContent = '';

    playBar.append(this._playBtn, this._timeDisplay, this._signalTimeDisplay);

    // Hidden audio element
    this._audio = document.createElement('audio');
    this._audio.style.display = 'none';
    this._audio.addEventListener('ended', () => {
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._playBtn.textContent = '▶';
      this._renderFrame();
    });

    // Assemble
    this.element.append(playerCtrls, viewBar, this._canvasContainer, playBar, this._audio);
  }

  // ─── Private: audio loading ────────────────────────────────

  /**
   * Apply prefix/suffix to a raw audio path based on the audio type.
   * - path/url: join with '/'
   * - url prefix: insert after protocol (e.g. s3://prefix/rest)
   */
  private _applyPrefixSuffix(raw: string): string {
    const { prefix, suffix, type } = this._audioConfig;
    if (!prefix && !suffix) return raw;

    if (type === 'url' || raw.match(/^(https?|s3|gs):\/\//)) {
      const m = raw.match(/^(https?:\/\/|s3:\/\/|gs:\/\/)(.*)/);
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

  private _resolveAudioPath(): string {
    const { type, value, fallback } = this._audioConfig;

    if (type === 'column') {
      // Read the column value from the current row
      if (this._currentRow) {
        const colVal = this._currentRow[value];
        if (colVal != null && String(colVal).trim()) {
          return this._applyPrefixSuffix(String(colVal));
        }
      }
      // Fallback (already a complete path — no prefix/suffix)
      return fallback || '';
    }

    // path or url — apply prefix/suffix directly
    return this._applyPrefixSuffix(value);
  }

  private async _loadAudio(): Promise<void> {
    const audioPath = this._resolveAudioPath();
    if (!audioPath) {
      this.statusChanged.emit({ message: '❌ No audio configured — set audio param', error: true });
      return;
    }

    // Disable Update button while loading
    this._loadBtn.disabled = true;
    this._loadBtn.textContent = 'Updating…';
    this._loadBtn.style.opacity = '0.4';

    // Stop any current playback
    if (this._playing) {
      this._audio.pause();
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._playBtn.textContent = '▶';
    }

    const bufVal = parseFloat(this._bufferInput.value);
    this._bufferSec = Math.max(0, isNaN(bufVal) ? 0 : bufVal);
    const startTime = parseFloat(this._startInput.value) || 0;
    const endTime = parseFloat(this._endInput.value) || startTime + 12;
    const loadStart = Math.max(0, startTime - this._bufferSec);
    const loadDur = (endTime + this._bufferSec) - loadStart;

    this._detectionStart = startTime;
    this._detectionEnd = endTime;
    this._segLoadStart = loadStart;

    // Show contextual loading message
    const isUrl = audioPath.startsWith('http://') || audioPath.startsWith('https://');
    const isS3 = audioPath.startsWith('s3://');
    const isGcs = audioPath.startsWith('gs://');
    const loadMsg = isUrl
      ? '⬇ Downloading audio (first load may take a moment)…'
      : isS3
        ? '⬇ Loading audio from S3…'
        : isGcs
          ? '⬇ Loading audio from GCS…'
          : 'Loading audio…';
    this.statusChanged.emit({ message: loadMsg, error: false });

    let result: { spec: string; wav: string; duration: number; sample_rate: number; freq_min: number; freq_max: number };
    try {
      const spectType = this._spectTypeSelect.value as 'mel' | 'plain';
      const resW = parseInt(this._resolutionSelect.value) || 2000;
      const raw = await this._kernel.exec(spectrogramPipeline(audioPath, loadStart, loadDur, spectType, resW));
      result = JSON.parse(raw) as typeof result;
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ ${String(e.message ?? e)}`, error: true });
      this._enableLoadBtn();
      return;
    }

    this._segDuration = result.duration;
    this._sampleRate = result.sample_rate;
    this._freqMin = result.freq_min;
    this._freqMax = result.freq_max;

    this.statusChanged.emit({ message: 'Decoding spectrogram…', error: false });
    try {
      const bytes = Uint8Array.from(atob(result.spec), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      if (this._specBitmap) this._specBitmap.close();
      this._specBitmap = await createImageBitmap(blob);
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ Image decode: ${String(e.message ?? e)}`, error: true });
      this._enableLoadBtn();
      return;
    }

    this._audio.src = `data:audio/wav;base64,${result.wav}`;
    this._audio.load();
    this._renderFrame();
    this._enableLoadBtn();

    const fname = audioPath.split('/').pop() ?? audioPath;
    this.statusChanged.emit({
      message: `✓ ${fname}  ${fmtTime(loadStart)}–${fmtTime(loadStart + result.duration)}`,
      error: false,
    });
  }

  private _enableLoadBtn(): void {
    this._loadBtn.disabled = false;
    this._loadBtn.textContent = 'Update';
    this._loadBtn.style.opacity = '1';
  }

  private _renderFrame(): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const W = this._canvas.width, H = this._canvas.height;
    if (!W || !H) return;

    const padY = Player.SPEC_PAD_Y;
    // Fill padding areas with dark background
    ctx.fillStyle = COLORS.bgCrust;
    ctx.fillRect(0, 0, W, padY);
    ctx.fillRect(0, H - padY, W, padY);

    if (this._specBitmap) {
      // Client-side zoom: draw only the visible portion of the spectrogram
      const bw = this._specBitmap.width;
      const bh = this._specBitmap.height;
      const sx = this._viewXMin * bw;
      const sw = (this._viewXMax - this._viewXMin) * bw;
      const sy = (1 - this._viewYMax) * bh;
      const sh = (this._viewYMax - this._viewYMin) * bh;
      ctx.drawImage(this._specBitmap, sx, sy, sw, sh, 0, padY, W, H - 2 * padY);
    } else {
      ctx.fillStyle = COLORS.bgCrust;
      ctx.fillRect(0, 0, W, H);
    }

    if (this._specBitmap && this._segDuration > 0) {
      // Map detection bounds to the current view
      const detStartFrac = (this._detectionStart - this._segLoadStart) / this._segDuration;
      const detEndFrac = (this._detectionEnd - this._segLoadStart) / this._segDuration;
      const viewW = this._viewXMax - this._viewXMin;
      const toScreen = (frac: number) => ((frac - this._viewXMin) / viewW) * W;

      const bufLeft = toScreen(detStartFrac);
      const bufRight = toScreen(detEndFrac);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (bufLeft > 0) ctx.fillRect(0, 0, Math.floor(bufLeft), H);
      if (bufRight < W) { const rx = Math.ceil(bufRight); ctx.fillRect(rx, 0, W - rx, H); }

      // Playhead
      const playFrac = this._audio.currentTime / this._segDuration;
      const ph = Math.floor(Math.max(0, Math.min(W, toScreen(playFrac))));
      ctx.strokeStyle = `rgba(205,214,244,0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ph, 0); ctx.lineTo(ph, H); ctx.stroke();

      ctx.fillStyle = COLORS.textPrimary;
      ctx.beginPath();
      ctx.moveTo(ph - 6, 0); ctx.lineTo(ph + 6, 0); ctx.lineTo(ph, 11);
      ctx.closePath(); ctx.fill();
    }

    this._renderAnnotation(ctx, W, H);
    this._renderFreqAxis(ctx, W, H);
    this._updateViewBoundsDisplay();

    const absNow = this._segLoadStart + this._audio.currentTime;
    const absEnd = this._segLoadStart + this._segDuration;
    this._timeDisplay.textContent = `${fmtTime(absNow)} / ${fmtTime(absEnd)}`;
  }

  private _togglePlay(): void {
    if (!this._specBitmap) return;
    if (this._playing) {
      this._audio.pause();
      this._playing = false;
      cancelAnimationFrame(this._rafId);
      this._playBtn.textContent = '▶';
    } else {
      void this._audio.play();
      this._playing = true;
      this._playBtn.textContent = '⏸';
      const loop = () => {
        this._renderFrame();
        if (this._playing) this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    }
  }

  // ─── Private: canvas mouse handlers ────────────────────────

  private _canvasXY(e: MouseEvent): { cx: number; cy: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (this._canvas.width / rect.width),
      cy: (e.clientY - rect.top) * (this._canvas.height / rect.height),
    };
  }

  /** Like _canvasXY but clamped to canvas bounds. */
  private _canvasXYClamped(e: MouseEvent): { cx: number; cy: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      cx: Math.max(0, Math.min(this._canvas.width, (e.clientX - rect.left) * (this._canvas.width / rect.width))),
      cy: Math.max(0, Math.min(this._canvas.height, (e.clientY - rect.top) * (this._canvas.height / rect.height))),
    };
  }

  /** Convert absolute time to screen X, accounting for zoom. */
  private _timeToX(t: number): number {
    const frac = (t - this._segLoadStart) / this._segDuration;
    return ((frac - this._viewXMin) / (this._viewXMax - this._viewXMin)) * this._canvas.width;
  }
  /** Convert screen X to absolute time, accounting for zoom. */
  private _xToTime(x: number): number {
    const viewFrac = this._viewXMin + (x / this._canvas.width) * (this._viewXMax - this._viewXMin);
    return this._segLoadStart + viewFrac * this._segDuration;
  }
  /** Convert frequency to screen Y, accounting for zoom and padding. */
  private _freqToY(f: number): number {
    const H = this._canvas.height;
    const padY = Player.SPEC_PAD_Y;
    const specH = H - 2 * padY;
    let frac: number;
    if (this._spectTypeSelect.value === 'mel') {
      const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
      const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
      const mel = 2595 * Math.log10(1 + f / 700);
      frac = (melMax - melMin) > 0 ? (mel - melMin) / (melMax - melMin) : 0;
    } else {
      frac = (this._freqMax - this._freqMin) > 0
        ? (f - this._freqMin) / (this._freqMax - this._freqMin) : 0;
    }
    const viewFrac = (frac - this._viewYMin) / (this._viewYMax - this._viewYMin);
    return padY + specH * (1 - viewFrac);
  }
  /** Convert screen Y to frequency, accounting for zoom and padding. */
  private _yToFreq(y: number): number {
    const H = this._canvas.height;
    const padY = Player.SPEC_PAD_Y;
    const specH = H - 2 * padY;
    const viewFrac = 1 - (y - padY) / specH;
    const frac = this._viewYMin + viewFrac * (this._viewYMax - this._viewYMin);
    if (this._spectTypeSelect.value === 'mel') {
      const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
      const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
      const mel = melMin + frac * (melMax - melMin);
      return 700 * (Math.pow(10, mel / 2595) - 1);
    }
    return this._freqMin + frac * (this._freqMax - this._freqMin);
  }

  private _onCanvasMouseDown(e: MouseEvent): void {
    // Zoom-box mode: draw a selection rectangle (tracked at document level)
    if (this._zoomBoxActive && this._specBitmap) {
      const { cx, cy } = this._canvasXYClamped(e);
      this._zoomBoxDrag = { startCx: cx, startCy: cy };
      // Attach document-level handlers so drag continues outside canvas
      this._zoomBoxMoveHandler = (ev: MouseEvent) => this._onZoomBoxMove(ev);
      this._zoomBoxUpHandler = (ev: MouseEvent) => this._onZoomBoxUp(ev);
      document.addEventListener('mousemove', this._zoomBoxMoveHandler);
      document.addEventListener('mouseup', this._zoomBoxUpHandler);
      return;
    }

    // Pan mode: when no annotation tool is active and zoomed in
    const ac = this._form.getAnnotConfig();
    const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
    if ((!ac || !this._form.getActiveTool()) && isZoomed && this._specBitmap) {
      this._panDrag = {
        startX: e.clientX, startY: e.clientY,
        origXMin: this._viewXMin, origXMax: this._viewXMax,
        origYMin: this._viewYMin, origYMax: this._viewYMax,
      };
      this._canvasContainer.style.cursor = 'grabbing';
      return;
    }
    if (!ac || !this._specBitmap || this._segDuration === 0) return;
    const { cx, cy } = this._canvasXY(e);
    const tool = this._form.getActiveTool();
    const GRAB = 10;

    if (tool === 'time_select') {
      this._form.setAnnotValue('startTime', this._xToTime(cx));
      this._annotDrag = { target: 'start' };
    } else if (tool === 'start_end_time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const sx = st != null ? this._timeToX(st) : -Infinity;
      const ex = et != null ? this._timeToX(et) : Infinity;
      if (Math.abs(cx - sx) <= GRAB && Math.abs(cx - sx) <= Math.abs(cx - ex)) {
        this._annotDrag = { target: 'start' };
      } else if (Math.abs(cx - ex) <= GRAB) {
        this._annotDrag = { target: 'end' };
      } else if (cx < (sx + ex) / 2) {
        this._form.setAnnotValue('startTime', this._xToTime(cx));
        this._annotDrag = { target: 'start' };
      } else {
        this._form.setAnnotValue('endTime', this._xToTime(cx));
        this._annotDrag = { target: 'end' };
      }
    } else if (tool === 'bounding_box') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
      const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
      if (st != null && et != null && flo != null && fhi != null) {
        const sx = this._timeToX(st), ex = this._timeToX(et);
        const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
        const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
        const inX = cx >= sx - GRAB && cx <= ex + GRAB;
        if (inY && Math.abs(cx - sx) <= GRAB) { this._annotDrag = { target: 'box-left' }; this._renderFrame(); this._updateAnnotDisplay(); return; }
        if (inY && Math.abs(cx - ex) <= GRAB) { this._annotDrag = { target: 'box-right' }; this._renderFrame(); this._updateAnnotDisplay(); return; }
        if (inX && Math.abs(cy - yhi) <= GRAB) { this._annotDrag = { target: 'box-top' }; this._renderFrame(); this._updateAnnotDisplay(); return; }
        if (inX && Math.abs(cy - ylo) <= GRAB) { this._annotDrag = { target: 'box-bottom' }; this._renderFrame(); this._updateAnnotDisplay(); return; }
      }
      const t = this._xToTime(cx);
      const f = this._yToFreq(cy);
      this._form.setAnnotValue('startTime', t);
      this._form.setAnnotValue('endTime', t);
      this._form.setAnnotValue('minFreq', f);
      this._form.setAnnotValue('maxFreq', f);
      this._annotDrag = { target: 'box-corner', anchorTime: t, anchorFreq: f };
    } else if (tool === 'multibox') {
      const entries = this._form.getMultiboxEntries();
      // Hit test existing boxes (edges first, then interior)
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        const sx = this._timeToX(entry.startTime), ex = this._timeToX(entry.endTime);
        const yhi = this._freqToY(entry.maxFreq), ylo = this._freqToY(entry.minFreq);
        const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
        const inX = cx >= sx - GRAB && cx <= ex + GRAB;
        if (inY && Math.abs(cx - sx) <= GRAB) { this._form.setActiveBox(i); this._annotDrag = { target: 'box-left', boxIndex: i }; this._renderFrame(); return; }
        if (inY && Math.abs(cx - ex) <= GRAB) { this._form.setActiveBox(i); this._annotDrag = { target: 'box-right', boxIndex: i }; this._renderFrame(); return; }
        if (inX && Math.abs(cy - yhi) <= GRAB) { this._form.setActiveBox(i); this._annotDrag = { target: 'box-top', boxIndex: i }; this._renderFrame(); return; }
        if (inX && Math.abs(cy - ylo) <= GRAB) { this._form.setActiveBox(i); this._annotDrag = { target: 'box-bottom', boxIndex: i }; this._renderFrame(); return; }
      }
      // Hit test interior (click to select)
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        const sx = this._timeToX(entry.startTime), ex = this._timeToX(entry.endTime);
        const yhi = this._freqToY(entry.maxFreq), ylo = this._freqToY(entry.minFreq);
        if (cx >= sx && cx <= ex && cy >= yhi && cy <= ylo) {
          this._form.setActiveBox(i);
          this._renderFrame();
          return;
        }
      }
      // No hit — start drawing a new box
      const t = this._xToTime(cx);
      const f = this._yToFreq(cy);
      this._annotDrag = { target: 'multibox-new', anchorTime: t, anchorFreq: f };
    }

    this._renderFrame();
    this._updateAnnotDisplay();
  }

  private _onCanvasMouseMove(e: MouseEvent): void {
    // Zoom-box is handled at document level — skip here
    if (this._zoomBoxDrag) return;

    // Handle pan drag
    if (this._panDrag) {
      const rect = this._canvas.getBoundingClientRect();
      const dx = (e.clientX - this._panDrag.startX) / rect.width;
      const dy = (e.clientY - this._panDrag.startY) / rect.height;
      const viewW = this._panDrag.origXMax - this._panDrag.origXMin;
      const viewH = this._panDrag.origYMax - this._panDrag.origYMin;
      let newXMin = this._panDrag.origXMin - dx * viewW;
      let newYMin = this._panDrag.origYMin + dy * viewH; // inverted Y
      // Clamp
      newXMin = Math.max(0, Math.min(1 - viewW, newXMin));
      newYMin = Math.max(0, Math.min(1 - viewH, newYMin));
      this._viewXMin = newXMin;
      this._viewXMax = newXMin + viewW;
      this._viewYMin = newYMin;
      this._viewYMax = newYMin + viewH;
      this._renderFrame();
      return;
    }

    const ac = this._form.getAnnotConfig();
    if (!ac || !this._specBitmap || this._segDuration === 0) return;
    const { cx, cy } = this._canvasXY(e);

    if (!this._annotDrag) {
      this._updateAnnotCursor(cx, cy);
      return;
    }

    const t = Math.max(this._segLoadStart, Math.min(
      this._segLoadStart + this._segDuration, this._xToTime(cx)));
    const f = Math.max(0, this._yToFreq(Math.max(0, Math.min(this._canvas.height, cy))));
    const tgt = this._annotDrag.target;

    if (tgt === 'start') {
      const endCol = ac.endTime?.col;
      const endVal = endCol ? this._form.getFormValue(endCol) : Infinity;
      if (this._form.getActiveTool() === 'start_end_time_select' && endVal != null) {
        this._form.setAnnotValue('startTime', Math.min(t, endVal));
      } else {
        this._form.setAnnotValue('startTime', t);
      }
    } else if (tgt === 'end') {
      const startCol = ac.startTime?.col;
      const startVal = startCol ? this._form.getFormValue(startCol) : -Infinity;
      if (startVal != null) this._form.setAnnotValue('endTime', Math.max(t, startVal));
    } else if (tgt === 'box-corner') {
      const at = this._annotDrag.anchorTime ?? t;
      const af = this._annotDrag.anchorFreq ?? f;
      this._form.setAnnotValue('startTime', Math.min(at, t));
      this._form.setAnnotValue('endTime', Math.max(at, t));
      this._form.setAnnotValue('minFreq', Math.min(af, f));
      this._form.setAnnotValue('maxFreq', Math.max(af, f));
    } else if (tgt === 'box-left') {
      const endCol = ac.endTime?.col;
      const endVal = endCol ? this._form.getFormValue(endCol) : Infinity;
      if (endVal != null) this._form.setAnnotValue('startTime', Math.min(t, endVal));
    } else if (tgt === 'box-right') {
      const startCol = ac.startTime?.col;
      const startVal = startCol ? this._form.getFormValue(startCol) : -Infinity;
      if (startVal != null) this._form.setAnnotValue('endTime', Math.max(t, startVal));
    } else if (tgt === 'box-top') {
      const loCol = ac.minFreq?.col;
      const loVal = loCol ? this._form.getFormValue(loCol) : 0;
      if (loVal != null) this._form.setAnnotValue('maxFreq', Math.max(f, loVal));
    } else if (tgt === 'box-bottom') {
      const hiCol = ac.maxFreq?.col;
      const hiVal = hiCol ? this._form.getFormValue(hiCol) : Infinity;
      if (hiVal != null) this._form.setAnnotValue('minFreq', Math.min(f, hiVal));
    } else if (tgt === 'multibox-new') {
      // Drawing a new multibox — render preview
      // (committed on mouseup)
    } else if (tgt.startsWith('box-') && this._annotDrag.boxIndex != null) {
      const bi = this._annotDrag.boxIndex;
      const entry = this._form.getMultiboxEntries()[bi];
      if (entry) {
        if (tgt === 'box-left') this._form.updateMultiboxBounds(bi, 'startTime', Math.min(t, entry.endTime));
        else if (tgt === 'box-right') this._form.updateMultiboxBounds(bi, 'endTime', Math.max(t, entry.startTime));
        else if (tgt === 'box-top') this._form.updateMultiboxBounds(bi, 'maxFreq', Math.max(f, entry.minFreq));
        else if (tgt === 'box-bottom') this._form.updateMultiboxBounds(bi, 'minFreq', Math.min(f, entry.maxFreq));
      }
    }

    // Render multibox-new preview rectangle
    if (tgt === 'multibox-new' && this._annotDrag.anchorTime != null && this._annotDrag.anchorFreq != null) {
      this._renderFrame();
      const ctx2 = this._canvas.getContext('2d');
      if (ctx2) {
        const sx = this._timeToX(Math.min(this._annotDrag.anchorTime, t));
        const ex = this._timeToX(Math.max(this._annotDrag.anchorTime, t));
        const yhi = this._freqToY(Math.max(this._annotDrag.anchorFreq, f));
        const ylo = this._freqToY(Math.min(this._annotDrag.anchorFreq, f));
        ctx2.strokeStyle = COLORS.textPrimary;
        ctx2.lineWidth = 1.5;
        ctx2.setLineDash([4, 4]);
        ctx2.strokeRect(sx, yhi, ex - sx, ylo - yhi);
        ctx2.setLineDash([]);
      }
      this._updateAnnotDisplay();
      return;
    }

    this._renderFrame();
    this._updateAnnotDisplay();
  }

  private _onCanvasMouseLeave(): void {
    // Cancel pan and annotation drags, but NOT zoom-box (it clamps to edges)
    if (!this._zoomBoxDrag) {
      this._panDrag = null;
      this._annotDrag = null;
      if (this._specBitmap) this._renderFrame();
    }
  }

  private _onCanvasMouseUp(e?: MouseEvent): void {
    // Zoom-box is handled at document level
    if (this._panDrag) {
      this._panDrag = null;
      this._updateCursorForZoom();
      return;
    }
    // Commit new multibox on release
    if (this._annotDrag?.target === 'multibox-new' && e) {
      const { cx, cy } = this._canvasXY(e);
      const at = this._annotDrag.anchorTime!;
      const af = this._annotDrag.anchorFreq!;
      const t = this._xToTime(cx);
      const f = this._yToFreq(cy);
      const tMin = Math.min(at, t), tMax = Math.max(at, t);
      const fMin = Math.min(af, f), fMax = Math.max(af, f);
      // Only add if box is large enough
      if (Math.abs(this._timeToX(tMax) - this._timeToX(tMin)) > 5 &&
          Math.abs(this._freqToY(fMax) - this._freqToY(fMin)) > 5) {
        this._form.addMultiboxEntry(tMin, tMax, fMin, fMax);
      }
    }
    this._annotDrag = null;
    this._renderFrame();
  }

  private _updateAnnotCursor(cx: number, cy: number): void {
    const ac = this._form.getAnnotConfig();
    if (!ac) return;
    const GRAB = 10;
    const tool = this._form.getActiveTool();

    if (tool === 'time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      if (st != null && Math.abs(cx - this._timeToX(st)) <= GRAB) {
        this._canvasContainer.style.cursor = 'ew-resize'; return;
      }
    } else if (tool === 'start_end_time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      if ((st != null && Math.abs(cx - this._timeToX(st)) <= GRAB) ||
          (et != null && Math.abs(cx - this._timeToX(et)) <= GRAB)) {
        this._canvasContainer.style.cursor = 'ew-resize'; return;
      }
    } else if (tool === 'bounding_box') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
      const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
      if (st != null && et != null && flo != null && fhi != null) {
        const sx = this._timeToX(st), ex = this._timeToX(et);
        const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
        const inY = cy >= yhi - GRAB && cy <= ylo + GRAB;
        const inX = cx >= sx - GRAB && cx <= ex + GRAB;
        if (inY && (Math.abs(cx - sx) <= GRAB || Math.abs(cx - ex) <= GRAB)) {
          this._canvasContainer.style.cursor = 'ew-resize'; return;
        }
        if (inX && (Math.abs(cy - yhi) <= GRAB || Math.abs(cy - ylo) <= GRAB)) {
          this._canvasContainer.style.cursor = 'ns-resize'; return;
        }
      }
    }
    this._canvasContainer.style.cursor = 'crosshair';
  }

  private _updateAnnotDisplay(): void {
    const ac = this._form.getAnnotConfig();
    if (!ac) return;
    const parts: string[] = [];
    const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
    const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
    if (st != null) parts.push(fmtTime(st));
    if (et != null) parts.push(`– ${fmtTime(et)}`);
    const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
    const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
    if (flo != null && fhi != null) parts.push(`${Math.round(flo)}–${Math.round(fhi)} Hz`);
    this._signalTimeDisplay.textContent = parts.length ? `⏱ ${parts.join(' ')}` : '';
  }

  private _renderAnnotation(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const ac = this._form.getAnnotConfig();
    if (!ac || this._segDuration === 0) return;
    const tool = this._form.getActiveTool();

    if (tool === 'time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      if (st == null) return;
      const x = this._timeToX(st);
      ctx.strokeStyle = 'rgba(137,180,250,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = COLORS.blue;
      ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10);
      ctx.closePath(); ctx.fill();
    } else if (tool === 'start_end_time_select') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      if (st != null && et != null) {
        const sx = this._timeToX(st), ex = this._timeToX(et);
        ctx.fillStyle = 'rgba(137,180,250,0.08)';
        ctx.fillRect(sx, 0, ex - sx, H);
      }
      if (st != null) {
        const x = this._timeToX(st);
        ctx.strokeStyle = 'rgba(166,227,161,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillStyle = COLORS.green;
        ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10);
        ctx.closePath(); ctx.fill();
      }
      if (et != null) {
        const x = this._timeToX(et);
        ctx.strokeStyle = 'rgba(243,139,168,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillStyle = COLORS.red;
        ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10);
        ctx.closePath(); ctx.fill();
      }
    } else if (tool === 'bounding_box') {
      const st = ac.startTime?.col ? this._form.getFormValue(ac.startTime.col) : null;
      const et = ac.endTime?.col ? this._form.getFormValue(ac.endTime.col) : null;
      const flo = ac.minFreq?.col ? this._form.getFormValue(ac.minFreq.col) : null;
      const fhi = ac.maxFreq?.col ? this._form.getFormValue(ac.maxFreq.col) : null;
      if (st == null || et == null || flo == null || fhi == null) return;
      const sx = this._timeToX(st), ex = this._timeToX(et);
      const yhi = this._freqToY(fhi), ylo = this._freqToY(flo);
      ctx.fillStyle = 'rgba(137,180,250,0.1)';
      ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
      ctx.strokeStyle = 'rgba(137,180,250,0.85)'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
      ctx.fillStyle = COLORS.blue;
      for (const [px, py] of [[sx, yhi], [ex, yhi], [sx, ylo], [ex, ylo]]) {
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (tool === 'multibox') {
      const entries = this._form.getMultiboxEntries();
      const activeIdx = this._form.getActiveBoxIndex();
      entries.forEach((entry, i) => {
        const sx = this._timeToX(entry.startTime);
        const ex = this._timeToX(entry.endTime);
        const yhi = this._freqToY(entry.maxFreq);
        const ylo = this._freqToY(entry.minFreq);
        const isActive = i === activeIdx;
        // Fill
        ctx.fillStyle = isActive ? `${entry.color}20` : `${entry.color}0a`;
        ctx.fillRect(sx, yhi, ex - sx, ylo - yhi);
        // Border
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = isActive ? 2.5 : 1;
        if (!isActive) ctx.setLineDash([4, 4]);
        ctx.strokeRect(sx, yhi, ex - sx, ylo - yhi);
        ctx.setLineDash([]);
        // Corner handles on active box
        if (isActive) {
          ctx.fillStyle = entry.color;
          for (const [px, py] of [[sx, yhi], [ex, yhi], [sx, ylo], [ex, ylo]]) {
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
          }
        }
        // Index label
        ctx.fillStyle = entry.color;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(i + 1), sx + 3, yhi + 3);
      });
    }
  }

  // ─── Private: frequency axis ─────────────────────────────────

  private _renderFreqAxis(ctx: CanvasRenderingContext2D, _W: number, H: number): void {
    if (!this._specBitmap || this._freqMax <= this._freqMin) return;

    const AXIS_W = 40;
    const FONT_SIZE = 10;
    const TICK_LEN = 4;
    const padY = Player.SPEC_PAD_Y;
    const specH = H - 2 * padY;

    // Background strip
    ctx.fillStyle = 'rgba(17,17,27,0.75)';
    ctx.fillRect(0, 0, AXIS_W, H);

    // Compute visible freq range
    const fMin = this._freqMin + this._viewYMin * (this._freqMax - this._freqMin);
    const fMax = this._freqMin + this._viewYMax * (this._freqMax - this._freqMin);
    const fRange = fMax - fMin;

    // Choose nice tick interval (in Hz)
    const targetTicks = Math.max(2, Math.floor(specH / 40));
    let tickInterval = fRange / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(tickInterval)));
    const norm = tickInterval / mag;
    if (norm < 1.5) tickInterval = mag;
    else if (norm < 3.5) tickInterval = 2 * mag;
    else if (norm < 7.5) tickInterval = 5 * mag;
    else tickInterval = 10 * mag;

    const firstTick = Math.ceil(fMin / tickInterval) * tickInterval;

    ctx.fillStyle = COLORS.textSubtle;
    ctx.strokeStyle = COLORS.textMuted;
    ctx.lineWidth = 1;
    ctx.font = `${FONT_SIZE}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let f = firstTick; f <= fMax; f += tickInterval) {
      const frac = (f - fMin) / fRange;
      // Labels are positioned within the padded spectrogram area — no clipping
      const y = padY + specH * (1 - frac);
      // Tick mark
      ctx.beginPath();
      ctx.moveTo(AXIS_W - TICK_LEN, y);
      ctx.lineTo(AXIS_W, y);
      ctx.stroke();
      // Label in kHz (use integer when possible)
      const khz = f / 1000;
      const label = Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
      ctx.fillText(label, AXIS_W - TICK_LEN - 2, y);
    }

    // "kHz" unit label at top-left
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `${FONT_SIZE - 1}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('kHz', 2, FONT_SIZE);
  }

  // ─── Private: zoom + pan ────────────────────────────────────

  // ─── Zoom-box (document-level drag) ─────────────────────────

  private _onZoomBoxMove(e: MouseEvent): void {
    if (!this._zoomBoxDrag) return;
    const { cx, cy } = this._canvasXYClamped(e);
    this._renderFrame();
    const ctx = this._canvas.getContext('2d');
    if (ctx) {
      const x = Math.min(this._zoomBoxDrag.startCx, cx);
      const y = Math.min(this._zoomBoxDrag.startCy, cy);
      const w = Math.abs(cx - this._zoomBoxDrag.startCx);
      const h = Math.abs(cy - this._zoomBoxDrag.startCy);
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(137,180,250,0.1)';
      ctx.fillRect(x, y, w, h);
    }
  }

  private _onZoomBoxUp(e: MouseEvent): void {
    // Clean up document listeners
    if (this._zoomBoxMoveHandler) document.removeEventListener('mousemove', this._zoomBoxMoveHandler);
    if (this._zoomBoxUpHandler) document.removeEventListener('mouseup', this._zoomBoxUpHandler);
    this._zoomBoxMoveHandler = null;
    this._zoomBoxUpHandler = null;

    if (!this._zoomBoxDrag) return;
    const { cx, cy } = this._canvasXYClamped(e);
    const W = this._canvas.width, H = this._canvas.height;
    const x1 = Math.min(this._zoomBoxDrag.startCx, cx) / W;
    const x2 = Math.max(this._zoomBoxDrag.startCx, cx) / W;
    const y1 = Math.min(this._zoomBoxDrag.startCy, cy) / H;
    const y2 = Math.max(this._zoomBoxDrag.startCy, cy) / H;
    this._zoomBoxDrag = null;

    // Only zoom if the box is large enough
    if ((x2 - x1) > 0.02 && (y2 - y1) > 0.02) {
      const vw = this._viewXMax - this._viewXMin;
      const vh = this._viewYMax - this._viewYMin;
      this._viewXMin = this._viewXMin + x1 * vw;
      this._viewXMax = this._viewXMin + (x2 - x1) * vw;
      // Y inverted (top of canvas = high freq)
      const newYMax = this._viewYMin + (1 - y1) * vh;
      const newYMin = this._viewYMin + (1 - y2) * vh;
      this._viewYMin = newYMin;
      this._viewYMax = newYMax;
    }

    // Deactivate zoom-box tool
    this._zoomBoxActive = false;
    this._zoomBoxBtn.style.background = COLORS.bgSurface1;
    this._updateCursorForZoom();
    this._renderFrame();
  }

  // ─── Private: zoom + pan ────────────────────────────────────

  private _onCanvasKeyDown(e: KeyboardEvent): void {
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
        // Shift+Space: play from beginning
        this._audio.currentTime = 0;
        if (!this._playing) this._togglePlay();
        this._renderFrame();
      } else {
        this._togglePlay();
      }
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
      if (isZoomed) {
        e.preventDefault();
        const step = 0.1;
        const vw = this._viewXMax - this._viewXMin;
        const vh = this._viewYMax - this._viewYMin;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step * vw;
        if (e.key === 'ArrowRight') dx = step * vw;
        if (e.key === 'ArrowUp') dy = step * vh;
        if (e.key === 'ArrowDown') dy = -step * vh;
        this._viewXMin = Math.max(0, Math.min(1 - vw, this._viewXMin + dx));
        this._viewXMax = this._viewXMin + vw;
        this._viewYMin = Math.max(0, Math.min(1 - vh, this._viewYMin + dy));
        this._viewYMax = this._viewYMin + vh;
        this._renderFrame();
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this._form.isMultiboxMode()) {
      e.preventDefault();
      this._form.removeActiveMultiboxEntry();
      this._renderFrame();
    }
  }

  /**
   * Zoom the view by a factor, centered on (cx, cy) in view fraction space.
   * factor < 1 = zoom in, factor > 1 = zoom out.
   * cx, cy default to center of current view.
   */
  private _zoomBy(factor: number, cx?: number, cy?: number): void {
    const viewW = this._viewXMax - this._viewXMin;
    const viewH = this._viewYMax - this._viewYMin;
    // Default center
    const centerX = cx !== undefined ? this._viewXMin + cx * viewW : (this._viewXMin + this._viewXMax) / 2;
    const centerY = cy !== undefined ? this._viewYMin + cy * viewH : (this._viewYMin + this._viewYMax) / 2;

    const newW = Math.min(1, viewW * factor);
    const newH = Math.min(1, viewH * factor);

    let newXMin = centerX - newW * ((centerX - this._viewXMin) / viewW);
    let newYMin = centerY - newH * ((centerY - this._viewYMin) / viewH);

    // Clamp to 0..1
    newXMin = Math.max(0, Math.min(1 - newW, newXMin));
    newYMin = Math.max(0, Math.min(1 - newH, newYMin));

    this._viewXMin = newXMin;
    this._viewXMax = newXMin + newW;
    this._viewYMin = newYMin;
    this._viewYMax = newYMin + newH;

    this._updateCursorForZoom();
    this._renderFrame();
  }

  private _resetZoom(): void {
    this._viewXMin = 0;
    this._viewXMax = 1;
    this._viewYMin = 0;
    this._viewYMax = 1;
    this._updateCursorForZoom();
    this._renderFrame();
  }

  private _updateCursorForZoom(): void {
    const ac = this._form.getAnnotConfig();
    const isZoomed = this._viewXMin > 0 || this._viewXMax < 1 || this._viewYMin > 0 || this._viewYMax < 1;
    if (ac && this._form.getActiveTool()) {
      this._canvasContainer.style.cursor = 'crosshair';
    } else {
      this._canvasContainer.style.cursor = isZoomed ? 'grab' : 'default';
    }
  }

  private _updateViewBoundsDisplay(): void {
    if (this._segDuration === 0) return;
    const tMin = this._segLoadStart + this._viewXMin * this._segDuration;
    const tMax = this._segLoadStart + this._viewXMax * this._segDuration;
    const fMin = this._viewYMin * (this._freqMax - this._freqMin) + this._freqMin;
    const fMax = this._viewYMax * (this._freqMax - this._freqMin) + this._freqMin;
    // Only update inputs that aren't focused (avoid overwriting user edits)
    if (document.activeElement !== this._viewTimeMinDisplay) this._viewTimeMinDisplay.value = tMin.toFixed(2);
    if (document.activeElement !== this._viewTimeMaxDisplay) this._viewTimeMaxDisplay.value = tMax.toFixed(2);
    if (document.activeElement !== this._viewFreqMinDisplay) this._viewFreqMinDisplay.value = (fMin / 1000).toFixed(1);
    if (document.activeElement !== this._viewFreqMaxDisplay) this._viewFreqMaxDisplay.value = (fMax / 1000).toFixed(1);
  }

  private _rebuildResolutionSelect(): void {
    this._resolutionSelect.innerHTML = '';
    let hasSelected = false;
    this._specResolutions.forEach(raw => {
      const isDefault = String(raw).startsWith('selected::');
      const val = String(raw).replace(/^selected::/, '');
      const o = document.createElement('option');
      o.value = val;
      o.textContent = `${val}px`;
      if (isDefault) { o.selected = true; hasSelected = true; }
      this._resolutionSelect.appendChild(o);
    });
    // If nothing was marked selected, default to the middle option
    if (!hasSelected && this._resolutionSelect.options.length > 0) {
      const mid = Math.min(1, this._resolutionSelect.options.length - 1);
      this._resolutionSelect.options[mid].selected = true;
    }
  }

  // ─── Private: capture ──────────────────────────────────────

  private _buildCaptureFilename(): string {
    const row = this._currentRow;
    if (!row) return 'spectrogram.png';
    const parts: string[] = [];
    if (this._identCol && row[this._identCol] !== undefined) {
      parts.push(String(row[this._identCol]));
    }
    for (const col of this._displayCols) {
      if (row[col] !== undefined) {
        const v = typeof row[col] === 'number' && !Number.isInteger(row[col])
          ? (row[col] as number).toFixed(3) : String(row[col]);
        parts.push(`${col}_${v}`);
      }
    }
    if (!parts.length) parts.push(`clip_${row.id}`);
    return parts.join('.')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[:.]+/g, '_')
      .replace(/[^a-z0-9._-]/g, '') + '.png';
  }

  private async _onCapture(): Promise<void> {
    if (!this._specBitmap) return;
    const defaultName = this._buildCaptureFilename();
    const suggested = this._captureDir
      ? `${this._captureDir}/${defaultName}` : defaultName;
    const filename = prompt('Save spectrogram as:', suggested);
    if (!filename) return;

    // Output matches the display aspect ratio at the bitmap's horizontal resolution
    const bw = this._specBitmap.width;
    const bh = this._specBitmap.height;
    const sx = this._viewXMin * bw;
    const sw = (this._viewXMax - this._viewXMin) * bw;
    const sy = (1 - this._viewYMax) * bh;
    const sh = (this._viewYMax - this._viewYMin) * bh;
    const W = Math.round(sw);
    const displayAspect = this._canvas.height / Math.max(1, this._canvas.width);
    const H = Math.round(W * displayAspect);

    if (W <= 0 || H <= 0) {
      this.statusChanged.emit({ message: '❌ Capture failed: zoom region too small', error: true });
      return;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      this.statusChanged.emit({ message: '❌ Capture failed: could not create canvas', error: true });
      return;
    }

    ctx.drawImage(this._specBitmap, sx, sy, sw, sh, 0, 0, W, H);

    if (this._segDuration > 0) {
      const viewW = this._viewXMax - this._viewXMin;
      const toScreen = (frac: number) => ((frac - this._viewXMin) / viewW) * W;
      const dsf = (this._detectionStart - this._segLoadStart) / this._segDuration;
      const def = (this._detectionEnd - this._segLoadStart) / this._segDuration;
      const bufLeft = toScreen(dsf);
      const bufRight = toScreen(def);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (bufLeft > 0) ctx.fillRect(0, 0, Math.floor(bufLeft), H);
      if (bufRight < W) { const rx = Math.ceil(bufRight); ctx.fillRect(rx, 0, W - rx, H); }
    }

    this._renderAnnotation(ctx, W, H);
    this._renderFreqAxis(ctx, W, H);

    let dataUrl: string;
    try {
      dataUrl = offscreen.toDataURL('image/png');
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ Capture failed: image too large to encode`, error: true });
      return;
    }
    const b64 = dataUrl.split(',')[1];
    if (!b64) {
      this.statusChanged.emit({ message: '❌ Capture failed: image too large to encode', error: true });
      return;
    }

    try {
      await this._kernel.exec(savePng(filename, b64));
      this.statusChanged.emit({ message: `✓ Saved ${filename}`, error: false });
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ Save failed: ${String(e.message ?? e)}`, error: true });
    }
  }
}
