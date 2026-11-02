/**
 * Styling helpers shared by the annotator widget and the config builder.
 *
 * The color palette (Catppuccin Mocha) and the inline-CSS string factories live here so
 * components focus on behavior, not presentation. ``injectGlobalStyles`` adds the few rules
 * that can't be inline (placeholders, hover, table fixes), including some config-builder ones.
 *
 * License: BSD 3-Clause
 */
//
// Constants
//
/** The color palette (Catppuccin Mocha). */
export const COLORS = {
  // Backgrounds
  bgBase:       '#1e1e2e',
  bgMantle:     '#181825',
  bgCrust:      '#11111b',
  bgSurface0:   '#313244',
  bgSurface1:   '#45475a',
  bgSurface2:   '#585b70',
  bgAltRow:     '#252538',
  bgHover:      '#2a2a3d',
  bgSelected:   '#2d3f5e',
  bgReviewed:   '#1a2a1a',

  // Text
  textPrimary:  '#cdd6f4',
  textSubtle:   '#a6adc8',
  textMuted:    '#6c7086',

  // Accents
  blue:         '#89b4fa',
  green:        '#a6e3a1',
  red:          '#f38ba8',
  peach:        '#fab387',
  mauve:        '#cba6f7',
  sky:          '#89dceb',
  yellow:       '#f9e2af',
  teal:         '#94e2d5',
  pinkRose:     '#eba0ac',
  sapphire:     '#74c7ec',
  lavender:     '#b4befe',
  pink:         '#f5c2e7',
  overlay:      '#bac2de',
  flamingo:     '#f2cdcd',
  lockAmber:    '#cf9268',  // deadened peach — a locked file's lock toggle
};

/** Colors cycled through for multibox boxes and multi-row reviewed cards. */
export const DISPLAY_CHIP_COLORS = [
  COLORS.green, COLORS.mauve, COLORS.peach, COLORS.sky, COLORS.red,
];

/** Id of the injected global ``<style>`` element. */
const GLOBAL_STYLE_ID = 'jp-bioacoustic-global-styles';


//
// Public
//
// ── Inputs, buttons, bars ─────────────────────────────────────
/** Text / number input of width ``w``. */
export const inputStyle = (w = '80px') =>
  `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:4px;color:${COLORS.textPrimary};` +
  `padding:3px 6px;font-size:12px;width:${w};box-sizing:border-box;`;

/** A ``<select>``. */
export const selectStyle = () =>
  `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:4px;color:${COLORS.textPrimary};` +
  `padding:3px 5px;font-size:12px;`;

/** An inline label wrapping its control. */
export const labelStyle = () =>
  `display:flex;align-items:center;gap:5px;color:${COLORS.textSubtle};font-size:11px;white-space:nowrap;`;

/** A button; ``primary`` is the filled blue call-to-action. */
export const btnStyle = (primary = false) =>
  primary
    ? `background:${COLORS.blue};border:none;border-radius:4px;color:${COLORS.bgBase};padding:4px 12px;` +
      `font-size:12px;cursor:pointer;font-weight:700;`
    : `background:${COLORS.bgSurface1};border:none;border-radius:4px;color:${COLORS.textPrimary};padding:4px 10px;` +
      `font-size:12px;cursor:pointer;`;

/** A horizontal toolbar row. */
export const barStyle = () =>
  `display:flex;align-items:center;gap:8px;padding:6px 12px;` +
  `background:${COLORS.bgMantle};flex-wrap:wrap;flex-shrink:0;`;

/** Toolbar with a bottom border. */
export const barBottomStyle = () =>
  barStyle() + `border-bottom:1px solid ${COLORS.bgSurface0};`;

/** Toolbar with top and bottom borders. */
export const barTopBottomStyle = () =>
  barStyle() +
  `border-top:1px solid ${COLORS.bgSurface0};border-bottom:1px solid ${COLORS.bgSurface0};`;

// ── Labels / text ─────────────────────────────────────────────
/** Small non-wrapping label. */
export const smallLabelStyle = () =>
  `color:${COLORS.textSubtle};font-size:11px;white-space:nowrap;flex-shrink:0;`;

/** A form-field label (``fontSize`` px). */
export const formLabelStyle = (fontSize: number = 13) =>
  labelStyle() + `font-size:${fontSize}px;gap:7px;`;

/** An upper-case section title. */
export const sectionTitleStyle = () =>
  `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${COLORS.textMuted};`;

/** Small monospaced numbers (time displays). */
export const monoTextStyle = () =>
  `font-variant-numeric:tabular-nums;font-size:11px;color:${COLORS.textSubtle};` +
  `font-family:ui-monospace,monospace;`;

/** Muted helper text, optionally with a width / font size. */
export const mutedTextStyle = (opts: { width?: string; fontSize?: number } = {}) => {
  const size = opts.fontSize ?? 11;
  const width = opts.width ? `width:${opts.width};` : '';
  return `color:${COLORS.textSubtle};font-size:${size}px;${width}`;
};

// ── Containers / dividers ─────────────────────────────────────
/** A wrapping row of form fields (``display:none`` when ``hidden``). */
export const formRowStyle = (hidden: boolean = false) =>
  `display:${hidden ? 'none' : 'flex'};align-items:center;gap:16px;flex-wrap:wrap;`;

/** Horizontal rule with the given margin. */
export const dividerStyle = (margin: string = '0 -2px') =>
  `border-top:1px solid ${COLORS.bgSurface0};margin:${margin};`;

/** Full-width horizontal rule. */
export const fullWidthDividerStyle = () =>
  `border-top:1px solid ${COLORS.bgSurface0};width:100%;margin:2px 0;`;

// ── Filter chips ──────────────────────────────────────────────
/** A clip-table filter chip. */
export const filterChipStyle = () =>
  `display:inline-flex;align-items:center;gap:4px;` +
  `background:${COLORS.bgSurface1};color:${COLORS.textPrimary};` +
  `border-radius:12px;padding:2px 6px 2px 10px;font-size:11px;` +
  `white-space:nowrap;margin:2px;`;

/** The × on a filter chip. */
export const filterChipDismissStyle = () =>
  `background:none;border:none;color:${COLORS.textMuted};cursor:pointer;` +
  `font-size:14px;padding:0 2px;line-height:1;`;

// ── Utilities / icons ─────────────────────────────────────────
/** A config size as CSS: numbers are px, strings pass through (``'50%'``). */
export const cssSize = (val: number | string): string =>
  typeof val === 'number' ? `${val}px` : String(val);

/**
 * Inline padlock SVG markup (closed when `locked`, open otherwise). Uses
 * `currentColor` so it inherits the element's text color. Set as innerHTML.
 */
export const lockIconSvg = (locked: boolean, size = 14): string => {
  const shackle = locked
    ? `<path d="M7 11V7a5 5 0 0 1 10 0v4"/>`
    : `<path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" style="vertical-align:middle;">` +
    `<rect x="3" y="11" width="18" height="11" rx="2"/>${shackle}</svg>`
  );
};

// ── Global stylesheet ─────────────────────────────────────────
/**
 * Inject a <style> tag with rules that can't be applied via inline styles
 * (pseudo-elements, etc.). Idempotent — only injects once per document.
 */
export function injectGlobalStyles(): void {
  if (document.getElementById(GLOBAL_STYLE_ID)) return;
  const styleEl = document.createElement('style');
  styleEl.id = GLOBAL_STYLE_ID;
  styleEl.textContent = `
    .jp-BA-chip-dismiss:hover { color: ${COLORS.red}; }
    .jp-BA-filter-input::placeholder {
      color: ${COLORS.overlay} !important;
      opacity: 0.7 !important;
      font-style: italic;
    }
    [id^="jp-config-builder"] input::placeholder,
    [id^="jp-config-builder"] textarea::placeholder {
      color: ${COLORS.textSubtle} !important;
      opacity: 0.6 !important;
    }
    /* When mounted inline (inline=True) the widget lives inside a notebook
       output's .jp-RenderedHTMLCommon, whose table CSS (table-layout: fixed;
       margin: auto; max-width) collapses the clip table so columns overlap.
       Restore content-sizing + horizontal scroll for our tables. */
    [id^="jp-bioacoustic-"] table {
      table-layout: auto !important;
      width: 100% !important;
      margin: 0 !important;
      max-width: none !important;
    }
    [id^="jp-bioacoustic-"] th,
    [id^="jp-bioacoustic-"] td {
      max-width: none !important;
    }
  `;
  document.head.appendChild(styleEl);
}
