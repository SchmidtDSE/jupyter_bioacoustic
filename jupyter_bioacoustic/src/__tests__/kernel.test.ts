/**
 * Tests for the kernel bridge: a widget's kernel is fixed at creation (H8).
 *
 * License: BSD 3-Clause
 */

import { KernelBridge, acquireKernel, notebookSession } from '../kernel';

/** A fake kernel whose requestExecute prints `name` to stdout. */
function fakeKernel(name: string): any {
  return {
    name,
    requestExecute: () => {
      const future: any = {};
      // resolve on a later microtask, after the bridge has attached onIOPub
      future.done = Promise.resolve().then(() => {
        future.onIOPub?.({ header: { msg_type: 'stream' }, content: { name: 'stdout', text: name } });
      });
      return future;
    },
  };
}

/** A fake notebook panel whose DOM "contains" the given nodes. */
function fakePanel(kernelName: string, nodes: any[] = []): any {
  const sessionContext = { session: { kernel: fakeKernel(kernelName) } };
  return { sessionContext, node: { contains: (n: any) => nodes.includes(n) } };
}

function fakeTracker(panels: any[], current: any): any {
  return {
    currentWidget: current,
    forEach: (fn: (p: any) => void) => panels.forEach(fn),
  };
}

describe('KernelBridge', () => {
  it('keeps talking to its own notebook after focus moves', async () => {
    const a = fakePanel('A');
    const b = fakePanel('B');
    const tracker = fakeTracker([a, b], a);
    const bridge = new KernelBridge({ session: notebookSession(tracker) });
    tracker.currentWidget = b;                       // user clicks into notebook B
    expect(await bridge.exec('x')).toBe('A');
  });

  it('follows its notebook across a kernel restart', async () => {
    const a = fakePanel('A');
    const bridge = new KernelBridge({ session: a.sessionContext });
    a.sessionContext.session.kernel = fakeKernel('A-restarted');
    expect(await bridge.exec('x')).toBe('A-restarted');
  });

  it('prefers an explicit kernel', async () => {
    const a = fakePanel('A');
    const bridge = new KernelBridge({ kernel: fakeKernel('own'), session: a.sessionContext });
    expect(await bridge.exec('x')).toBe('own');
  });

  it('throws without a kernel', async () => {
    await expect(new KernelBridge({}).exec('x')).rejects.toThrow('No active kernel');
  });
});

describe('notebookSession', () => {
  it('finds the notebook containing an inline output', () => {
    const output = {};
    const a = fakePanel('A');
    const b = fakePanel('B', [output]);
    const tracker = fakeTracker([a, b], a);           // A is focused, output lives in B
    expect(notebookSession(tracker, output as any)).toBe(b.sessionContext);
  });

  it('falls back to the focused notebook', () => {
    const a = fakePanel('A');
    expect(notebookSession(fakeTracker([a], a))).toBe(a.sessionContext);
    expect(notebookSession(fakeTracker([], null))).toBeNull();
  });
});

describe('acquireKernel', () => {
  it("uses the focused notebook's session without owning it", async () => {
    const a = fakePanel('A');
    const got = await acquireKernel({} as any, fakeTracker([a], a));
    expect(got).toEqual({ source: { session: a.sessionContext }, kernel: a.sessionContext.session.kernel, owns: false });
  });

  it('owns a kernel it starts, even if focus changes while starting', async () => {
    const tracker = fakeTracker([], null);
    const started = fakeKernel('new');
    const app: any = {
      serviceManager: {
        kernels: {
          startNew: async () => {
            tracker.currentWidget = fakePanel('B');   // user focuses a notebook meanwhile
            return started;
          },
        },
      },
    };
    const got = await acquireKernel(app, tracker);
    expect(got).toEqual({ source: { kernel: started }, kernel: started, owns: true });
  });

  it('returns null when no kernel can be started', async () => {
    const app: any = { serviceManager: { kernels: { startNew: async () => { throw new Error('no'); } } } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await acquireKernel(app, fakeTracker([], null))).toBeNull();
  });
});
