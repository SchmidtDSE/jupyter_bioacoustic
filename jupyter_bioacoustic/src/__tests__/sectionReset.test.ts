/**
 * @jest-environment jsdom
 *
 * Builder sections reset to their just-constructed state before a load (H7): loading file B
 * after file A must not keep any of A's values on screen.
 *
 * License: BSD 3-Clause
 */

import { AppSection } from '../config_builder/sections/AppSection';
import { AudioSection } from '../config_builder/sections/AudioSection';
import { ConfigFilesSection } from '../config_builder/sections/ConfigFilesSection';
import { DataSection } from '../config_builder/sections/DataSection';
import { DescriptionSection } from '../config_builder/sections/DescriptionSection';
import { OutputSection } from '../config_builder/sections/OutputSection';

(globalThis as any).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);

const SECRETS = [{ key: 'token', value: 'env:TOKEN' }];

const CASES: Array<[string, () => any, Record<string, any>]> = [
  ['Data', () => new DataSection(), {
    source_type: 'url', value: 'https://x/d.csv', index_column: 'id', duration: 3, secrets: SECRETS,
  }],
  ['Audio', () => new AudioSection(), {
    source_type: 'column', value: 'file', prefix: 's3://b/', suffix: '.flac', fallback: 'x.flac',
    secrets: false,
  }],
  ['Output', () => new OutputSection(), {
    path: 'out.csv', index_column: 'id', uri: 's3://b/out/', sync_button: 'Push', recursive: true,
    secrets: SECRETS,
  }],
  ['App', () => new AppSection(), {
    project_name: 'A', display_columns: ['a', 'b'], info_card_title: 'T', info_card_text: 'txt',
    sort: 'a', sort_order: 'desc', duplicate_entries: true, default_buffer: 2, capture: false,
    capture_dir: 'caps/', width: '90%', clip_table_height: 100, player_height: 200,
    info_card_height: 40, form_panel_height: 150, capture_height: 300, secrets: SECRETS,
  }],
  ['Description', () => new DescriptionSection(), {
    description: { title: 'About', text: 'Read me', path: 'about.md', open: false },
    description_height: 120,
  }],
  ['ConfigFiles', () => new ConfigFilesSection(), {
    project_path: 'p.yaml', config_path: 'c.yaml', form_path: 'f.yaml',
    project_enabled: false, config_enabled: true, form_enabled: false, config_locked: true,
  }],
];

describe('section reset (H7)', () => {
  it.each(CASES)('%s: setData(full) then reset() equals a fresh section', (_name, make, full) => {
    const fresh = make().getData();
    const section = make();
    section.setData(full);
    expect(section.getData()).not.toEqual(fresh);           // the payload really changed things
    section.reset();
    expect(section.getData()).toEqual(fresh);
  });

  it('loading a smaller second file shows nothing from the first', () => {
    const section = new OutputSection();
    section.setData({ path: 'a.csv', uri: 's3://b/a/', sync_button: true, recursive: true });
    section.reset();
    section.setData({ path: 'b.csv' });
    expect(section.getData()).toEqual({ path: 'b.csv' });
  });
});

describe('DataSection time columns', () => {
  it('keeps a custom start/end mapping through load and column detection', () => {
    const section = new DataSection();
    section.setData({ source_type: 'path', value: 'd.csv', start_time: 'begin', end_time: 'stop' });
    expect(section.getData()).toMatchObject({ start_time: 'begin', end_time: 'stop' });
    section.setDetectedColumns(['id', 'begin', 'stop', 'label']);
    expect(section.getData()).toMatchObject({ start_time: 'begin', end_time: 'stop' });
    section.setDetectedColumns(['id', 'label']);            // a file without those columns
    expect(section.getData()).toMatchObject({ start_time: 'begin', end_time: 'stop' });
  });

  it('defaults stay implicit', () => {
    const section = new DataSection();
    section.setData({ source_type: 'path', value: 'd.csv' });
    section.setDetectedColumns(['start_time', 'end_time']);
    expect(section.getData()).not.toHaveProperty('start_time');
  });
});

describe('AppSection display-columns drop on the empty area', () => {
  function drop(area: HTMLElement, col: string): void {
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { getData: () => col } });
    area.dispatchEvent(ev);
  }

  it('adds the column once, to the current list, however often the area was emptied', () => {
    const section: any = new AppSection();
    section.setColumnOptions(['a', 'b', 'c']);
    section.setData({ display_columns: [] });
    section.setData({ display_columns: [] });          // each used to stack another stale handler
    drop(section._dispChipsArea, 'a');
    expect(section.getData().display_columns).toEqual(['a']);
    drop(section._dispChipsArea, 'b');                 // not empty any more: area handler ignores it
    expect(section.getData().display_columns).toEqual(['a']);
  });
});
