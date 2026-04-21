/**
 * Styling helpers for the BioacousticWidget.
 *
 * All inline CSS strings and the color palette live here so the main widget
 * file focuses on behavior, not presentation.
 */

// ─── Color palette (Catppuccin Mocha) ─────────────────────────

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
};

export const DISPLAY_CHIP_COLORS = [
  COLORS.green, COLORS.mauve, COLORS.peach, COLORS.sky, COLORS.red,
];

// ─── CSS helper functions ─────────────────────────────────────

export const inputStyle = (w = '80px') =>
  `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:4px;color:${COLORS.textPrimary};` +
  `padding:3px 6px;font-size:12px;width:${w};box-sizing:border-box;`;

export const selectStyle = () =>
  `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};border-radius:4px;color:${COLORS.textPrimary};` +
  `padding:3px 5px;font-size:12px;`;

export const labelStyle = () =>
  `display:flex;align-items:center;gap:5px;color:${COLORS.textSubtle};font-size:11px;white-space:nowrap;`;

export const btnStyle = (primary = false) =>
  primary
    ? `background:${COLORS.blue};border:none;border-radius:4px;color:${COLORS.bgBase};padding:4px 12px;` +
      `font-size:12px;cursor:pointer;font-weight:700;`
    : `background:${COLORS.bgSurface1};border:none;border-radius:4px;color:${COLORS.textPrimary};padding:4px 10px;` +
      `font-size:12px;cursor:pointer;`;

export const barStyle = () =>
  `display:flex;align-items:center;gap:8px;padding:6px 12px;` +
  `background:${COLORS.bgMantle};flex-wrap:wrap;flex-shrink:0;`;

export const barBottomStyle = () =>
  barStyle() + `border-bottom:1px solid ${COLORS.bgSurface0};`;

export const barTopBottomStyle = () =>
  barStyle() +
  `border-top:1px solid ${COLORS.bgSurface0};border-bottom:1px solid ${COLORS.bgSurface0};`;

// ─── Label / text helpers ─────────────────────────────────────

export const smallLabelStyle = () =>
  `color:${COLORS.textSubtle};font-size:11px;white-space:nowrap;flex-shrink:0;`;

export const formLabelStyle = (fontSize: number = 13) =>
  labelStyle() + `font-size:${fontSize}px;gap:7px;`;

export const sectionTitleStyle = () =>
  `width:100%;font-size:13px;font-weight:700;letter-spacing:1.2px;color:${COLORS.textMuted};`;

export const monoTextStyle = () =>
  `font-variant-numeric:tabular-nums;font-size:11px;color:${COLORS.textSubtle};` +
  `font-family:ui-monospace,monospace;`;

export const mutedTextStyle = (opts: { width?: string; fontSize?: number } = {}) => {
  const size = opts.fontSize ?? 11;
  const width = opts.width ? `width:${opts.width};` : '';
  return `color:${COLORS.textSubtle};font-size:${size}px;${width}`;
};

// ─── Form row containers ──────────────────────────────────────

export const formRowStyle = (hidden: boolean = false) =>
  `display:${hidden ? 'none' : 'flex'};align-items:center;gap:16px;flex-wrap:wrap;`;

// ─── Divider ──────────────────────────────────────────────────

export const dividerStyle = (margin: string = '0 -2px') =>
  `border-top:1px solid ${COLORS.bgSurface0};margin:${margin};`;

export const fullWidthDividerStyle = () =>
  `border-top:1px solid ${COLORS.bgSurface0};width:100%;margin:2px 0;`;

// ─── Filter chip ──────────────────────────────────────────────

export const filterChipStyle = () =>
  `display:inline-flex;align-items:center;gap:4px;` +
  `background:${COLORS.bgSurface1};color:${COLORS.textPrimary};` +
  `border-radius:12px;padding:2px 6px 2px 10px;font-size:11px;` +
  `white-space:nowrap;margin:2px;`;

export const filterChipDismissStyle = () =>
  `background:none;border:none;color:${COLORS.textMuted};cursor:pointer;` +
  `font-size:14px;padding:0 2px;line-height:1;`;

// ─── Utility ──────────────────────────────────────────────────

export const cssSize = (val: any): string =>
  typeof val === 'number' ? `${val}px` : String(val);

// ─── Global stylesheet injection ──────────────────────────────

/**
 * Inject a <style> tag with rules that can't be applied via inline styles
 * (pseudo-elements, etc.). Idempotent — only injects once per document.
 */
export function injectGlobalStyles(): void {
  const ID = 'jp-bioacoustic-global-styles';
  if (document.getElementById(ID)) return;
  const styleEl = document.createElement('style');
  styleEl.id = ID;
  styleEl.textContent = `
    .jp-BA-chip-dismiss:hover { color: ${COLORS.red}; }
  `;
  document.head.appendChild(styleEl);
}
