/**
 * @jest-environment jsdom
 *
 * Inline widgets suppress notebook shortcuts (with Lumino's real CommandRegistry): a key typed
 * on a focused canvas inside the annotator must not run a notebook command-mode shortcut.
 *
 * License: BSD 3-Clause
 */

import { CommandRegistry } from '@lumino/commands';
import { suppressNotebookShortcuts } from '../util';

function setup(suppress: boolean) {
  const registry = new CommandRegistry();
  let deleted = 0;
  registry.addCommand('notebook:delete-cell', { execute: () => { deleted++; } });
  // the same selector style JupyterLab uses for command-mode bindings
  registry.addKeyBinding({ command: 'notebook:delete-cell', keys: ['D'],
                           selector: '.jp-Notebook.jp-mod-commandMode :focus:not(:read-write)' });
  document.body.innerHTML = '<div class="jp-Notebook jp-mod-commandMode"><div id="w"><canvas tabindex="0"></canvas></div></div>';
  const widget = document.getElementById('w')!;
  if (suppress) suppressNotebookShortcuts(widget);
  const canvas = widget.querySelector('canvas')!;
  canvas.focus();
  const press = () => {
    const event = new KeyboardEvent('keydown', { key: 'd', keyCode: 68, bubbles: true });
    canvas.dispatchEvent(event);
    registry.processKeydownEvent(event);
  };
  return { press, deleted: () => deleted };
}

describe('notebook shortcuts inside an inline widget', () => {
  it('fire without suppression (the bug)', () => {
    const s = setup(false);
    s.press();
    expect(s.deleted()).toBe(1);
  });

  it('do not fire with suppression', () => {
    const s = setup(true);
    s.press();
    expect(s.deleted()).toBe(0);
  });
});
