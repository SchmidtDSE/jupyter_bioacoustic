/**
 * Frequency axis labels (playerRender.drawFreqAxis): enough decimals for the tick spacing,
 * so zooming below 1 kHz doesn't print duplicate labels.
 *
 * License: BSD 3-Clause
 */
import { drawFreqAxis } from '../sections/playerRender';

//
// Internal
//
function axisLabels(fMin: number, fMax: number, height = 400): string[] {
  const texts: string[] = [];
  const ctx = {
    fillRect: () => undefined, beginPath: () => undefined, moveTo: () => undefined,
    lineTo: () => undefined, stroke: () => undefined,
    fillText: (text: string) => texts.push(text),
  } as unknown as CanvasRenderingContext2D;
  drawFreqAxis(ctx, height, 40, 0, fMin, fMax, (f: number) => f);
  return texts.filter(t => t !== 'kHz');
}

//
// Tests
//
describe('drawFreqAxis labels', () => {
  it('shows whole kHz without decimals', () => {
    expect(axisLabels(0, 10000)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('keeps sub-kHz detail when zoomed in', () => {
    const labels = axisLabels(0, 400);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('0.05');
  });
});
