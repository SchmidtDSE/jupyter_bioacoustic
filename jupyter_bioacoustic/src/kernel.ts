/**
 * Python kernel bridge — executes snippets in the current notebook kernel
 * and returns stdout. Throws with stderr+traceback on error.
 */
import { INotebookTracker } from '@jupyterlab/notebook';

export class KernelBridge {
  constructor(private _tracker: INotebookTracker) {}

  /** Get the currently-active kernel (may be null during startup). */
  private _kernel(): any {
    return this._tracker.currentWidget?.sessionContext.session?.kernel ?? null;
  }

  /**
   * Execute a Python snippet and return stdout (trimmed).
   * @throws Error(stderr+traceback) on Python error, or "No active kernel"
   */
  async exec(code: string): Promise<string> {
    const kernel = this._kernel();
    if (!kernel) throw new Error('No active kernel');
    let out = '', err = '';
    const future = kernel.requestExecute({ code });
    future.onIOPub = (msg: any) => {
      const t = msg.header.msg_type;
      if (t === 'stream') {
        if (msg.content?.name === 'stdout') out += msg.content.text as string;
        if (msg.content?.name === 'stderr') err += msg.content.text as string;
      } else if (t === 'error') {
        const tb: string[] = msg.content?.traceback ?? [];
        err += (msg.content?.ename ?? '') + ': ' + (msg.content?.evalue ?? '') +
               '\n' + tb.join('\n');
      }
    };
    await future.done;
    if (!out.trim() && err) throw new Error(err.trim());
    return out.trim();
  }
}
