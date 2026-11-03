/**
 * ConfigPanel's chrome: the modal file-browser overlay and the drag handle that resizes the
 * docs / YAML pane.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { KernelBridge } from '../kernel';
import { COLORS } from '../styles';
import { FileBrowser } from './FileBrowser';


//
// Constants
//
const OVERLAY_CLASS = 'jp-cb-filebrowser';
const MIN_PANE_WIDTH = 200;
const MAX_PANE_WIDTH = 800;


//
// Types
//
/** What to browse for. */
export interface BrowseOptions {
  /** Directory (or file) to start in. */
  dir: string;
  /** Only show files with these extensions (all when empty). */
  extensions: readonly string[];
  /** Pick a folder instead of a file. */
  dirOnly?: boolean;
  /** Receives the chosen path. */
  onSelect: (path: string) => void;
}


//
// Public
//
/**
 * Show a FileBrowser over ``host`` (at most one at a time). Closes on a pick, on dismiss, or
 * on a click outside the browser.
 *
 * @param host - Positioned element to cover.
 * @param bridge - Kernel to list files with.
 * @param opts - What to browse for.
 */
export function openFileBrowserOverlay(
  host: HTMLElement, bridge: KernelBridge, opts: BrowseOptions,
): void {
  if (host.querySelector(`.${OVERLAY_CLASS}`)) return;

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.style.cssText =
    `position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;` +
    `background:rgba(0,0,0,0.5);padding:24px;`;

  const browserWrap = document.createElement('div');
  browserWrap.style.cssText =
    `position:relative;width:100%;max-width:500px;height:400px;`;

  const browser = new FileBrowser(bridge, opts.dir || '.', opts.extensions, !!opts.dirOnly, '.');
  browser.fileSelected.connect((_, path) => {
    opts.onSelect(path);
    overlay.remove();
  });
  browser.dismissed.connect(() => overlay.remove());

  browserWrap.appendChild(browser.element);
  overlay.appendChild(browserWrap);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  host.appendChild(overlay);
}


/**
 * A vertical drag handle that resizes ``pane`` (to its right) between 200 and 800 px.
 * Document listeners exist only during a drag (they used to stay registered for every builder
 * ever opened, keeping closed panels alive).
 *
 * @param pane - The element whose width the handle controls.
 */
export function makeResizeHandle(pane: HTMLElement): HTMLDivElement {
  const handle = document.createElement('div');
  handle.style.cssText =
    `width:5px;cursor:col-resize;background:${COLORS.bgSurface0};flex-shrink:0;` +
    `display:flex;align-items:center;justify-content:center;`;
  const grip = document.createElement('div');
  grip.style.cssText =
    `width:3px;height:28px;border-radius:2px;background:${COLORS.overlay};`;
  handle.appendChild(grip);

  handle.addEventListener('mousedown', (e) => {
    const startX = e.clientX;
    const startW = pane.offsetWidth;
    pane.style.transition = 'none';
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, startW + (startX - ev.clientX)));
      pane.style.width = `${newW}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      pane.style.transition = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  return handle;
}
