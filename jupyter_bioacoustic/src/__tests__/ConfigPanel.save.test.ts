/**
 * @jest-environment jsdom
 *
 * ConfigPanel save flow: the overwrite prompt covers every file being written (the form file
 * was ignored), and with the project file locked "Save & Open" still opens the project file.
 *
 * License: BSD 3-Clause
 */

const dialogs: Array<{ title: string; body: string }> = [];
jest.mock('../util', () => ({
  ...jest.requireActual('../util'),
  showDialog: jest.fn(async (opts: any) => {
    dialogs.push({ title: opts.title, body: String(opts.body) });
    return 'Overwrite';
  }),
}));

import { ConfigPanel, withYamlExt } from '../config_builder/ConfigPanel';

(globalThis as any).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
(globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };

const DELIM = '___CB_JSON___';
const wrap = (obj: any) => `${DELIM}\n${JSON.stringify(obj)}\n${DELIM}`;

/** Fake kernel answering the builder's calls; `existing` = files already on disk. */
function fakeKernel(existing: string[], savedPaths: Record<string, string>): any {
  return {
    cwd: '/work',
    exec: async (code: string) => {
      if (code.includes('get_routing_keys')) return wrap({});
      if (code.includes('os.path.exists(')) {
        const m = code.match(/os\.path\.exists\('([^']*)'\)/);
        return wrap({ exists: existing.includes(m ? m[1] : '') });
      }
      if (code.includes('.validate()')) return wrap({ valid: true, errors: [], warnings: [] });
      if (code.includes('save_all()')) return wrap({ saved_paths: savedPaths });
      if (code.includes('_CB_INSTANCE')) return wrap({ cwd: '/work', debug: false });
      return wrap({});
    },
  };
}

async function panelWithFiles(files: Record<string, any>, kernel: any): Promise<ConfigPanel> {
  const panel = new ConfigPanel(kernel);
  await (panel as any)._readyPromise;
  (panel as any)._configFiles.setData(files);
  return panel;
}

beforeEach(() => { dialogs.length = 0; });

describe('ConfigPanel save', () => {
  it('asks before overwriting the form file too', async () => {
    const kernel = fakeKernel(['forms/f.yaml'], { form: 'forms/f.yaml' });
    const panel = await panelWithFiles({
      project_path: 'projects/p.yaml', config_path: 'config/c.yaml', form_path: 'forms/f',
      project_enabled: false, config_enabled: false, form_enabled: true,
    }, kernel);
    await panel.saveAndOpenAnnotator();
    const prompt = dialogs.find(d => d.title === 'Overwrite Files?');
    expect(prompt?.body).toContain('forms/f.yaml');
  });

  it('opens the locked project file, not the config', async () => {
    const kernel = fakeKernel([], { config: 'config/c.yaml', form: 'forms/f.yaml' });
    const panel = await panelWithFiles({
      project_path: 'projects/p', config_path: 'config/c.yaml', form_path: 'forms/f.yaml',
      project_enabled: true, config_enabled: true, form_enabled: true, project_locked: true,
    }, kernel);
    expect(await panel.saveAndOpenAnnotator()).toBe('projects/p.yaml');
  });

  it('withYamlExt mirrors the kernel', () => {
    expect([withYamlExt('a'), withYamlExt('a.yaml'), withYamlExt('a.YML')]).toEqual(['a.yaml', 'a.yaml', 'a.YML']);
  });
});

describe('ConfigPanel resize handle', () => {
  it('leaves no document listeners behind', async () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    const panel = new ConfigPanel(fakeKernel([], {}));
    const moves = () => add.mock.calls.filter(c => c[0] === 'mousemove').length
      - remove.mock.calls.filter(c => c[0] === 'mousemove').length;
    expect(moves()).toBe(0);                                  // nothing registered up front
    const handle = panel.element.children[1] as HTMLElement;
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
    expect(moves()).toBe(1);                                  // only while dragging
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(moves()).toBe(0);
  });
});
