/**
 * The ``button`` form element (config parsing, built-in icons, toggle states and styling;
 * no DOM, unit-tested).
 *
 * A button shows an ``icon`` (text, a unicode symbol, or a ``jba:`` built-in such as
 * ``jba:check``) or an ``image`` (a file path, read in the kernel, or an http(s) / data URL).
 * ``color`` / ``background`` set the icon and fill colours (built-ins have their own, which
 * these override).
 *
 * - ``column`` + ``value``: a click presses / un-presses the button. Buttons are grouped (a
 *   row / column / grid with ``unique``, else all buttons on one column): in a ``unique`` group
 *   (the default) pressing one un-presses the others. A column holds its pressed button's
 *   value, the pressed values joined by ``delimiter`` (non-unique, shared column), or its
 *   ``initial_value`` (default null) when none is pressed. ``pressed_icon`` / ``pressed_image``
 *   / ``pressed_color`` / ``pressed_background`` change the look while pressed; a pressed
 *   button also gets a white ring (and the rest of a unique group fades) unless
 *   ``highlight: false``.
 * - ``submit: true``: a click submits the form (after writing its value, if it has one).
 * - ``toggle``: a list of 2+ states (``value`` + ``icon`` / ``image``...); each click moves to the
 *   next state, wrapping around. It starts on the state whose value is ``initial_value``;
 *   with an ``initial_value`` that matches no state, or the toggle's own ``icon`` / ``image``
 *   (its "nothing chosen yet" look), it starts unset (that value, default null) until the
 *   first click; otherwise on the first state.
 * - ``size`` sets width and height (default 30px); ``width`` / ``height`` override it.
 * - ``hot_key``: a single character that clicks the button while it (or its row / column /
 *   grid) has keyboard focus; shown as a small corner letter with ``show_hot_key: true``.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS, cssSize } from '../../styles';
import { normalizeHotKey } from './hotkeys';


//
// Constants
//
/** Button width and height (px) when neither ``size`` nor ``width`` / ``height`` is set. */
export const DEFAULT_BUTTON_SIZE = 30;

/** Prefix of the built-in icons (``icon: jba:check``). */
export const BUILTIN_PREFIX = 'jba:';

/** The built-in icons: symbol, icon colour and fill. */
export const BUILTIN_ICONS: Record<string, BuiltinIcon> = {
  check:     { symbol: '✓', color: COLORS.bgBase, background: COLORS.green },
  x:         { symbol: '✗', color: COLORS.bgBase, background: COLORS.red },
  unsure:    { symbol: '?', color: COLORS.bgBase, background: COLORS.yellow },
  na:        { symbol: '∅', color: COLORS.textPrimary, background: COLORS.bgSurface2 },
  flag:      { symbol: '⚑', color: COLORS.bgBase, background: COLORS.peach },
  star:      { symbol: '★', color: COLORS.yellow, background: COLORS.bgSurface1 },
  checked:   { symbol: '☑', color: COLORS.textPrimary, background: COLORS.bgSurface1 },
  unchecked: { symbol: '☐', color: COLORS.textSubtle, background: COLORS.bgSurface1 },
  plus:      { symbol: '+', color: COLORS.textPrimary, background: COLORS.bgSurface1 },
  minus:     { symbol: '−', color: COLORS.textPrimary, background: COLORS.bgSurface1 },
};

/** The ring around a pressed button. */
const PRESSED_RING = '#ffffff';
/** Text-icon font size as a fraction of the button's smaller side. */
const ICON_FONT_FRACTION = 0.45;
/** Text-icon font size (px) when the button's size isn't a plain number. */
const DEFAULT_ICON_FONT_PX = 20;
/** Opacity of a toggle that hasn't been clicked yet and has no icon / image of its own. */
const UNSET_OPACITY = 0.45;
/** Opacity of the un-pressed buttons of a unique group once one is pressed. */
const FADED_OPACITY = 0.5;


//
// Types
//
/** A built-in icon: its symbol and colours. */
export interface BuiltinIcon {
  symbol: string;
  color: string;
  background: string;
}

/** How a button looks: an icon (text) or an image, its colours and its tooltip. */
export interface ButtonFace {
  /** Text shown ('' when ``image`` is used). Built-ins are already resolved to their symbol. */
  icon: string;
  /** Image path or URL ('' when ``icon`` is used). */
  image: string;
  color: string;
  background: string;
  /** Tooltip, '' for none. */
  label: string;
}

/** One state of a toggle button. */
export interface ToggleState {
  value: any;
  face: ButtonFace;
}

/** A parsed ``button`` element. */
export interface FormButtonSpec {
  /** Output column the button sets, or null for a submit-only button. */
  column: string | null;
  /** Value written to ``column`` (plain buttons). */
  value: any;
  /** Submit the form on click (not for toggles). */
  submit: boolean;
  /** The column must be set before the form can be submitted (plain buttons). */
  required: boolean;
  /** How the button looks (a toggle: before its first click). */
  face: ButtonFace;
  /** True when the button sets its own ``icon`` / ``image`` (a toggle then starts unset). */
  hasOwnFace: boolean;
  /** How it looks while pressed (``face`` with the ``pressed_*`` keys applied). */
  pressedFace: ButtonFace;
  /** Pressed ring / faded group (``highlight: false`` turns them off). */
  highlight: boolean;
  /** ``hot_key`` (a single character), or null. */
  hotKey: string | null;
  /** Show the hot key as a corner letter (``show_hot_key``, default false). */
  showHotKey: boolean;
  /** True when ``initial_value`` is set (it may be null). */
  hasInitialValue: boolean;
  initialValue: any;
  /** Toggle states (2+), or null for a plain button. */
  toggle: ToggleState[] | null;
  width: number | string;
  height: number | string;
}

/** A toggle's starting point: a state index, or -1 for "unset" (``value``, unset face). */
export interface ToggleStart {
  index: number;
  value: any;
}


//
// Public
//
/** Read a ``button`` element's config (missing keys get their defaults). */
export function parseFormButton(cfg: any): FormButtonSpec {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const size = c.size ?? DEFAULT_BUTTON_SIZE;
  const label = c.label != null ? String(c.label) : '';
  const toggle = Array.isArray(c.toggle)
    ? c.toggle
      .filter((st: any) => st && typeof st === 'object')
      .map((st: any): ToggleState => ({
        value: st.value ?? null,
        face: resolveFace(
          { ...st, color: st.color ?? c.color, background: st.background ?? c.background,
            label: st.label ?? c.label },
          String(st.value ?? '')),
      }))
    : null;
  const hasPressedLook = c.pressed_icon != null || c.pressed_image != null;
  const pressedBuiltin = hasPressedLook && builtinIcon(String(c.pressed_icon ?? ''));
  const pressed = {
    icon: hasPressedLook ? c.pressed_icon : c.icon,
    image: hasPressedLook ? c.pressed_image : c.image,
    // a pressed built-in brings its own colours unless pressed_color / background are set
    color: c.pressed_color ?? (pressedBuiltin ? undefined : c.color),
    background: c.pressed_background ?? (pressedBuiltin ? undefined : c.background),
    label,
  };
  return {
    column: c.column != null && c.column !== '' ? String(c.column) : null,
    value: c.value ?? null,
    submit: c.submit === true && !toggle,
    required: c.required === true,
    face: resolveFace({ ...c, label }, String(c.label ?? c.value ?? '')),
    hasOwnFace: c.icon != null || c.image != null,
    pressedFace: resolveFace(pressed, String(c.label ?? c.value ?? '')),
    highlight: c.highlight !== false,
    hotKey: normalizeHotKey(c.hot_key),
    showHotKey: c.show_hot_key === true,
    hasInitialValue: 'initial_value' in c,
    initialValue: c.initial_value ?? null,
    toggle,
    width: c.width ?? size,
    height: c.height ?? size,
  };
}


/**
 * A face from ``{icon, image, color, background, label}``: ``jba:`` icons become their
 * symbol and colours (``color`` / ``background`` override them); ``fallbackText`` is shown
 * when there is neither an icon nor an image.
 */
export function resolveFace(raw: any, fallbackText: string): ButtonFace {
  const image = raw.image != null && raw.image !== '' ? String(raw.image) : '';
  const iconRaw = raw.icon != null ? String(raw.icon) : '';
  const builtin = builtinIcon(iconRaw);
  return {
    icon: image ? '' : (builtin?.symbol ?? (iconRaw || fallbackText)),
    image,
    color: raw.color ?? builtin?.color ?? COLORS.textPrimary,
    background: raw.background ?? builtin?.background ?? COLORS.bgSurface1,
    label: raw.label != null ? String(raw.label) : '',
  };
}


/** The built-in for ``icon`` (``jba:<name>``), or null when it isn't one. */
export function builtinIcon(icon: string): BuiltinIcon | null {
  if (!icon.startsWith(BUILTIN_PREFIX)) return null;
  return BUILTIN_ICONS[icon.slice(BUILTIN_PREFIX.length)] ?? null;
}


/** Where a toggle starts (see the module docstring). */
export function toggleStart(spec: FormButtonSpec): ToggleStart {
  const states = spec.toggle ?? [];
  if (spec.hasInitialValue) {
    const idx = states.findIndex(st => st.value === spec.initialValue);
    return idx >= 0
      ? { index: idx, value: states[idx].value } : { index: -1, value: spec.initialValue };
  }
  if (spec.hasOwnFace) return { index: -1, value: null };
  return { index: 0, value: states[0]?.value ?? null };
}


/** The state after ``index`` (from unset, the first state). */
export function nextToggleIndex(spec: FormButtonSpec, index: number): number {
  const n = spec.toggle?.length ?? 0;
  return n === 0 ? -1 : (index + 1) % n;
}


/** Inline CSS for a button's hot key badge (a small letter in the top-right corner). */
export function hotKeyBadgeStyle(): string {
  return (
    `position:absolute;top:1px;right:2px;font-size:8px;font-weight:700;line-height:1;` +
    `opacity:0.75;pointer-events:none;font-family:ui-monospace,monospace;`
  );
}

/** Extra padding that moves the icon away from the badge (down and to the left). */
export const BADGE_ICON_OFFSET = 'padding:4px 6px 0 0;';


/** True when ``src`` can be used as an ``<img src>`` as is (http(s) or data URL). */
export function isDirectImageSrc(src: string): boolean {
  return /^(https?:|data:)/i.test(src);
}


/**
 * Inline CSS for a form button showing ``face``: ``pressed`` adds the white ring, ``faded``
 * fades it (the rest of a unique group), ``dimmed`` fades it more (an unset toggle).
 */
export function formButtonStyle(
  spec: FormButtonSpec, face: ButtonFace,
  opts: { pressed?: boolean; faded?: boolean; dimmed?: boolean } = {},
): string {
  const w = typeof spec.width === 'number' ? spec.width : NaN;
  const h = typeof spec.height === 'number' ? spec.height : NaN;
  const fontPx = isNaN(w) || isNaN(h)
    ? DEFAULT_ICON_FONT_PX
    : Math.max(8, Math.round(Math.min(w, h) * ICON_FONT_FRACTION));
  return (
    `width:${cssSize(spec.width)};height:${cssSize(spec.height)};padding:${face.image ? 3 : 0}px;` +
    `display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;` +
    `position:relative;` +
    `box-sizing:border-box;cursor:pointer;border-radius:6px;overflow:hidden;line-height:1;` +
    `font-size:${fontPx}px;font-weight:700;color:${face.color};background:${face.background};` +
    `border:2px solid transparent;` +
    (opts.pressed ? `box-shadow:0 0 0 2px ${PRESSED_RING};` : '') +
    `opacity:${opts.dimmed ? UNSET_OPACITY : opts.faded ? FADED_OPACITY : 1};`
  );
}
