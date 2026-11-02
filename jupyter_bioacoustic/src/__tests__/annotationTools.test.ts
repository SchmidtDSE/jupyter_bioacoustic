/**
 * @jest-environment jsdom
 *
 * Annotation tools on the canvas (annotationTools) driven through a real FormPanel and a
 * 1 px = 1 s / 1 px = 1 Hz fake canvas: box drawing and edge drags, multibox edge drags,
 * fixed-window placement and nudging.
 *
 * License: BSD 3-Clause
 */
import { AnnotationTools, ToolCanvas } from '../sections/annotationTools';
import { FormPanel } from '../sections/FormPanel';

const ROW = { id: 1, start_time: 0, end_time: 100 };

/** Canvas where x = seconds and y = 1000 - Hz, over a 0..100 s segment. */
function fakeCanvas(): ToolCanvas & { played: Array<[number, number]> } {
  const played: Array<[number, number]> = [];
  return {
    played,
    timeToX: t => t,
    xToTime: x => x,
    yToFreq: y => 1000 - y,
    pixelBox: (st, et, flo, fhi) => ({ sx: st, ex: et, yhi: 1000 - fhi, ylo: 1000 - flo }),
    segmentRange: () => [0, 100],
    renderFrame: () => {},
    context: () => null,
    playRange: (s, e) => { played.push([s, e]); },
    updateAnnotDisplay: () => {},
  };
}

async function setup(tools: any[]): Promise<{ form: FormPanel; t: AnnotationTools; canvas: any }> {
  const kernel: any = { exec: async () => '[]' };
  const form = new FormPanel(kernel);
  form.setContext({
    formConfig: { annotation: { tools } }, rows: [ROW], duplicateEntries: true,
    outputPath: 'out.csv', dataIndexCol: 'id', outputIndexCol: 'id',
  });
  await form.build();
  form.updateFromRow(ROW);
  const canvas = fakeCanvas();
  return { form, t: new AnnotationTools(form, canvas), canvas };
}

describe('bounding_box', () => {
  it('draws a box from the anchor, then drags its left edge without crossing', async () => {
    const { form, t } = await setup(['bounding_box']);
    expect(t.down(10, 900)).toBe(false);                // new box anchored at 10 s / 100 Hz
    t.move(30, 300);
    t.up(30, 700);
    expect(t.bounds()).toEqual({ st: 10, et: 30, flo: 100, fhi: 300 });

    expect(t.down(11, 800)).toBe(true);                  // grab the left edge
    t.move(50, 800);                                      // past the right edge
    expect(form.getFormValue('start_time')).toBe(30);
    expect(t.cursorAt(30, 800)).toBe('ew-resize');
  });

  it('ignores a click inside the box', async () => {
    const { t } = await setup(['bounding_box']);
    t.down(10, 900); t.move(50, 500); t.up(50, 500);
    expect(t.down(30, 700)).toBe(true);
    expect(t.dragging).toBe(false);
    expect(t.bounds()).toEqual({ st: 10, et: 50, flo: 100, fhi: 500 });
  });
});

describe('multibox', () => {
  it('adds a box on release and drags the grabbed box edge', async () => {
    const { form, t, canvas } = await setup(['multibox']);
    t.down(10, 900);
    t.up(40, 600);                                        // 10–40 s, 100–400 Hz
    expect(form.getMultiboxEntries()).toHaveLength(1);

    t.down(40, 750);                                      // right edge
    t.move(60, 750);
    t.up(60, 750);
    expect(form.getMultiboxEntries()[0].endTime).toBe(60);

    t.dblClick(30, 700);
    expect(canvas.played).toEqual([[10, 60]]);
  });

  it('drops boxes smaller than the minimum size', async () => {
    const { form, t } = await setup(['multibox']);
    t.down(10, 900);
    t.up(12, 898);
    expect(form.getMultiboxEntries()).toHaveLength(0);
  });
});

describe('fixed_duration', () => {
  it('places a window centred on the click, clamped to the segment, and nudges it', async () => {
    const { t } = await setup([{ fixed_duration: 10 }]);
    t.down(2, 500);
    expect(t.bounds()).toMatchObject({ st: 0, et: 10 });
    expect(t.nudgeFixedWindow(1)).toBe(true);
    expect(t.bounds().st).toBeCloseTo(0.05);
    expect(t.nudgeFixedWindow(-1)).toBe(true);
    expect(t.nudgeFixedWindow(-1)).toBe(true);
    expect(t.bounds().st).toBe(0);                         // stays in the segment
  });
});
