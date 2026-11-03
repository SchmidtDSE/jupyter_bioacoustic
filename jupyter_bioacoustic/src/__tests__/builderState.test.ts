/**
 * @jest-environment jsdom
 *
 * ConfigPanel helpers: builderState.ts (which files are written / opened, validation text,
 * section data from a loaded state) and BuilderKernel.call (readiness + failure reporting).
 *
 * License: BSD 3-Clause
 */

import { BuilderKernel } from '../config_builder/builderKernel';
import {
  activeFilePath, collectDescriptionData, formatValidation, resolveSectionData, writableFiles,
} from '../config_builder/builderState';
import { StatusLine } from '../config_builder/statusLine';
import type { ConfigFilesData } from '../config_builder/types';

const FILES: ConfigFilesData = {
  project_enabled: true, config_enabled: true, form_enabled: false,
  project_path: 'p.yaml', config_path: 'c.yaml', form_path: undefined,
  project_locked: true, config_locked: false, form_locked: false,
};

describe('builderState', () => {
  it('writableFiles skips disabled, locked and path-less files', () => {
    expect(writableFiles(FILES)).toEqual(['c.yaml']);
  });

  it('activeFilePath prefers the project file even when locked', () => {
    expect(activeFilePath(FILES)).toEqual({ path: 'p.yaml', label: 'project' });
    expect(activeFilePath({ ...FILES, project_enabled: false })).toEqual({ path: 'c.yaml', label: 'config' });
    expect(activeFilePath({ ...FILES, project_enabled: false, config_enabled: false }).path).toBe('');
  });

  it('formatValidation lists errors then warnings, empty when clean', () => {
    expect(formatValidation({ valid: true })).toBe('');
    expect(formatValidation({ valid: false, errors: ['a', 'b'], warnings: ['w'] }))
      .toBe('Errors:\n• a\n• b\n\nWarnings:\n• w');
  });

  it('resolveSectionData follows the target, merging for split (project wins)', () => {
    const proj = { data: { value: 'p', index_column: 'id' } };
    const conf = { data: { value: 'c', duration: 3 } };
    expect(resolveSectionData('data', { data: 'config' }, proj, conf)).toEqual(conf.data);
    expect(resolveSectionData('data', { data: 'project' }, proj, conf)).toEqual(proj.data);
    expect(resolveSectionData('data', { data: 'split' }, proj, conf))
      .toEqual({ value: 'p', index_column: 'id', duration: 3 });
    expect(resolveSectionData('audio', { audio: 'split' }, proj, conf)).toBeNull();
  });

  it('collectDescriptionData: config wins, keeps an explicit description_open', () => {
    expect(collectDescriptionData(
      { description_title: 'P', description_open: false, description_text: '' },
      { description_title: 'C' },
    )).toEqual({ description_title: 'C', description_open: false });
  });
});

describe('BuilderKernel.call', () => {
  const DELIM = '___CB_JSON___';
  const wrap = (obj: unknown) => `${DELIM}\n${JSON.stringify(obj)}\n${DELIM}`;

  function kernel(exec: (code: string) => Promise<string>): { bk: BuilderKernel; status: StatusLine } {
    const status = new StatusLine();
    return { bk: new BuilderKernel({ cwd: '/w', exec } as any, status), status };
  }

  it('resolves the cwd and runs calls once ready', async () => {
    const { bk } = kernel(async code => code.includes('ready') ? wrap({ ready: true, cwd: '/abs' }) : wrap({ x: 1 }));
    expect(await bk.call('probe', 'Oops', (r: { x: number }) => r.x + 1)).toBe(2);
    expect(bk.cwd).toBe('/abs');
  });

  it('reports a failed call as "<label>: <message>" and returns null', async () => {
    const { bk, status } = kernel(async code => {
      if (code.includes("'ready'")) return wrap({ ready: true, cwd: '/w' });
      throw new Error('boom');
    });
    expect(await bk.call('probe', 'Oops', () => 1)).toBeNull();
    expect(status.element.textContent).toBe('Oops: boom');
  });

  it('skips calls when setup failed', async () => {
    const handle = jest.fn();
    const { bk, status } = kernel(async () => { throw new Error('no kernel'); });
    expect(await bk.call('probe', 'Oops', handle)).toBeNull();
    expect(handle).not.toHaveBeenCalled();
    expect(status.element.textContent).toBe('Init failed: no kernel');
  });
});
