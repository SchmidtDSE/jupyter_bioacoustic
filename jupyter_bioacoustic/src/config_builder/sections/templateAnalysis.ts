/**
 * Placeholder analysis for "Create from Template" (pure, no DOM).
 *
 * A template's ``configuration`` holds ``__placeholder__`` strings; where each one sits decides
 * the widget TemplateForm shows for it (a scoped positional inference):
 *  - a ``*.source_type`` placeholder -> a source-type dropdown;
 *  - ``data.value`` / ``audio.value`` -> a value whose widget follows its source type;
 *  - an index / select column -> a column picker fed by the data (or items) file;
 *  - a source path -> text + Browse; everything else -> plain text.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { AUDIO_EXTS, DATA_EXTS, OUTPUT_EXTS } from '../constants';


//
// Constants
//
/** The template sections each "create" scope fills in. */
export const SCOPE_SECTIONS: Readonly<Record<string, string[]>> = {
  project: ['project', 'config', 'form'],
  config: ['config', 'form'],
  form: ['form'],
};

const PLACEHOLDER_RE = /^__([a-zA-Z0-9_]+)__$/;


//
// Types
//
/** The widget a template field gets. */
export type Role = 'plain' | 'source_type' | 'value' | 'column' | 'pathfile';

/** How to render one placeholder (from where it sits in the configuration). */
export interface Descriptor {
  role: Role;
  section?: 'data' | 'audio';
  exts?: readonly string[];
  /** value: sibling source_type placeholder key (dynamic). */
  sourceTypeKey?: string;
  /** value: fixed source_type literal from the configuration. */
  literalSourceType?: string;
  /** column / value(column): the field holding the source file. */
  providerKey?: string;
}

/** A ``builder_elements`` entry, normalised. */
export interface ElementSpec {
  required: boolean;
  default: unknown;
  label?: string;
  description?: string;
}


//
// Public
//
/**
 * A descriptor per placeholder in the sections ``scope`` creates.
 *
 * @param template - The parsed template (``load_template`` reply).
 * @param scope - ``project`` / ``config`` / ``form``.
 */
export function analyzeTemplate(
  template: Record<string, any>, scope: string,
): Map<string, Descriptor> {
  const map = new Map<string, Descriptor>();
  const dataProvider = _findDataProvider(template);
  for (const section of SCOPE_SECTIONS[scope] ?? []) {
    const cfg = template[section]?.configuration;
    if (cfg && typeof cfg === 'object') _walk(cfg, [], map, dataProvider);
  }
  return map;
}


/**
 * The key of a ``__key__`` placeholder string, or ``''``.
 *
 * @param v - Any configuration value.
 */
export function placeholderKey(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.match(PLACEHOLDER_RE);
  return m ? m[1] : '';
}


/**
 * Normalise a ``builder_elements`` spec: an object (``{required, default, label,
 * description}``), ``true`` / ``false`` (required or not), or a bare default value.
 */
export function normalizeElementSpec(spec: unknown): ElementSpec {
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const s = spec as Record<string, any>;
    return {
      required: !!s.required,
      default: s.default ?? null,
      label: s.label,
      description: s.description,
    };
  }
  if (spec === true) return { required: true, default: null };
  if (spec === false) return { required: false, default: null };
  return { required: false, default: spec };
}


//
// Internal
//
/** The placeholder holding the project's data file (feeds the column pickers). */
function _findDataProvider(template: Record<string, any>): string | undefined {
  const data = template?.['project']?.configuration?.data;
  if (!data || typeof data !== 'object') return undefined;
  return placeholderKey(data.value) || placeholderKey(data.path) || undefined;
}


function _walk(
  node: any, path: string[], map: Map<string, Descriptor>, dataProvider?: string,
): void {
  if (Array.isArray(node)) {
    for (const item of node) _walk(item, path, map, dataProvider);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const tail = path[path.length - 1];
  for (const [k, v] of Object.entries(node)) {
    const key = typeof v === 'string' ? placeholderKey(v) : '';
    if (key) {
      map.set(key, _classify(tail, k, node, dataProvider));
    } else {
      _walk(v, [...path, k], map, dataProvider);
    }
  }
}


/** The descriptor for placeholder ``key`` inside ``parent``, whose own key is ``tail``. */
function _classify(
  tail: string, key: string, parent: any, dataProvider?: string,
): Descriptor {
  const stMeta = {
    sourceTypeKey: placeholderKey(parent.source_type) || undefined,
    literalSourceType: (typeof parent.source_type === 'string' && !placeholderKey(parent.source_type))
      ? parent.source_type : undefined,
  };
  if (tail === 'data') {
    if (key === 'source_type') return { role: 'source_type', section: 'data' };
    if (key === 'path') return { role: 'pathfile', exts: DATA_EXTS };
    if (key === 'value') return { role: 'value', section: 'data', exts: DATA_EXTS, ...stMeta };
    if (key === 'index_column') return { role: 'column', providerKey: dataProvider };
  } else if (tail === 'audio') {
    if (key === 'source_type') return { role: 'source_type', section: 'audio' };
    if (key === 'column') return { role: 'column', providerKey: dataProvider };
    if (key === 'value') {
      return { role: 'value', section: 'audio', exts: AUDIO_EXTS, providerKey: dataProvider, ...stMeta };
    }
  } else if (tail === 'output') {
    if (key === 'path') return { role: 'pathfile', exts: OUTPUT_EXTS };
  } else if (tail === 'items') {
    if (key === 'path') return { role: 'pathfile', exts: DATA_EXTS };
    if (key === 'value') return { role: 'column', providerKey: placeholderKey(parent.path) || undefined };
  }
  if (key === 'source_type') return { role: 'source_type', section: 'data' };
  return { role: 'plain' };
}
