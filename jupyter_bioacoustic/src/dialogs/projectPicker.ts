/**
 * "Select Bioacoustic Project" dialog: a path box (local, s3://, gs:// or https://) plus a
 * small server-file browser that lists folders and .yaml/.yml/.json files.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';

import { buttonRow, createModal, promptText } from '../modal';
import { COLORS, inputStyle } from '../styles';
import { PROJECT_PICKER } from '../text';
import { remoteScheme } from '../util';


//
// Constants
//
/** Folder (under the browser's cwd) the picker opens in when it exists. */
const PROJECTS_DIR = 'annotator_config/projects';
const PROJECT_FILE_RE = /\.(yaml|yml|json)$/;
const ROW_CSS = `padding:6px 0;cursor:pointer;border-bottom:1px solid ${COLORS.bgSurface0};`;


//
// Public
//
/**
 * Ask the user for a project file.
 *
 * @param browser - The default file browser (null: fall back to a plain text prompt).
 * @param defaultPath - The file browser's current directory (server-relative).
 * @returns The chosen path (server-relative, absolute or a remote URI), or '' if cancelled.
 */
export async function pickProjectFile(
  browser: IDefaultFileBrowser | null,
  defaultPath: string,
): Promise<string> {
  if (!browser) {
    const path = await promptText({ title: PROJECT_PICKER.title, label: 'Project file path (.yaml)' });
    return path ?? '';
  }
  const startPath = await _startDirectory(browser, defaultPath);
  return _showProjectFileDialog(browser, startPath, defaultPath);
}


//
// Internal
//
/** ``<cwd>/annotator_config/projects`` if that folder exists, else ``cwd``. */
async function _startDirectory(browser: IDefaultFileBrowser, cwd: string): Promise<string> {
  const projectsPath = cwd ? `${cwd}/${PROJECTS_DIR}` : PROJECTS_DIR;
  try {
    const contents = await browser.model.manager.services.contents.get(projectsPath);
    if (contents.type === 'directory') return projectsPath;
  } catch { /* directory doesn't exist */ }
  return cwd;
}


/**
 * Show the picker.
 *
 * @param browser - Used to list server directories.
 * @param initialPath - Directory listed first.
 * @param cwdPath - The file browser's directory: picked files under it are shown relative.
 */
function _showProjectFileDialog(
  browser: IDefaultFileBrowser,
  initialPath: string,
  cwdPath: string,
): Promise<string> {
  return new Promise<string>(resolve => {
    // Enter selects even when focus left the input (e.g. after clicking a file row)
    const onEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && pathInput.value.trim()) { e.preventDefault(); onSelect(); }
    };
    const modal = createModal({
      title: PROJECT_PICKER.title,
      cardCss: `max-width:600px;max-height:500px;padding:0;gap:0;`,
      titleCss: `padding:16px 20px;font-size:16px;border-bottom:1px solid ${COLORS.bgSurface0};`,
      zIndex: 10000,
      onDismiss: () => { document.removeEventListener('keydown', onEnter); resolve(''); },
    });

    // ── Path input ──────────────────────────────────────────────
    const inputSection = _div(
      `padding:16px 20px;border-bottom:1px solid ${COLORS.bgSurface0};background:${COLORS.bgMantle};`);
    const inputLabel = _div(
      `margin-bottom:8px;font-size:13px;font-weight:500;color:${COLORS.textSubtle};`,
      PROJECT_PICKER.pathLabel);
    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = PROJECT_PICKER.pathPlaceholder;
    pathInput.style.cssText =
      inputStyle('100%') + `padding:8px 12px;font-size:13px;font-family:monospace;`;
    const errorEl = _div(`display:none;margin-top:6px;font-size:12px;color:${COLORS.red};`);
    inputSection.append(inputLabel, pathInput, errorEl);

    // ── File browser ────────────────────────────────────────────
    const browserSection = _div(
      `flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:200px;`);
    const browserLabel = _div(
      `padding:12px 20px;font-size:13px;font-weight:500;color:${COLORS.textSubtle};` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`,
      PROJECT_PICKER.browseLabel);
    const listing = _div(`flex:1;overflow:auto;padding:16px 20px;color:${COLORS.textPrimary};`);
    browserSection.append(browserLabel, listing);

    // ── Buttons ─────────────────────────────────────────────────
    const finish = (path: string) => {
      document.removeEventListener('keydown', onEnter);
      modal.close();
      resolve(path);
    };
    let selectedFromBrowser = false;
    let currentBrowserPath = initialPath;

    const onSelect = () => {
      let finalPath = pathInput.value.trim();
      if (!finalPath) {
        errorEl.textContent = 'Please enter a file path or select a file.';
        errorEl.style.display = 'block';
        return;
      }
      // Only prepend the listed directory to typed relative paths: a file clicked in the
      // browser already carries its full path.
      if (!selectedFromBrowser && !finalPath.includes('://') && !finalPath.startsWith('/') &&
          currentBrowserPath) {
        finalPath = `${currentBrowserPath}/${finalPath}`.replace(/\/+/g, '/');
      }
      finish(finalPath);
    };
    const buttons = buttonRow([
      { label: 'Cancel', onClick: () => finish('') },
      { label: 'Select', primary: true, onClick: onSelect },
    ]);
    buttons.style.cssText += `padding:16px 20px;margin-top:0;border-top:1px solid ${COLORS.bgSurface0};`;

    modal.card.append(inputSection, browserSection, buttons);

    // ── Behaviour ───────────────────────────────────────────────
    /** Grey out the browser for remote URIs; hint the base dir for typed relative paths. */
    const updatePathContext = () => {
      const value = pathInput.value.trim();
      const isRemote = remoteScheme(value) !== null;
      browserSection.style.opacity = isRemote ? '0.4' : '1';
      browserSection.style.pointerEvents = isRemote ? 'none' : 'auto';
      browserLabel.textContent = isRemote
        ? PROJECT_PICKER.browseDisabledLabel : PROJECT_PICKER.browseLabel;
      browserLabel.style.color = isRemote ? COLORS.textMuted : COLORS.textSubtle;
      if (isRemote) {
        pathInput.placeholder = PROJECT_PICKER.remoteUriPlaceholder;
      } else if (value && !value.startsWith('/')) {
        pathInput.placeholder = `Current dir: ${currentBrowserPath}/`;
      } else {
        pathInput.placeholder = PROJECT_PICKER.pathPlaceholder;
      }
    };

    const openDir = (path: string) => {
      currentBrowserPath = path;
      void loadDir(path);
      updatePathContext();
    };

    const pickFile = (path: string) => {
      selectedFromBrowser = true;
      errorEl.style.display = 'none';
      pathInput.value = cwdPath && path.startsWith(cwdPath + '/')
        ? path.substring(cwdPath.length + 1)
        : path;
    };

    /** List ``path``: a ".." row, folders, and project files (others greyed out). */
    const loadDir = async (path: string) => {
      listing.replaceChildren(
        _div(`color:${COLORS.textMuted};text-align:center;padding:20px;`, 'Loading...'));
      try {
        const contents = await browser.model.manager.services.contents.get(path);
        listing.replaceChildren();
        if (path !== '') {
          const parent = _row('📁 ..', `color:${COLORS.blue};`);
          parent.onclick = () => openDir(path.split('/').slice(0, -1).join('/') || '');
          listing.appendChild(parent);
        }
        for (const item of contents.content ?? []) {
          // server file names: text, never HTML
          if (item.type === 'directory') {
            const el = _row(`📁 ${item.name}`);
            el.onclick = () => openDir(item.path);
            listing.appendChild(el);
          } else if (PROJECT_FILE_RE.test(item.name.toLowerCase())) {
            const el = _row(`📄 ${item.name}`);
            el.onclick = () => pickFile(item.path);
            el.ondblclick = () => { pickFile(item.path); onSelect(); };
            el.onmouseover = () => { el.style.backgroundColor = COLORS.bgHover; };
            el.onmouseout = () => { el.style.backgroundColor = 'transparent'; };
            listing.appendChild(el);
          } else {
            listing.appendChild(_row(`📄 ${item.name}`, `color:${COLORS.textMuted};cursor:default;`));
          }
        }
      } catch (error) {
        listing.replaceChildren(
          _div(`color:${COLORS.red};padding:20px;`, `Error loading directory: ${error}`));
      }
    };

    pathInput.addEventListener('input', () => {
      selectedFromBrowser = false;
      errorEl.style.display = 'none';
      updatePathContext();
    });
    document.addEventListener('keydown', onEnter);

    void loadDir(initialPath);
    updatePathContext();
    pathInput.focus();
  });
}


/** A ``<div>`` with inline CSS and optional text. */
function _div(css: string, text?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = css;
  if (text !== undefined) el.textContent = text;
  return el;
}


/** One row of the file listing. */
function _row(text: string, extraCss = ''): HTMLDivElement {
  return _div(ROW_CSS + extraCss, text);
}
