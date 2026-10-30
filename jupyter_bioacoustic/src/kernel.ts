/**
 * Python kernel bridge — executes snippets in a widget's kernel and returns stdout.
 * Throws with stderr+traceback on error.
 *
 * A widget's kernel is fixed when the widget is created: either a kernel it was handed
 * (e.g. one it started) or the session of the notebook it belongs to. It is never
 * re-resolved from "whichever notebook is focused", which used to send calls to the
 * wrong kernel as soon as the user clicked into another notebook.
 *
 * License: BSD 3-Clause
 */
import { JupyterFrontEnd } from '@jupyterlab/application';
import type { ISessionContext } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import type { Kernel } from '@jupyterlab/services';


//
// Types
//
/**
 * Where a widget's kernel calls go. ``kernel`` wins when both are set; ``session`` follows
 * that notebook's kernel across restarts.
 */
export interface KernelSource {
  kernel?: Kernel.IKernelConnection | null;
  session?: ISessionContext | null;
}

/** A kernel obtained for a new widget, and whether the widget must shut it down. */
export interface AcquiredKernel {
  source: KernelSource;
  kernel: Kernel.IKernelConnection;
  owns: boolean;
}


//
// Public
//
export class KernelError extends Error {
  readonly traceback: string;

  constructor(message: string, traceback: string) {
    super(message);
    this.name = 'KernelError';
    this.traceback = traceback;
  }
}


export class KernelBridge {
  private readonly _source: KernelSource;
  readonly cwd: string | undefined;

  /**
   * @param source - The widget's kernel or notebook session (fixed for its lifetime).
   * @param cwd - Working directory the widget was opened in, if known.
   */
  constructor(source: KernelSource, cwd?: string) {
    this._source = source;
    this.cwd = cwd;
  }

  /** The kernel calls currently go to (null if the session has no kernel). */
  get activeKernel(): Kernel.IKernelConnection | null {
    return this._source.kernel ?? this._source.session?.session?.kernel ?? null;
  }

  /**
   * Execute a Python snippet and return stdout (trimmed).
   * @throws KernelError(traceback) if Python raised (even after printing some output), or if
   *     it printed only to stderr; Error("No active kernel") without a kernel.
   */
  async exec(code: string): Promise<string> {
    const kernel = this.activeKernel;
    if (!kernel) throw new Error('No active kernel');
    let out = '', err = '';
    let summary = '';
    let raised = false;
    const future = kernel.requestExecute({ code });
    future.onIOPub = (msg: any) => {
      const t = msg.header.msg_type;
      if (t === 'stream') {
        if (msg.content?.name === 'stdout') out += msg.content.text as string;
        if (msg.content?.name === 'stderr') err += msg.content.text as string;
      } else if (t === 'error') {
        raised = true;
        const tb: string[] = msg.content?.traceback ?? [];
        summary = (msg.content?.ename ?? '') + ': ' + (msg.content?.evalue ?? '');
        err += summary + '\n' + tb.join('\n');
      }
    };
    await future.done;
    // an exception always fails the call: partial stdout before it is not a result
    if (raised || (!out.trim() && err)) {
      throw new KernelError(summary || err.trim(), err.trim());
    }
    return out.trim();
  }
}


/**
 * The session of the notebook whose DOM contains ``node`` (an inline output), else the
 * focused notebook's session. Call once, when creating the widget.
 */
export function notebookSession(
  tracker: INotebookTracker,
  node?: HTMLElement | null,
): ISessionContext | null {
  if (node) {
    let found: ISessionContext | null = null;
    tracker.forEach(panel => {
      if (!found && panel.node.contains(node)) found = panel.sessionContext;
    });
    if (found) return found;
  }
  return tracker.currentWidget?.sessionContext ?? null;
}


/**
 * The focused notebook's kernel, or a newly started python3 kernel the caller owns.
 * The notebook is captured before awaiting, so focusing another notebook while the kernel
 * starts can't change the answer. Returns null if no kernel could be started.
 */
export async function acquireKernel(
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
): Promise<AcquiredKernel | null> {
  const session = tracker.currentWidget?.sessionContext ?? null;
  const existing = session?.session?.kernel ?? null;
  if (existing) return { source: { session }, kernel: existing, owns: false };
  try {
    const kernel = await app.serviceManager.kernels.startNew({ name: 'python3' });
    return { source: { kernel }, kernel, owns: true };
  } catch (e) {
    console.error('bioacoustic: failed to start kernel', e);
    return null;
  }
}


/**
 * Run ``code`` in ``kernel``, ignoring its output.
 * @returns The Python error message, or '' on success.
 */
export async function execInKernel(kernel: Kernel.IKernelConnection, code: string): Promise<string> {
  const future = kernel.requestExecute({ code });
  let error = '';
  future.onIOPub = (msg: any) => {
    if (msg.header?.msg_type === 'error') {
      error = msg.content.evalue || (msg.content.traceback || []).join('\n') || 'Unknown error';
    }
  };
  await future.done;
  return error;
}
