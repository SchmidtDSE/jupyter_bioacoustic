/**
 * Tests for box-edge dragging geometry (H9: multibox edge resize).
 *
 * License: BSD 3-Clause
 */

import { dragBoxEdge } from '../boxEdges';

const box = { startTime: 1, endTime: 3, minFreq: 1000, maxFreq: 4000 };

describe('dragBoxEdge', () => {
  it('moves each edge to the cursor', () => {
    expect(dragBoxEdge(box, 'left', 0.5, 0)).toEqual({ field: 'startTime', value: 0.5 });
    expect(dragBoxEdge(box, 'right', 4.2, 0)).toEqual({ field: 'endTime', value: 4.2 });
    expect(dragBoxEdge(box, 'top', 0, 6000)).toEqual({ field: 'maxFreq', value: 6000 });
    expect(dragBoxEdge(box, 'bottom', 0, 500)).toEqual({ field: 'minFreq', value: 500 });
  });

  it('never crosses the opposite edge', () => {
    expect(dragBoxEdge(box, 'left', 9, 0).value).toBe(3);
    expect(dragBoxEdge(box, 'right', 0, 0).value).toBe(1);
    expect(dragBoxEdge(box, 'top', 0, 10).value).toBe(1000);
    expect(dragBoxEdge(box, 'bottom', 0, 9000).value).toBe(4000);
  });
});
