/**
 * @jest-environment jsdom
 *
 * CollapseToggle (the playlist / spectrogram / form chevrons), InfoCard keeping it as its
 * first item, and ``setShown``.
 *
 * License: BSD 3-Clause
 */

import { CollapseToggle } from '../sections/CollapseToggle';
import { InfoCard } from '../sections/InfoCard';
import { setShown } from '../util';

describe('CollapseToggle', () => {
  it('starts open and toggles on click', () => {
    const states: boolean[] = [];
    const t = new CollapseToggle('Playlist', open => states.push(open));
    expect(t.open).toBe(true);
    expect(t.element.textContent).toBe('▾Playlist');
    t.element.click();
    expect(t.open).toBe(false);
    expect(t.element.textContent).toBe('▸Playlist');
    t.element.click();
    expect(states).toEqual([false, true]);
    expect(t.element.getAttribute('aria-expanded')).toBe('true');
  });

  it("'' hides the title", () => {
    const t = new CollapseToggle('Spectrogram', () => {});
    t.setTitle('');
    expect((t.element.lastElementChild as HTMLElement).style.display).toBe('none');
  });

  it('setOpen(false) reports the state', () => {
    const cb = jest.fn();
    new CollapseToggle('x', cb).setOpen(false);
    expect(cb).toHaveBeenCalledWith(false);
  });
});

describe('InfoCard leading element', () => {
  it('stays first across renders', () => {
    const card = new InfoCard();
    const toggle = new CollapseToggle('Playlist', () => {});
    card.setLeading(toggle.element);
    const opts = { titleTemplate: '[[sp]]', textTemplate: '', filteredIdx: 0, filteredLength: 2 };
    card.render({ start_time: 0, end_time: 3, sp: 'owl' } as any, opts);
    card.render({ start_time: 3, end_time: 6, sp: 'cat' } as any, opts);
    expect(card.element.firstElementChild).toBe(toggle.element);
    expect(card.element.querySelectorAll('[data-collapse-toggle]')).toHaveLength(1);
  });
});

describe('setShown', () => {
  it('restores the inline display it hid', () => {
    const el = document.createElement('div');
    el.style.display = 'contents';
    setShown(el, false);
    expect(el.style.display).toBe('none');
    setShown(el, false);                       // twice: still restores 'contents'
    setShown(el, true);
    expect(el.style.display).toBe('contents');
  });

  it('showing an element that was never hidden leaves it alone', () => {
    const el = document.createElement('div');
    el.style.display = 'flex';
    setShown(el, true);
    expect(el.style.display).toBe('flex');
  });
});
