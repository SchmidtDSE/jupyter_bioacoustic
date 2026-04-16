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
  private _annotDrag: { target: string; anchorTime?: number; anchorFreq?: number } | null = null;

  // ─── DOM refs ──────────────────────────────────────────────

  private _spectTypeSelect!: HTMLSelectElement;
  private _bufferInput!: HTMLInputElement;
  private _startInput!: HTMLInputElement;
  private _endInput!: HTMLInputElement;
  private _canvas!: HTMLCanvasElement;
  private _canvasContainer!: HTMLDivElement;
  private _playBtn!: HTMLButtonElement;
  private _timeDisplay!: HTMLSpanElement;
  private _signalTimeDisplay!: HTMLSpanElement;
  private _audio!: HTMLAudioElement;
  private _captureBtn!: HTMLButtonElement;

  // ─── Context ───────────────────────────────────────────────

  private _audioPath = '';
  private _audioCol = '';
  private _captureLabel = '';
  private _captureDir = '';
  private _predictionCol = '';
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
    audioPath: string;
    audioCol: string;
    captureLabel: string;
    captureDir: string;
    predictionCol: string;
    displayCols: string[];
    defaultBuffer: number;
    rows: Detection[];
  }): void {
    this._audioPath = opts.audioPath;
    this._audioCol = opts.audioCol;
    this._captureLabel = opts.captureLabel;
    this._captureDir = opts.captureDir;
    this._predictionCol = opts.predictionCol;
    this._displayCols = opts.displayCols;
    this._rows = opts.rows;
    this._bufferInput.value = String(opts.defaultBuffer);
    if (this._captureLabel) {
      this._captureBtn.textContent = this._captureLabel;
      this._captureBtn.style.display = '';
    }
    // Set cursor based on annotation config
    this._canvasContainer.style.cursor =
      this._form.getAnnotConfig() ? 'crosshair' : 'default';
  }

  /** Load audio for a row (called when a row is selected). */
  async loadRow(row: Detection): Promise<void> {
    this._currentRow = row;
    this._startInput.value = String(row.start_time);
    this._endInput.value = String(row.end_time);
    await this._loadAudio();
  }

  /** Re-render the spectrogram frame (after annotation change, etc.). */
  renderFrame(): void {
    this._renderFrame();
  }

  /** Update cursor for annotation mode. */
  updateCursor(): void {
    this._canvasContainer.style.cursor =
      this._form.getAnnotConfig() ? 'crosshair' : 'default';
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

    const mkNumLabel = (labelText: string, def: string, w = '65px'): HTMLInputElement => {
      const lbl = document.createElement('label');
      lbl.style.cssText = labelStyle();
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = def;
      inp.style.cssText = inputStyle(w);
      lbl.appendChild(inp);
      playerCtrls.appendChild(lbl);
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

    this._bufferInput = mkNumLabel('Buffer (s)', '3', '50px');
    this._startInput = mkNumLabel('Start (s)', '0', '70px');
    this._endInput = mkNumLabel('End (s)', '12', '70px');

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Update';
    loadBtn.style.cssText = btnStyle(true);
    loadBtn.addEventListener('click', () => void this._loadAudio());
    playerCtrls.appendChild(loadBtn);

    const ctrNote = document.createElement('span');
    ctrNote.textContent = '← update after changes';
    ctrNote.style.cssText = `font-size:10px;color:${COLORS.textMuted};white-space:nowrap;`;
    playerCtrls.appendChild(ctrNote);

    this._captureBtn = document.createElement('button');
    this._captureBtn.textContent = 'Capture';
    this._captureBtn.style.cssText = btnStyle() + `display:none;margin-left:auto;`;
    this._captureBtn.addEventListener('click', () => void this._onCapture());
    playerCtrls.appendChild(this._captureBtn);

    // Spectrogram canvas
    this._canvasContainer = document.createElement('div');
    this._canvasContainer.style.cssText =
      `flex:1;position:relative;min-height:80px;background:${COLORS.bgCrust};overflow:hidden;cursor:default;`;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `display:block;width:100%;height:100%;`;
    this._canvas.addEventListener('mousedown', e => this._onCanvasMouseDown(e));
    this._canvas.addEventListener('mousemove', e => this._onCanvasMouseMove(e));
    this._canvas.addEventListener('mouseup', () => this._onCanvasMouseUp());
    this._canvas.addEventListener('mouseleave', () => this._onCanvasMouseUp());
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
    this.element.append(playerCtrls, this._canvasContainer, playBar, this._audio);
  }

  // ─── Private: audio loading ────────────────────────────────

  private _resolveAudioPath(): string {
    if (this._audioCol && this._currentRow) {
      const val = this._currentRow[this._audioCol];
      if (val != null && String(val).trim()) return String(val);
    }
    return this._audioPath;
  }

  private async _loadAudio(): Promise<void> {
    const audioPath = this._resolveAudioPath();
    if (!audioPath) {
      this.statusChanged.emit({ message: '❌ No audio path — set audio_path or audio_column', error: true });
      return;
    }

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

    this.statusChanged.emit({ message: 'Running Python (soundfile + numpy + matplotlib)…', error: false });

    let result: { spec: string; wav: string; duration: number; sample_rate: number; freq_min: number; freq_max: number };
    try {
      const spectType = this._spectTypeSelect.value as 'mel' | 'plain';
      const raw = await this._kernel.exec(spectrogramPipeline(audioPath, loadStart, loadDur, spectType));
      result = JSON.parse(raw) as typeof result;
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ ${String(e.message ?? e)}`, error: true });
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
      return;
    }

    this._audio.src = `data:audio/wav;base64,${result.wav}`;
    this._audio.load();
    this._renderFrame();

    const fname = audioPath.split('/').pop() ?? audioPath;
    this.statusChanged.emit({
      message: `✓ ${fname}  ${fmtTime(loadStart)}–${fmtTime(loadStart + result.duration)}`,
      error: false,
    });
  }

  private _renderFrame(): void {
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const W = this._canvas.width, H = this._canvas.height;
    if (!W || !H) return;

    if (this._specBitmap) {
      ctx.drawImage(this._specBitmap, 0, 0, W, H);
    } else {
      ctx.fillStyle = COLORS.bgCrust;
      ctx.fillRect(0, 0, W, H);
    }

    if (this._specBitmap && this._segDuration > 0) {
      const detStartFrac = Math.max(0, (this._detectionStart - this._segLoadStart) / this._segDuration);
      const detEndFrac = Math.min(1, (this._detectionEnd - this._segLoadStart) / this._segDuration);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (detStartFrac > 0) ctx.fillRect(0, 0, Math.floor(detStartFrac * W), H);
      if (detEndFrac < 1) { const rx = Math.ceil(detEndFrac * W); ctx.fillRect(rx, 0, W - rx, H); }

      const ph = Math.floor(
        Math.max(0, Math.min(1, this._audio.currentTime / this._segDuration)) * (W - 1));
      ctx.strokeStyle = `rgba(205,214,244,0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ph, 0); ctx.lineTo(ph, H); ctx.stroke();

      ctx.fillStyle = COLORS.textPrimary;
      ctx.beginPath();
      ctx.moveTo(ph - 6, 0); ctx.lineTo(ph + 6, 0); ctx.lineTo(ph, 11);
      ctx.closePath(); ctx.fill();
    }

    this._renderAnnotation(ctx, W, H);

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

  private _timeToX(t: number): number {
    return ((t - this._segLoadStart) / this._segDuration) * this._canvas.width;
  }
  private _xToTime(x: number): number {
    return this._segLoadStart + (x / this._canvas.width) * this._segDuration;
  }
  private _freqToY(f: number): number {
    const H = this._canvas.height;
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
    return H * (1 - frac);
  }
  private _yToFreq(y: number): number {
    const H = this._canvas.height;
    const frac = 1 - y / H;
    if (this._spectTypeSelect.value === 'mel') {
      const melMin = 2595 * Math.log10(1 + this._freqMin / 700);
      const melMax = 2595 * Math.log10(1 + this._freqMax / 700);
      const mel = melMin + frac * (melMax - melMin);
      return 700 * (Math.pow(10, mel / 2595) - 1);
    }
    return this._freqMin + frac * (this._freqMax - this._freqMin);
  }

  private _onCanvasMouseDown(e: MouseEvent): void {
    const ac = this._form.getAnnotConfig();
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
    }

    this._renderFrame();
    this._updateAnnotDisplay();
  }

  private _onCanvasMouseMove(e: MouseEvent): void {
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
    }

    this._renderFrame();
    this._updateAnnotDisplay();
  }

  private _onCanvasMouseUp(): void {
    this._annotDrag = null;
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
    }
  }

  // ─── Private: capture ──────────────────────────────────────

  private _buildCaptureFilename(): string {
    const row = this._currentRow;
    if (!row) return 'spectrogram.png';
    const parts: string[] = [];
    if (this._predictionCol && row[this._predictionCol] !== undefined) {
      parts.push(String(row[this._predictionCol]));
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

    const W = this._canvas.width, H = this._canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this._specBitmap, 0, 0, W, H);

    if (this._segDuration > 0) {
      const dsf = Math.max(0, (this._detectionStart - this._segLoadStart) / this._segDuration);
      const def = Math.min(1, (this._detectionEnd - this._segLoadStart) / this._segDuration);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (dsf > 0) ctx.fillRect(0, 0, Math.floor(dsf * W), H);
      if (def < 1) { const rx = Math.ceil(def * W); ctx.fillRect(rx, 0, W - rx, H); }
    }

    this._renderAnnotation(ctx, W, H);

    const dataUrl = offscreen.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1];
    try {
      await this._kernel.exec(savePng(filename, b64));
      this.statusChanged.emit({ message: `✓ Saved ${filename}`, error: false });
    } catch (e: any) {
      this.statusChanged.emit({ message: `❌ Save failed: ${String(e.message ?? e)}`, error: true });
    }
  }
}
