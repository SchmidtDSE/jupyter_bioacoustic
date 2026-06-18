/**
 * Centralized user-facing copy for the config-builder UI.
 *
 * Keep wording here (rather than inline in the section code) so it can be
 * edited without touching component logic. Values are HTML strings (rendered
 * via innerHTML) or plain text as noted.
 *
 * License: BSD 3-Clause
 */

/** Configuration Files section — explains the per-file controls (HTML). */
export const CONFIG_FILES_HELP =
  `A project is saved as up to three files — <b>project</b>, <b>config</b>, and <b>form</b>. ` +
  `Use the controls below to manage them:` +
  `<ul style="margin:4px 0 0 0;padding-left:16px;">` +
  `<li><b>Duplicate</b> — unlock the paths to save under new filenames. Saving creates copies ` +
  `of the existing files (leaving the original files untouched).</li>` +
  `<li><b>Linked</b> — keep all three filenames in sync from one name; unlink to set each path ` +
  `independently.</li>` +
  `<li><b>Lock</b> (per file) — fields for locked files are disabled, preventing unwanted changes. ` +
  `Note this also disables changing the "target" for the config-builder sections below.</li>` +
  `<li><b>Checkbox</b> — determines if that file is written as a separate file (checked) or ` +
  `inline to its parent (unchecked).</li>` +
  `</ul>`;

/** Inline hint under the form builder's add-element bar (plain text). */
export const FORM_ADD_HINT = 'Click on the buttons below to add items to the form.';

/** Inline hint for the select "add items" builder (plain text). */
export const FORM_ADD_ITEMS_HINT =
  'Add items one at a time. Use form field to reference a dynamic form.';

/** Inline hint above the secrets editor (plain text). */
export const SECRETS_HINT = 'Each entry is {key, value}. Value: env:VAR, dialog, or literal.';

/** Short blurb shown under the Setup tab bar for the active tab (plain text). */
export const SETUP_TAB_HELP: Record<string, string> = {
  create:
    `Choose a name for a new project, then use the sections below to build a configuration for ` +
    `your BioacousticAnnotator.`,
  template:
    `Pick a project template and fill in a few fields to quickly create a new project. The ` +
    `configuration can be further customized using the sections below.`,
  load:
    `Load an existing configuration and edit it using the sections below.`,
};
