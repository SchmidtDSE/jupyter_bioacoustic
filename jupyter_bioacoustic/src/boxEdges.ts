/**
 * Pure geometry for dragging a box edge on the spectrogram (no DOM), so it can be unit-tested.
 *
 * License: BSD 3-Clause
 */


//
// Types
//
export type BoxEdge = 'left' | 'right' | 'top' | 'bottom';

/** A box in data units: seconds (x) and Hz (y). */
export interface BoxBounds {
  startTime: number;
  endTime: number;
  minFreq: number;
  maxFreq: number;
}


//
// Public
//
/**
 * The bound a drag of ``edge`` changes, and its new value. The edge follows the cursor but
 * never crosses the opposite edge.
 *
 * @param box - The box being resized.
 * @param edge - Which edge is being dragged.
 * @param time - Cursor time (s).
 * @param freq - Cursor frequency (Hz).
 */
export function dragBoxEdge(
  box: BoxBounds,
  edge: BoxEdge,
  time: number,
  freq: number,
): { field: keyof BoxBounds; value: number } {
  switch (edge) {
    case 'left': return { field: 'startTime', value: Math.min(time, box.endTime) };
    case 'right': return { field: 'endTime', value: Math.max(time, box.startTime) };
    case 'top': return { field: 'maxFreq', value: Math.max(freq, box.minFreq) };
    case 'bottom': return { field: 'minFreq', value: Math.min(freq, box.maxFreq) };
  }
}
