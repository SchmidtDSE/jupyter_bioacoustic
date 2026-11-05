/**
 * @jest-environment jsdom
 *
 * FormSection.setData(yaml) -> getData() returns the same form (H12/H13), including dynamic
 * forms and an annotation inside the `form:` list.
 *
 * License: BSD 3-Clause
 */

import { FormSection } from '../config_builder/sections/FormSection';

const FORM = {
  title: { value: 'REVIEW CLIP', progress_tracker: true },
  pass_value: { source_column: 'id', column: 'detection_id' },
  form: [
    { select: { label: 'Is Valid', column: 'is_valid', required: true,
                items: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no', form: 'correction_form' }] } },
    { annotation: { start_time: { column: 'begin', source_value: 'start_time' },
                    end_time: { column: 'end', source_value: 'end_time' }, tools: ['start_end_time_select'] } },
    { textbox: { label: 'notes', column: 'notes' } },
  ],
  submission_buttons: { line: true, next: { label: 'Skip', icon: true }, submit: { label: 'Verify', icon: true } },
  dynamic_forms: {
    correction_form: [
      { text: 'Pick the species you actually heard' },
      { line: true },
      { select: { label: 'verified name', column: 'verified', required: true,
                  items: { path: 'data/species.csv', value: 'common_name', filter_box: true } } },
      { annotation: { min_frequency: { column: 'f_lo' }, max_frequency: { column: 'f_hi' }, tools: ['bounding_box'] } },
    ],
  },
};

describe('FormSection round-trip (H12/H13)', () => {
  it('getData returns exactly what setData loaded', () => {
    (globalThis as any).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
    const section = new FormSection();
    section.setData(JSON.parse(JSON.stringify(FORM)));
    expect(section.getData()).toEqual(FORM);
  });

  it('round-trips multiselects in the form list and in a dynamic form', () => {
    (globalThis as any).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
    const forms = [
      {
        form: [
          { multiselect: { label: 'sources', column: 'sources', required: true, max: 3,
                           items: { path: 'data/species.csv', value: 'common_name', id: 'index',
                                    filter_box: true, not_available: 'none' } } },
          { annotation: { tools: ['multibox'], form: 'box_tags' } },
        ],
        dynamic_forms: {
          box_tags: [
            { multiselect: {
              label: 'in box', column: 'box_tags', items: ['owl', 'cat'],
              output: { format: 'columns', column_prefix: 'has_', true_value: 1, false_value: 0 },
            } },
          ],
        },
      },
    ];
    for (const form of forms) {
      const section = new FormSection();
      section.setData(JSON.parse(JSON.stringify(form)));
      expect(section.getData()).toEqual(form);
    }
  });

  it('moves a legacy top-level multiselect into the form list, as it does a select', () => {
    (globalThis as any).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
    const ms = {
      label: 'sources', column: 'sources', items: ['a', 'b'], output: { delimiter: ';' },
    };
    const section = new FormSection();
    section.setData({ multiselect: JSON.parse(JSON.stringify(ms)) });
    expect(section.getData()).toEqual({ form: [{ multiselect: ms }] });
  });
});
