/**
 * Form-builder serialization round-trips (H12/H13): every element's YAML survives
 * deserialize -> serialize unchanged.
 *
 * License: BSD 3-Clause
 */

import { ElementType, deserializeElement, serializeElement } from '../config_builder/formSerialization';

const CASES: Array<[ElementType, any]> = [
  ['title', 'REVIEW CLIP'],
  ['title', { value: 'REVIEW', progress_tracker: true }],
  ['pass_value', { source_column: 'id', column: 'detection_id' }],
  ['fixed_value', { column: 'round', value: 0 }],
  ['annotation', { tools: ['multibox'] }],
  ['annotation', {
    start_time: { column: 'begin', source_value: 'start_time' },
    end_time: { column: 'stop', source_value: 'detection_end' },
    min_frequency: { column: 'f_lo' },
    max_frequency: { column: 'f_hi' },
    tools: ['bounding_box', { fixed_duration: { min: 1, max: 5, step: 0.5 } }],
    form: 'box_form',
  }],
  ['submission_buttons', { line: true, next: { label: 'Skip', icon: true }, submit: { label: 'Verify', icon: true } }],
  ['submission_buttons', { previous: { label: 'Back', icon: false }, submit: true }],
  ['break', true],
  ['line', true],
  ['text', 'Listen for the **second** call'],
  ['select', { label: 'Is Valid', column: 'is_valid', required: true,
               items: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no', form: 'fix' }] }],
  ['select', { label: 'species', column: 'sp',
               items: { path: 'data/sp.csv', value: 'name', filter_box: true, not_available: { label: 'Unknown', value: 'unknown' } } }],
  ['textbox', { label: 'notes', column: 'notes', multiline: true }],
  ['checkbox', { label: 'confident', column: 'conf', checked_value: 'yes', unchecked_value: 'no' }],
  ['number', { label: 'count', column: 'count', min: 0, max: 10, step: 1 }],
];

describe('form element serialization', () => {
  it.each(CASES)('%s round-trips: %j', (type, yaml) => {
    expect(serializeElement(type, deserializeElement(type, yaml))).toEqual(yaml);
  });

  it('annotation YAML becomes card columns (H13)', () => {
    expect(deserializeElement('annotation', { start_time: { column: 'begin' }, tools: ['time_select'] }))
      .toEqual({ start_time_col: 'begin', tools: ['time_select'] });
  });

  it('text is a plain string, not {value} (H12)', () => {
    expect(serializeElement('text', deserializeElement('text', 'hello'))).toBe('hello');
  });
});
