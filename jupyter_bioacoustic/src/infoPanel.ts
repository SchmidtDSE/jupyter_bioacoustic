/**
 * The annotator's collapsible "info" panel (ⓘ in the header): where the data, audio and
 * output come from, which config files were loaded, and links to the docs.
 *
 * Every value shown comes from config / data, so it is HTML-escaped before going into
 * ``innerHTML``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from './styles';
import { AudioConfig, KernelVars, SyncConfig } from './types';
import { escapeHtml, remoteScheme } from './util';


//
// Constants
//
const SITE_URL = 'https://schmidtdse.github.io/jupyter_bioacoustic';
const WIKI_URL = 'https://github.com/SchmidtDSE/jupyter_bioacoustic/wiki';
const DATA_SOURCE_KEYS = ['path', 'url', 'uri', 'sql', 'api'];
const ITEM_CSS = 'margin-bottom:4px;';
const INDENT = '&nbsp;&nbsp;&nbsp;&nbsp;';

/** The ⓘ toggle's content while the panel is closed (outline icon). */
export const INFO_ICON_CLOSED = `&#9432;`;
/** The ⓘ toggle's content while the panel is open (white filled circle with a black i). */
export const INFO_ICON_OPEN = `<span style="
        display:inline-block;
        width:14px;
        height:14px;
        border-radius:50%;
        background:white;
        color:black;
        text-align:center;
        line-height:14px;
        font-size:10px;
        font-weight:bold;
      ">i</span>`;


//
// Types
//
/** What the info panel describes. */
export interface InfoPanelContext {
  /** Raw kernel config (paths of the project / config / form files). */
  cfg: KernelVars;
  audioConfig: AudioConfig;
  outputPath: string;
  syncConfig: SyncConfig;
  /** The merged project config (``_BA_MERGED_CONFIG``), for the data / output sources. */
  mergedConfig: Record<string, any>;
  /** Number of data rows loaded. */
  rowCount: number;
}


//
// Public
//
/** The info panel's inner HTML for ``ctx`` (all values escaped). */
export function infoPanelHtml(ctx: InfoPanelContext): string {
  const { cfg } = ctx;
  return `
      <div style="font-family:monospace;">
        <div style="font-weight:600;margin-bottom:8px;color:${COLORS.textPrimary};">Data Sources & Output</div>
        <div style="${ITEM_CSS}">• <strong>data:</strong> ${_dataSourceHtml(ctx.mergedConfig.data, ctx.rowCount)}</div>
        <div style="${ITEM_CSS}">• <strong>audio:</strong> ${_audioSourceHtml(ctx.audioConfig)}</div>
        <div style="margin-bottom:12px;">• <strong>output:</strong><br>${INDENT}${_outputHtml(ctx)}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${COLORS.textPrimary};">Configuration Files</div>
        <div style="margin-bottom:12px;">${_configFilesHtml(cfg)}</div>

        <div style="font-weight:600;margin-bottom:8px;color:${COLORS.textPrimary};">Documentation</div>
        <div style="${ITEM_CSS}">• <strong>site:</strong> <a href="${SITE_URL}" target="_blank" style="color:${COLORS.blue};">schmidtdse.github.io/jupyter_bioacoustic</a></div>
        <div>• <strong>docs:</strong> <a href="${WIKI_URL}" target="_blank" style="color:${COLORS.blue};">github.com/SchmidtDSE/jupyter_bioacoustic/wiki</a></div>
      </div>
    `;
}


//
// Internal
//
/** ``(kind) path``, where kind is url/s3/gcs for remote paths, else ``type``. */
function _formatPath(path: string, type: string): string {
  if (!path) return `<span style="color:${COLORS.textSubtle};">Not specified</span>`;
  const label = remoteScheme(path) ?? type;
  return `<span style="color:${COLORS.blue};">(${escapeHtml(label)})</span> ${escapeHtml(path)}`;
}


/** A blue ``(tag)`` followed by already-safe HTML. */
function _tagged(tag: string, html: string): string {
  return `<span style="color:${COLORS.blue};">(${tag})</span> ${html}`;
}


function _dataSourceHtml(mcData: unknown, rowCount: number): string {
  const fromKernel = _tagged('kernel', `${rowCount} rows loaded`);
  if (typeof mcData === 'object' && mcData !== null) {
    const data = mcData as Record<string, unknown>;
    const srcKey = DATA_SOURCE_KEYS.find(k => k in data);
    const src = srcKey ? String(data[srcKey]) : '';
    return src ? `${_formatPath(src, srcKey!)} — ${rowCount} rows` : fromKernel;
  }
  if (typeof mcData === 'string') return `${_formatPath(mcData, 'path')} — ${rowCount} rows`;
  return fromKernel;
}


function _audioSourceHtml(audio: AudioConfig): string {
  if (audio.type === 'column') return _tagged('column', escapeHtml(String(audio.value)));
  if (audio.type && audio.value) return _formatPath(audio.value, audio.type);
  return `<span style="color:${COLORS.textSubtle};">Unknown audio source</span>`;
}


function _outputHtml(ctx: InfoPanelContext): string {
  const mcOutput = ctx.mergedConfig.output;
  const sync = (uri: unknown) =>
    `<br>${INDENT}${_tagged('sync', escapeHtml(String(uri)))}`;
  if (typeof mcOutput === 'object' && mcOutput !== null) {
    let html = _formatPath(mcOutput.path || ctx.outputPath, 'local');
    const syncUri = mcOutput.uri || mcOutput.url || (ctx.syncConfig && ctx.syncConfig.uri) || '';
    if (syncUri) html += sync(syncUri);
    return html;
  }
  let html = _formatPath(ctx.outputPath, 'local');
  if (ctx.syncConfig && ctx.syncConfig.uri) html += sync(ctx.syncConfig.uri);
  return html;
}


function _configFilesHtml(cfg: KernelVars): string {
  const files: Array<[string, string]> = [
    ['project', cfg.project_path], ['config', cfg.config_path], ['form', cfg.form_path],
  ];
  const html = files
    .filter(([, path]) => path)
    .map(([name, path]) =>
      `<div style="${ITEM_CSS}">• <strong>${name}:</strong> ${_formatPath(path, 'file')}</div>`)
    .join('');
  return html || `<div style="color:${COLORS.textSubtle};">No configuration files loaded</div>`;
}
