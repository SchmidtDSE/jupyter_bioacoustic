/**
 * The builder's validate / save flows: Validate, validate-before-open, and validate ->
 * confirm overwrites -> ``save_all``. All three share the kernel ``validate()`` call and the
 * same error / warning dialog text.
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { showDialog } from '../util';
import { BuilderKernel } from './builderKernel';
import { activeFilePath, formatValidation, withYamlExt, writableFiles } from './builderState';
import {
  BuilderState, ValidationReply, checkFileExists, saveAll, validateConfig,
} from './python';
import { StatusLine } from './statusLine';
import type { ConfigFilesData } from './types';


//
// Constants
//
const NOTHING_TO_SAVE = 'Nothing to save — all files are disabled or locked';


//
// Public
//
export class SaveFlow {
  private _bk: BuilderKernel;
  private _status: StatusLine;
  private _getFiles: () => ConfigFilesData;

  /**
   * @param bk - The builder's kernel connection.
   * @param status - Status line for progress / outcome.
   * @param getFiles - The Configuration Files section's current data.
   */
  constructor(bk: BuilderKernel, status: StatusLine, getFiles: () => ConfigFilesData) {
    this._bk = bk;
    this._status = status;
    this._getFiles = getFiles;
  }

  /** Validate and show the result (passed / passed with warnings / failed) in a dialog. */
  async validate(): Promise<void> {
    await this._bk.ready;
    if (!this._bk.isReady) return;
    await this._validated('Validate error', async (reply, body) => {
      if (reply.valid && !body) {
        this._status.set('Validation passed');
        await showDialog({ title: 'Validation Passed', body: 'No issues found.' });
      } else if (reply.valid) {
        this._status.set('Validation passed with warnings', 'warning');
        await showDialog({ title: 'Validation Passed', body });
      } else {
        this._status.set('Validation failed', 'error');
        await showDialog({ title: 'Validation Failed', body });
      }
      return true;
    });
  }

  /**
   * Validate before opening the annotator on the saved files (errors block, warnings ask).
   *
   * @returns The file to open, or null when cancelled / invalid / nothing to open.
   */
  async validateForOpen(): Promise<string | null> {
    await this._bk.ready;
    if (!this._bk.isReady) return null;
    const files = this._getFiles();
    if (writableFiles(files).length === 0) {
      this._status.set(NOTHING_TO_SAVE, 'error');
      return null;
    }

    const proceed = await this._validated('Validation error', async (reply, body) => {
      if (!reply.valid) {
        await showDialog({ title: 'Validation Failed', body });
        this._status.set('Validation failed', 'error');
        return false;
      }
      if (body && !await this._confirm('Validation Warnings', body, 'Open Anyway')) {
        this._status.set('Cancelled', 'warning');
        return false;
      }
      return true;
    });
    if (!proceed) return null;

    this._status.set('Ready');
    return activeFilePath(files).path || null;
  }

  /**
   * Validate, confirm overwriting existing files, then ``save_all``.
   *
   * @param blockOnErrors - Validation errors cancel the save (else the user may save anyway).
   * @param onSaved - Receives the post-save state; returns the path to report as saved.
   * @returns ``onSaved``'s path, or null when cancelled or failed.
   */
  async validateAndSave(
    blockOnErrors: boolean, onSaved: (state: BuilderState) => string,
  ): Promise<string | null> {
    await this._bk.ready;
    if (!this._bk.isReady) return null;
    const enabled = writableFiles(this._getFiles());
    if (enabled.length === 0) {
      this._status.set(NOTHING_TO_SAVE, 'error');
      return null;
    }

    const proceed = await this._validated('Validation error', async (reply, body) => {
      if (!reply.valid && blockOnErrors) {
        await showDialog({ title: 'Validation Failed', body });
        this._status.set('Save cancelled — validation errors', 'error');
        return false;
      }
      if (!reply.valid || body) {
        const title = reply.valid ? 'Validation Warnings' : 'Validation Failed';
        if (!await this._confirm(title, body, 'Save Anyway')) {
          this._status.set('Save cancelled', 'warning');
          return false;
        }
      }
      return true;
    });
    if (!proceed) return null;

    // every file about to be written (project, config AND form), as the kernel will name it
    const existing: string[] = [];
    for (const path of enabled.map(withYamlExt)) {
      await this._bk.run(checkFileExists(path), null, (r: { exists: boolean }) => {
        if (r.exists) existing.push(path);
      });                                                   // unknown: treat as new
    }
    if (existing.length > 0) {
      const body = `These files already exist and will be overwritten:\n• ${existing.join('\n• ')}`;
      if (!await this._confirm('Overwrite Files?', body, 'Overwrite')) return null;
    }

    this._bk.dbg('saveToFile', { enabled });
    this._status.set(`Saving ${enabled.length} file(s)…`);
    return this._bk.run(saveAll(), 'Save failed', onSaved);
  }

  /**
   * Run the kernel's ``validate()`` and let ``decide`` act on it (dialogs, status).
   *
   * @param failLabel - Status label if the call (or ``decide``) fails.
   * @param decide - Gets the reply and its dialog text; resolves whether to continue.
   */
  private async _validated(
    failLabel: string,
    decide: (reply: ValidationReply, body: string) => Promise<boolean>,
  ): Promise<boolean> {
    this._status.set('Validating…');
    const proceed = await this._bk.run(
      validateConfig(), failLabel, (reply: ValidationReply) => decide(reply, formatValidation(reply)),
    );
    return proceed === true;
  }

  /** A Cancel / ``okLabel`` dialog; true when ``okLabel`` was chosen. */
  private async _confirm(title: string, body: string, okLabel: string): Promise<boolean> {
    const choice = await showDialog({
      title, body, buttons: [{ label: 'Cancel' }, { label: okLabel, primary: true }],
    });
    return choice === okLabel;
  }
}
