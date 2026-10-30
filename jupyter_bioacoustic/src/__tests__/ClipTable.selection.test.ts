/**
 * @jest-environment jsdom
 *
 * ClipTable keeps the selection on the same clip when the list is filtered, sorted or
 * refreshed (it used to keep the position, so a different clip appeared selected).
 *
 * License: BSD 3-Clause
 */

import { ClipTable } from '../sections/ClipTable';

const ROWS = [1, 2, 3, 4, 5].map(id => ({ id, start_time: id, end_time: id + 1, label: `c${id}` }));

function table(): ClipTable {
  const form: any = { isReviewed: () => false, getReviewedMap: () => new Map() };
  const t = new ClipTable(form);
  t.setData({ rows: ROWS, dataCols: ['id', 'label'], duplicateEntries: true, dataIndexCol: 'id' });
  return t;
}

const selectedId = (t: ClipTable) => t.filtered[t.selectedIdx]?.id;

describe('ClipTable selection follows its row', () => {
  it('after a filter removes rows above it', () => {
    const t = table();
    t.selectIndex(3);                                  // id 4
    (t as any)._activeFilters = [{ col: 'id', op: '>=', val: 3 }];
    t.refresh();
    expect(selectedId(t)).toBe(4);
  });

  it('after sorting', () => {
    const t = table();
    t.selectIndex(1);                                  // id 2
    (t as any)._sortCol = 'id';
    (t as any)._sortAsc = false;
    t.refresh();
    expect(selectedId(t)).toBe(2);
    expect(t.selectedIdx).toBe(3);
  });

  it('is cleared when its row is filtered out', () => {
    const t = table();
    t.selectIndex(0);                                  // id 1
    (t as any)._activeFilters = [{ col: 'id', op: '>', val: 1 }];
    t.refresh();
    expect(t.selectedIdx).toBe(-1);
  });
});
