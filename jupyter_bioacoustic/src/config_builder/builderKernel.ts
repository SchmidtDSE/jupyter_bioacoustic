/**
 * The config builder's connection to its kernel-side ``ConfigBuilder``: one-time setup
 * (``ensureSetup`` + routing keys), readiness, the kernel's working directory, and ``call`` —
 * the single "wait until ready -> run a python.ts snippet -> parse its JSON -> report failures
 * in the status line" helper every builder action goes through.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { KernelBridge } from '../kernel';
import { errorMessage } from '../util';
import {
  ReadyReply, changeCwd, ensureSetup, extractJson, getRoutingKeys,
} from './python';
import { StatusLine } from './statusLine';
import type { RoutingKeys } from './types';


//
// Types
//
/**
 * What to do when a call fails: a label (status shows ``"<label>: <error>"``), a handler, or
 * ``null`` to ignore the failure.
 */
export type CallFailure = string | ((e: unknown) => void) | null;


//
// Public
//
export class BuilderKernel {
  /** Settles once setup finished (successfully or not); see ``isReady``. */
  readonly ready: Promise<void>;
  readonly bridge: KernelBridge;

  private _status: StatusLine;
  private _isReady = false;
  private _debug = false;
  private _resolvedCwd = '';
  private _cwdCallbacks: Array<(cwd: string) => void> = [];
  private _routingKeys: RoutingKeys | null = null;

  /**
   * Starts the setup immediately.
   *
   * @param bridge - The builder widget's kernel.
   * @param status - Where progress and failures are shown.
   */
  constructor(bridge: KernelBridge, status: StatusLine) {
    this.bridge = bridge;
    this._status = status;
    this.ready = this._setup();
  }

  /** Whether setup succeeded (calls are skipped until it has). */
  get isReady(): boolean {
    return this._isReady;
  }

  /** Split routing per section, or null if it couldn't be fetched (locks then act per section). */
  get routingKeys(): RoutingKeys | null {
    return this._routingKeys;
  }

  /** The kernel's working directory (as resolved by the kernel once ready). */
  get cwd(): string {
    return this._resolvedCwd || this.bridge.cwd || '.';
  }

  /** Run ``cb`` with the resolved cwd now, or once setup resolves it. */
  onCwdReady(cb: (cwd: string) => void): void {
    if (this._resolvedCwd) {
      cb(this._resolvedCwd);
    } else {
      this._cwdCallbacks.push(cb);
    }
  }

  /**
   * ``chdir`` the kernel. Returns the new absolute cwd, or null (failure shown in the status).
   *
   * @param newDir - Directory to change to.
   */
  async setCwd(newDir: string): Promise<string | null> {
    return this.call(changeCwd(newDir), 'chdir failed', (r: { cwd: string }) => {
      this._resolvedCwd = r.cwd || '';
      return r.cwd;
    });
  }

  /**
   * Wait for setup, run a python.ts snippet and hand its parsed reply to ``handle``.
   * A failure of the call — or of ``handle`` — goes to ``onFail``.
   *
   * @param code - Snippet from python.ts.
   * @param onFail - Failure label / handler / null (see ``CallFailure``).
   * @param handle - Receives the reply; its result is returned.
   * @returns ``handle``'s result, or null when not ready or on failure.
   */
  async call<T, R>(
    code: string, onFail: CallFailure, handle: (reply: T) => R | Promise<R>,
  ): Promise<R | null> {
    await this.ready;
    if (!this._isReady) return null;
    return this.run(code, onFail, handle);
  }

  /** ``call`` without waiting for setup (for calls made from an already-ready flow). */
  async run<T, R>(
    code: string, onFail: CallFailure, handle: (reply: T) => R | Promise<R>,
  ): Promise<R | null> {
    try {
      return await handle(await this.exec<T>(code));
    } catch (e: unknown) {
      if (typeof onFail === 'string') this._status.set(`${onFail}: ${errorMessage(e)}`, 'error');
      else onFail?.(e);
      return null;
    }
  }

  /** Run a snippet and parse its reply; throws on kernel or parse errors. */
  async exec<T>(code: string): Promise<T> {
    return JSON.parse(extractJson(await this.bridge.exec(code))) as T;
  }

  /** ``console.debug`` when the kernel runs with ``JBA_DEBUG_MODE``. */
  dbg(...args: unknown[]): void {
    if (this._debug) console.debug('[JBA]', ...args);
  }

  private async _setup(): Promise<void> {
    this._status.set('Initializing…');
    try {
      const result = await this.exec<ReadyReply>(ensureSetup(this.bridge.cwd));
      this._isReady = true;
      this._debug = !!result.debug;
      this._resolvedCwd = result.cwd || '';
      this.dbg('ConfigPanel ready, cwd:', result.cwd);
      for (const cb of this._cwdCallbacks) cb(this._resolvedCwd);
      this._cwdCallbacks = [];
      // Cache the per-section split-routing key sets (single source of truth in
      // core.py) so file-lock disabling needs no further kernel round-trips.
      try {
        this._routingKeys = await this.exec<RoutingKeys>(getRoutingKeys());
      } catch { /* lock disabling degrades to whole-section if absent */ }
      this._status.set('Ready');
    } catch (e: unknown) {
      this._status.set(`Init failed: ${errorMessage(e)}`, 'error');
    }
  }
}
