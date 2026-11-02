/**
 * @jest-environment jsdom
 *
 * CollapsibleSection's shared helpers: routed per-field locking, focus rows and target options.
 *
 * License: BSD 3-Clause
 */

import { CollapsibleSection } from '../config_builder/sections/CollapsibleSection';
import type { FileFlags } from '../config_builder/types';

class TestSection extends CollapsibleSection {
  readonly a = document.createElement('input');
  readonly b = document.createElement('input');
  readonly btn = document.createElement('button');

  constructor() {
    super('Test', 'test', false, true, ['split', 'project', 'config']);
    for (const el of [this.a, this.b, this.btn]) this._body.appendChild(el);
  }

  lock(locks: FileFlags): void {
    this._applyRoutedLocks(
      [{ el: this.a, key: 'a' }, { el: this.b, key: 'b' }, { el: this.btn, key: 'a' }],
      locks, { project: ['a'], config: ['b'] },
    );
  }

  focusRow(): HTMLDivElement {
    return this._makeFocusRow('docs_key', 'label', true);
  }

  getData(): Record<string, any> { return {}; }
  setData(): void {}
}

const LOCK_PROJECT: FileFlags = { project: true, config: false, form: false };
const NONE: FileFlags = { project: false, config: false, form: false };

describe('CollapsibleSection._applyRoutedLocks', () => {
  it('split target: locks only the fields routed to the locked file', () => {
    const s = new TestSection();
    s.setTarget('split');
    s.lock(LOCK_PROJECT);
    expect([s.a.disabled, s.b.disabled, s.btn.disabled]).toEqual([true, false, true]);
    expect(s.a.nextElementSibling?.tagName).toBe('SPAN');            // lock marker after input
    expect(s.btn.nextElementSibling).toBeNull();                      // buttons get no marker
  });

  it('whole-file target: every field follows that file', () => {
    const s = new TestSection();
    s.setTarget('project');
    s.lock(LOCK_PROJECT);
    expect([s.a.disabled, s.b.disabled]).toEqual([true, true]);
    s.setTarget('config');
    s.lock(LOCK_PROJECT);
    expect([s.a.disabled, s.b.disabled]).toEqual([false, false]);
  });

  it('unlocking removes the markers again', () => {
    const s = new TestSection();
    s.setTarget('split');
    s.lock(LOCK_PROJECT);
    s.lock(NONE);
    expect(s.a.disabled).toBe(false);
    expect(s.a.nextElementSibling).toBe(s.b);
  });
});

describe('CollapsibleSection helpers', () => {
  it('_makeFocusRow emits its docs key on focus/click', () => {
    const s = new TestSection();
    const keys: string[] = [];
    s.fieldFocused.connect((_, k) => keys.push(k));
    const row = s.focusRow();
    row.dispatchEvent(new Event('click'));
    row.dispatchEvent(new FocusEvent('focusin'));
    expect(keys).toEqual(['docs_key', 'docs_key']);
    expect(row.textContent).toBe('label');
  });

  it('setTargetOptions keeps the current target or falls back to the last option', () => {
    const s = new TestSection();
    s.setTarget('config');
    s.setTargetOptions(['project', 'config']);
    expect(s.getTarget()).toBe('config');
    s.setTargetOptions(['project']);
    expect(s.getTarget()).toBe('project');
  });
});
