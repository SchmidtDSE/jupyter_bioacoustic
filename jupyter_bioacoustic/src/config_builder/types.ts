/**
 * Types shared across the config builder UI (panel, sections and kernel-reply handling).
 *
 * License: BSD 3-Clause
 */
//
// Types
//
/** One of the three files a project is saved as. */
export type ConfigFileType = 'project' | 'config' | 'form';

/** A yes/no flag per config file (enabled checkboxes, lock states). */
export type FileFlags = Record<ConfigFileType, boolean>;

/** Keys a split section writes to each file (from the kernel's ``get_routing_keys``). */
export interface SectionRouting {
  project: string[];
  config: string[];
}

/** ``get_routing_keys()`` reply: split routing per section (data / audio / output). */
export type RoutingKeys = Record<string, SectionRouting>;

/** A control and the YAML key it edits, for per-field lock disabling. */
export interface LockableField {
  el: HTMLElement;
  key: string;
}

/**
 * ConfigFilesSection's payload, sent to ``update_section('project', ...)``. Paths are only set
 * for enabled files that have one.
 */
export type ConfigFilesData = {
  project_enabled: boolean;
  config_enabled: boolean;
  form_enabled: boolean;
  project_path?: string;
  config_path?: string;
  form_path?: string;
  project_locked: boolean;
  config_locked: boolean;
  form_locked: boolean;
};

/** The three YAML previews the right-hand pane shows. */
export interface YamlTexts {
  project_yaml: string;
  config_yaml: string;
  form_yaml: string;
}
