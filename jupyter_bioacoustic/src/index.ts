/**
 * Extension entry point: JupyterLab loads the default export, the list of plugins
 * (the annotator and the config builder).
 *
 * License: BSD 3-Clause
 */
import { bioacousticPlugin } from './plugin';
import { configBuilderPlugin } from './config_builder';
export default [bioacousticPlugin, configBuilderPlugin];
