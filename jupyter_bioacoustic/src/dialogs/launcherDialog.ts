/**
 * The launcher chooser: three tiles (Notebook / Annotator / Config Builder) shown when the
 * "Bioacoustic Annotator" launcher item is clicked. Arrow keys move the focus, Enter picks,
 * Escape or a backdrop click closes.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { bioacousticIconSvg, builderIconSvg, notebookIconSvg } from '../icons';
import { createModal } from '../modal';
import { COLORS } from '../styles';
import { LAUNCHER } from '../text';


//
// Constants
//
const ICON_SIZE = '40';


//
// Types
//
/** What each tile does when picked. */
export interface LauncherActions {
  onNotebook: () => void;
  onAnnotator: () => void;
  onConfigBuilder: () => void;
}


//
// Public
//
/** Show the launcher chooser; the picked tile's action runs after the dialog closes. */
export function showLauncherDialog(actions: LauncherActions): void {
  const modal = createModal({
    title: LAUNCHER.title,
    cardCss:
      `border-radius:12px;padding:24px 28px;gap:16px;min-width:340px;width:auto;` +
      `max-width:none;box-shadow:none;`,
    titleCss: `font-size:20px;text-align:center;`,
    zIndex: 10000,
  });

  const subtitle = document.createElement('div');
  subtitle.textContent = LAUNCHER.subtitle;
  subtitle.style.cssText =
    `font-size:14px;color:${COLORS.textMuted};text-align:center;margin-top:-8px;`;

  const tileRow = document.createElement('div');
  tileRow.style.cssText = `display:flex;gap:12px;justify-content:center;`;

  const tiles: HTMLButtonElement[] = [];
  let focusedIdx = 0;
  const setFocused = (idx: number) => {
    focusedIdx = idx;
    tiles.forEach((t, i) => { t.style.borderColor = i === idx ? COLORS.blue : COLORS.bgSurface1; });
  };

  const tileSpecs: Array<[{ label: string; desc: string }, string, () => void]> = [
    [LAUNCHER.tiles.notebook, notebookIconSvg, actions.onNotebook],
    [LAUNCHER.tiles.annotator, bioacousticIconSvg, actions.onAnnotator],
    [LAUNCHER.tiles.builder, builderIconSvg, actions.onConfigBuilder],
  ];
  for (const [text, iconSvg, onPick] of tileSpecs) {
    const tile = _makeTile(text.label, text.desc, iconSvg);
    tile.addEventListener('mouseenter', () => setFocused(tiles.indexOf(tile)));
    tile.addEventListener('click', () => { modal.close(); onPick(); });
    tiles.push(tile);
    tileRow.appendChild(tile);
  }
  setFocused(0);

  modal.card.append(subtitle, tileRow);
  modal.backdrop.tabIndex = -1;
  modal.backdrop.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocused((focusedIdx + 1) % tiles.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocused((focusedIdx - 1 + tiles.length) % tiles.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      tiles[focusedIdx].click();
    }
  });
  modal.backdrop.focus();
}


//
// Internal
//
/** One tile: icon, label and description (click handling is added by the caller). */
function _makeTile(label: string, desc: string, iconSvg: string): HTMLButtonElement {
  const tile = document.createElement('button');
  tile.style.cssText =
    `background:${COLORS.bgMantle};border:2px solid ${COLORS.bgSurface1};border-radius:8px;` +
    `padding:16px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;` +
    `cursor:pointer;flex:1;min-width:130px;transition:border-color 0.15s;outline:none;`;

  const icon = document.createElement('div');
  icon.innerHTML = iconSvg;
  icon.style.cssText = `width:40px;height:40px;color:${COLORS.blue};`;
  icon.querySelector('svg')?.setAttribute('width', ICON_SIZE);
  icon.querySelector('svg')?.setAttribute('height', ICON_SIZE);

  const lbl = document.createElement('div');
  lbl.textContent = label;
  lbl.style.cssText = `font-size:15px;font-weight:600;color:${COLORS.textPrimary};`;

  const d = document.createElement('div');
  d.textContent = desc;
  d.style.cssText = `font-size:12px;color:${COLORS.textMuted};text-align:center;line-height:1.4;`;

  tile.append(icon, lbl, d);
  return tile;
}
