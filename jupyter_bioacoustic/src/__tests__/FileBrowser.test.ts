/**
 * @jest-environment jsdom
 *
 * FileBrowser folder mode: Enter in a text box (new-folder name) must not also select the
 * current folder; Enter elsewhere still does.
 *
 * License: BSD 3-Clause
 */

import { FileBrowser } from '../config_builder/FileBrowser';

function browser(): { fb: FileBrowser; selected: string[] } {
  const kernel: any = { cwd: '/work', exec: async () => '___CB_JSON___\n{"entries": []}\n___CB_JSON___' };
  const fb = new FileBrowser(kernel, '/work/data', [], true);
  const selected: string[] = [];
  fb.fileSelected.connect((_, path) => selected.push(path));
  return { fb, selected };
}

const enter = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });

describe('FileBrowser Enter in folder mode', () => {
  it('ignores Enter typed in a text box', () => {
    const { fb, selected } = browser();
    const input = document.createElement('input');
    fb.element.appendChild(input);
    input.dispatchEvent(enter());
    expect(selected).toEqual([]);
  });

  it('selects the folder on Enter elsewhere', () => {
    const { fb, selected } = browser();
    fb.element.dispatchEvent(enter());
    expect(selected).toHaveLength(1);
  });
});
