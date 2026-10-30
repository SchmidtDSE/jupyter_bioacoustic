/**
 * @jest-environment jsdom
 *
 * Player frequency coordinates: the visible range follows the frequency scale (mel/log), and
 * annotations drawn on the capture canvas use its height and padding.
 *
 * License: BSD 3-Clause
 */

import { Player } from '../sections/Player';

/** A bare Player with just the fields the coordinate helpers read. */
function player(scale: string, viewYMin = 0, viewYMax = 1): any {
  const p: any = Object.create(Player.prototype);
  Object.assign(p, {
    _freqMin: 0, _freqMax: 24000, _currentFreqScale: scale, _freqScaleLUT: null,
    _viewYMin: viewYMin, _viewYMax: viewYMax, _canvas: { height: 300, width: 800 },
  });
  return p;
}

describe('Player frequency view', () => {
  it('visible range follows the mel scale when zoomed', () => {
    const p = player('mel', 0.25, 0.75);
    const [lo, hi] = p._visibleFreqRange();
    expect(lo).toBeCloseTo(p._fracToFreq(0.25));
    expect(hi).toBeCloseTo(p._fracToFreq(0.75));
    expect(hi).not.toBeCloseTo(18000);                    // the old linear answer
  });

  it.each(['linear', 'mel', 'log'])('%s: frac -> Hz -> frac round-trips', scale => {
    const p = player(scale);
    for (const frac of [0.1, 0.5, 0.9]) expect(p._freqToFrac(p._fracToFreq(frac))).toBeCloseTo(frac);
  });
});

describe('Player annotation Y', () => {
  it('uses the capture canvas height and no padding when given', () => {
    const p = player('linear');
    expect(p._freqToY(24000, 500, 0)).toBeCloseTo(0);
    expect(p._freqToY(0, 500, 0)).toBeCloseTo(500);
    expect(p._freqToY(12000, 500, 0)).toBeCloseTo(250);
  });

  it('defaults to the on-screen canvas with its padding', () => {
    const p = player('linear');
    expect(p._freqToY(24000)).toBeCloseTo((Player as any).SPEC_PAD_Y);
    expect(p._freqToY(0)).toBeCloseTo(300 - (Player as any).SPEC_PAD_Y);
  });
});
