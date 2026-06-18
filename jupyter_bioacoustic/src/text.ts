/**
 * Centralized user-facing copy for the annotator widget.
 *
 * Keep wording here (rather than inline in components) so it can be edited
 * without touching component logic. Plain-text strings unless noted.
 *
 * License: BSD 3-Clause
 */

/** Launcher chooser dialog (three tiles). */
export const LAUNCHER = {
  title: 'Bioacoustic Annotator',
  subtitle: 'Choose an option to get started',
  tiles: {
    notebook: { label: 'Notebook', desc: 'Start with a pre-configured Jupyter notebook' },
    annotator: { label: 'Annotator', desc: 'Open a project file to review and annotate clips' },
    builder: { label: 'Config Builder', desc: 'Create or edit configuration files with a GUI' },
  },
};

/** "Select Bioacoustic Project" file-picker dialog. */
export const PROJECT_PICKER = {
  title: 'Select Bioacoustic Project',
  pathLabel: 'Project file path (local, s3://, gs://, or https://):',
  pathPlaceholder: 'e.g., annotator_config/projects/my_project.yaml or s3://bucket/config.yaml',
  browseLabel: 'Or browse files:',
  browseDisabledLabel: 'File browser (disabled for remote URIs)',
  remoteUriPlaceholder: 'Remote URI detected - file browser disabled',
};

/** Dialog titles / bodies. */
export const DIALOG = {
  kernelFailed: 'Failed to start a Python kernel.',
  configValidationFailedTitle: 'Config Validation Failed',
  annotatorErrorTitle: 'Annotator Error',
};

/** Button / control tooltips. */
export const TOOLTIP = {
  toggleInfo: 'Toggle configuration info',
  removeBox: 'Remove this box',
  removeFilter: 'Remove filter',
  refreshList: 'Refresh list',
  sortHeader: 'Click to sort · Shift-click to clear sort',
  zoomBox: 'Zoom to selection — draw a box on the spectrogram',
  panTool: 'Pan — click and drag to move around',
};

/** Inline hints. */
export const HINT = {
  drawBoxes: 'Draw on spectrogram to add boxes',
};
