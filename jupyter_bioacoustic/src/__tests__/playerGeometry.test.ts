/**
 * Pure spectrogram coordinate math (playerGeometry): scales, canvas mapping, view
 * zoom/pan, window clamping, hit testing and axis ticks.
 *
 * License: BSD 3-Clause
 */
import {
  FULL_VIEW, FreqScale, clampWindow, fracToFreq, freqToFrac, freqToY, hitTestBox, hzToMel,
  isTimeZoomed, isZoomed, melToHz, niceTickInterval, panView, pointInBox, timeToX, xToTime,
  yToFreq, zoomToBox, zoomView,
} from '../sections/playerGeometry';

const scale = (kind: string, lut: number[] | null = null): FreqScale =>
  ({ min: 0, max: 24000, kind, lut });

describe('frequency scales', () => {
  it('mel round-trips', () => {
    for (const f of [0, 440, 8000]) expect(melToHz(hzToMel(f))).toBeCloseTo(f, 6);
  });

  it.each(['linear', 'mel', 'log'])('%s: frac -> Hz -> frac', kind => {
    for (const frac of [0.1, 0.5, 0.9]) {
      expect(freqToFrac(fracToFreq(frac, scale(kind)), scale(kind))).toBeCloseTo(frac);
    }
  });

  it('linear is proportional', () => {
    expect(freqToFrac(12000, scale('linear'))).toBeCloseTo(0.5);
    expect(fracToFreq(0.25, scale('linear'))).toBeCloseTo(6000);
  });

  it('lut interpolates and inverts', () => {
    const lut = [0, 0.5, 0.75, 1];                    // frac at 0, 8k, 16k, 24k Hz
    const s = scale('lut', lut);
    expect(freqToFrac(8000, s)).toBeCloseTo(0.5);
    expect(freqToFrac(12000, s)).toBeCloseTo(0.625);
    expect(fracToFreq(0.625, s)).toBeCloseTo(12000);
  });

  it('a lut scale without a table falls back to linear', () => {
    expect(freqToFrac(6000, scale('lut'))).toBeCloseTo(0.25);
  });
});

describe('canvas mapping', () => {
  const seg = { loadStart: 10, duration: 20 };
  const view = { xMin: 0.25, xMax: 0.75, yMin: 0, yMax: 0.5 };

  it('time <-> x accounts for the axis and the zoom', () => {
    expect(timeToX(15, seg, view, 440, 40)).toBeCloseTo(40);    // left edge of the view
    expect(timeToX(25, seg, view, 440, 40)).toBeCloseTo(440);   // right edge
    expect(xToTime(240, seg, view, 440, 40)).toBeCloseTo(20);
  });

  it('freq <-> y accounts for padding and the zoom', () => {
    const s = scale('linear');
    expect(freqToY(12000, s, view, 300, 10)).toBeCloseTo(10);   // top of the view
    expect(freqToY(0, s, view, 300, 10)).toBeCloseTo(290);
    expect(yToFreq(150, s, view, 300, 10)).toBeCloseTo(6000);
  });
});

describe('view window', () => {
  it('detects zoom', () => {
    expect(isZoomed(FULL_VIEW)).toBe(false);
    expect(isZoomed({ ...FULL_VIEW, yMax: 0.9 })).toBe(true);
    expect(isTimeZoomed({ ...FULL_VIEW, yMax: 0.9 })).toBe(false);
    expect(isTimeZoomed({ ...FULL_VIEW, xMin: 0.1 })).toBe(true);
  });

  it('pans without leaving the spectrogram', () => {
    const v = panView({ xMin: 0.5, xMax: 0.8, yMin: 0, yMax: 0.5 }, 0.5, -0.2);
    expect(v.xMin).toBeCloseTo(0.7);
    expect(v.xMax).toBeCloseTo(1);
    expect([v.yMin, v.yMax]).toEqual([0, 0.5]);
  });

  it('zooms around the center and clamps zoom-out to the full view', () => {
    const v = zoomView(FULL_VIEW, 0.5);
    expect([v.xMin, v.xMax, v.yMin, v.yMax]).toEqual([0.25, 0.75, 0.25, 0.75]);
    expect(zoomView(v, 4)).toEqual({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  });

  it('zooms to a box (y inverted: top of the canvas is high frequency)', () => {
    const v = zoomToBox(FULL_VIEW, 0.2, 0.6, 0.1, 0.5);
    expect(v.xMin).toBeCloseTo(0.2);
    expect(v.xMax).toBeCloseTo(0.6);
    expect(v.yMin).toBeCloseTo(0.5);
    expect(v.yMax).toBeCloseTo(0.9);
  });

  it('clamps a fixed window into the segment', () => {
    expect(clampWindow(-1, 2, 0, 10)).toEqual([0, 2]);
    expect(clampWindow(9, 2, 0, 10)).toEqual([8, 10]);
    expect(clampWindow(4, 2, 0, 10)).toEqual([4, 6]);
  });
});

describe('hit testing', () => {
  const box = { sx: 100, ex: 200, yhi: 50, ylo: 150 };

  it.each([
    [102, 100, 'left'], [198, 100, 'right'], [150, 52, 'top'], [150, 148, 'bottom'],
    [150, 100, 'inside'], [300, 100, null], [95, 45, 'left'],
  ])('(%d, %d) -> %s', (cx, cy, hit) => expect(hitTestBox(cx, cy, box, 10)).toBe(hit));

  it('pointInBox has no tolerance', () => {
    expect(pointInBox(100, 50, box)).toBe(true);
    expect(pointInBox(99, 100, box)).toBe(false);
  });
});

describe('niceTickInterval', () => {
  it.each([[24000, 6, 5000], [10000, 5, 2000], [1000, 10, 100], [24000, 3, 10000]])(
    'range %d / %d ticks -> %d', (range, n, step) => expect(niceTickInterval(range, n)).toBe(step));
});
