/**
 * @jest-environment jsdom
 *
 * Side form (``side_form``): config parsing and column sizing (sideForm.ts), FormPanel's side
 * mode, and the builder round-trip.
 *
 * License: BSD 3-Clause
 */

import { FormSection } from '../config_builder/sections/FormSection';
import { FormPanel } from '../sections/FormPanel';
import {
  DEFAULT_SIDE_FORM_SPLIT, MAX_SIDE_FORM_SPLIT, MIN_SIDE_FORM_SPLIT, parseSideForm, sideFormSizes,
} from '../sideForm';

describe('parseSideForm', () => {
  it('null unless side_form is true', () => {
    expect([parseSideForm(null), parseSideForm({}), parseSideForm({ side_form: 'yes' })])
      .toEqual([null, null, null]);
  });

  it('the split, defaulted and clamped', () => {
    expect(parseSideForm({ side_form: true })).toBeCloseTo(DEFAULT_SIDE_FORM_SPLIT);
    expect(parseSideForm({ side_form: true, side_form_split: 0.5 })).toBe(0.5);
    expect(parseSideForm({ side_form: true, side_form_split: 0.99 })).toBe(MAX_SIDE_FORM_SPLIT);
    expect(parseSideForm({ side_form: true, side_form_split: 0.01 })).toBe(MIN_SIDE_FORM_SPLIT);
  });
});

describe('sideFormSizes', () => {
  it('both open: the split, with the divider', () => {
    expect(sideFormSizes(0.66, true, true, false))
      .toEqual({ direction: 'row', player: '0 0 66.00%', form: '1 1 0', divider: true });
  });

  it('a collapsed side shrinks to its content; the other takes the rest; no divider', () => {
    expect(sideFormSizes(0.66, false, true, false))
      .toEqual({ direction: 'row', player: '0 0 auto', form: '1 1 0', divider: false });
    expect(sideFormSizes(0.66, true, false, false))
      .toEqual({ direction: 'row', player: '1 1 0', form: '0 0 auto', divider: false });
  });

  it('narrow: stacked', () => {
    expect(sideFormSizes(0.66, true, true, true).direction).toBe('column');
  });
});

describe('FormPanel side mode', () => {
  it('left border, no minimum height; collapsed adds the strip class; stacked is normal', async () => {
    const p = new FormPanel({ exec: () => Promise.resolve('[]') } as any);
    p.setContext({
      formConfig: { side_form: true, title: { value: 'R' }, form: [{ textbox: { label: 'n' } }] },
      rows: [{ id: 1, start_time: 0, end_time: 1 }], duplicateEntries: true,
      outputPath: 'o.csv', dataIndexCol: 'id', outputIndexCol: 'id',
    });
    await p.build();
    p.setSideMode(true);
    expect(p.element.classList.contains('jp-BA-side-form')).toBe(true);
    expect(p.element.style.minHeight).toBe('0px');
    p.setCollapsed(true);
    expect(p.element.classList.contains('jp-BA-form-collapsed')).toBe(true);
    expect(p.element.querySelector('[data-form-title-text]')!.textContent).toBe('R');
    p.setSideMode(true, true);                       // stacked: back to the normal look
    expect(p.element.classList.contains('jp-BA-side-form')).toBe(false);
  });
});

describe('builder: side_form round-trip', () => {
  it('keeps side_form and side_form_split', () => {
    const section = new FormSection();
    const form = { side_form: true, side_form_split: 0.6, form: [{ textbox: { label: 'n', column: 'n' } }] };
    section.setData(JSON.parse(JSON.stringify(form)));
    expect(section.getData()).toEqual(form);
    section.setData({ form: [] });
    expect('side_form' in section.getData()).toBe(false);
  });
});


describe('builder: submission_buttons false', () => {
  it('round-trips', () => {
    const section = new FormSection();
    const form = { form: [{ textbox: { label: 'n', column: 'n' } }], submission_buttons: false };
    section.setData(JSON.parse(JSON.stringify(form)));
    expect(section.getData()).toEqual(form);
  });
});
