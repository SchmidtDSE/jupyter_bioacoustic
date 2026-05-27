import {
  readKernelVars, readAudio, buildSpectrogram,
  spectrogramPipeline, loadSelectItems,
  countOutputRows, readOutputRows, writeOutputRow, deleteOutputRow,
  savePng, syncOutput, getDefaultProjectPath, saveProject,
  resolveOutputTemplates,
} from '../python';
import {
  extractJson, ensureSetup, updateSection, listFiles, checkFileExists,
  readState, updateConfigFromYaml, saveAll, saveSingleFile,
  createDirectory, readColumns, readSampleData, setSectionTarget,
  validateConfig, loadConfig, getSummary,
} from '../config_builder/python';

describe('readKernelVars', () => {
  const code = readKernelVars();

  test('contains import json', () => {
    expect(code).toContain('import json');
  });

  test('contains expected variables', () => {
    for (const v of ['_BA_DATA', '_BA_AUDIO', '_BA_OUTPUT', '_BA_FORM_CONFIG',
                      '_BA_CAPTURE', '_BA_CAPTURE_HEIGHT', '_BA_SPEC_RESOLUTIONS',
                      '_BA_MERGED_CONFIG']) {
      expect(code).toContain(v);
    }
  });
});

describe('readAudio', () => {
  test('includes path and times', () => {
    const code = readAudio('/path/to/audio.flac', 10.5, 5.0);
    expect(code).toContain('/path/to/audio.flac');
    expect(code).toContain('10.5');
    expect(code).toContain('5');
  });

  test('escapes single quotes in path', () => {
    const code = readAudio("it's/file.flac", 0, 1);
    expect(code).toContain("\\'s");
  });
});

describe('buildSpectrogram', () => {
  test('mel type', () => {
    const code = buildSpectrogram('mel');
    expect(code).toContain('mel');
  });

  test('linear type', () => {
    const code = buildSpectrogram('linear');
    expect(code).toContain('linear');
  });

  test('custom resolution', () => {
    const code = buildSpectrogram('mel', 4000);
    expect(code).toContain('4000');
  });
});

describe('extractJson', () => {
  const DELIM = '___CB_JSON___';

  test('extracts content between delimiters', () => {
    const raw = `prefix${DELIM}{"key": "val"}${DELIM}suffix`;
    expect(extractJson(raw)).toBe('{"key": "val"}');
  });

  test('throws on missing delimiters', () => {
    expect(() => extractJson('no delimiters here')).toThrow();
  });

  test('throws on empty content', () => {
    expect(() => extractJson(`${DELIM}   ${DELIM}`)).toThrow();
  });
});

describe('ensureSetup', () => {
  test('includes chdir when cwd provided', () => {
    const code = ensureSetup('/my/dir');
    expect(code).toContain("chdir");
    expect(code).toContain('/my/dir');
  });

  test('omits chdir when no cwd', () => {
    const code = ensureSetup();
    expect(code).not.toContain('chdir');
  });

  test('escapes cwd path', () => {
    const code = ensureSetup("path's/dir");
    expect(code).toContain("\\'s");
  });
});

describe('updateSection', () => {
  test('includes section and data', () => {
    const code = updateSection('app', { width: 800 });
    expect(code).toContain("'app'");
    expect(code).toContain('800');
  });

  test('includes target when provided', () => {
    const code = updateSection('app', {}, 'config');
    expect(code).toContain("target='config'");
  });
});

describe('listFiles', () => {
  test('includes directory', () => {
    const code = listFiles('/some/dir');
    expect(code).toContain('/some/dir');
  });

  test('includes extensions', () => {
    const code = listFiles('/dir', ['.yaml', '.json']);
    expect(code).toContain("'.yaml'");
    expect(code).toContain("'.json'");
  });

  test('None when no extensions', () => {
    const code = listFiles('/dir');
    expect(code).toContain('None');
  });
});

describe('checkFileExists', () => {
  test('includes escaped path', () => {
    const code = checkFileExists('/path/to/file.yaml');
    expect(code).toContain('/path/to/file.yaml');
    expect(code).toContain('os.path.exists');
  });
});

describe('spectrogramPipeline', () => {
  test('builtin mel includes readAudio and mel', () => {
    const code = spectrogramPipeline('/a.flac', 0, 5, 'builtin', 'mel');
    expect(code).toContain('/a.flac');
    expect(code).toContain("spec_type='mel'");
  });

  test('builtin linear defaults', () => {
    const code = spectrogramPipeline('/a.flac', 0, 5, 'builtin', 'linear');
    expect(code).toContain("spec_type='linear'");
  });

  test('custom viz uses run_custom_viz', () => {
    const code = spectrogramPipeline('/a.flac', 0, 5, 'custom', undefined, 2);
    expect(code).toContain('run_custom_viz');
    expect(code).toContain('[2]');
  });

  test('passes resolution', () => {
    const code = spectrogramPipeline('/a.flac', 0, 5, 'builtin', 'mel', undefined, 4000);
    expect(code).toContain('4000');
  });
});

describe('writeOutputRow', () => {
  test('includes column names and values', () => {
    const code = writeOutputRow('/out.csv', { species: 'owl', count: 3 });
    expect(code).toContain("'species'");
    expect(code).toContain("'owl'");
    expect(code).toContain('3');
  });

  test('handles null values as None', () => {
    const code = writeOutputRow('/out.csv', { col: null });
    expect(code).toContain('None');
  });

  test('handles boolean values', () => {
    const code = writeOutputRow('/out.csv', { valid: true, bad: false });
    expect(code).toContain('True');
    expect(code).toContain('False');
  });

  test('extracts extension from path', () => {
    const code = writeOutputRow('/data/out.jsonl', { a: 1 });
    expect(code).toContain("'jsonl'");
  });
});

describe('deleteOutputRow', () => {
  test('includes lambda expression', () => {
    const code = deleteOutputRow('/out.csv', "r['id'] == '5'");
    expect(code).toContain("lambda r: r['id'] == '5'");
  });

  test('includes file path', () => {
    const code = deleteOutputRow('/data/out.jsonl', 'True');
    expect(code).toContain('/data/out.jsonl');
    expect(code).toContain("'jsonl'");
  });

  test('imports _safe_float', () => {
    const code = deleteOutputRow('/out.csv', "abs(_sf(r.get('start_time'))-10.5)<0.01");
    expect(code).toContain('_safe_float as _sf');
  });
});

describe('loadSelectItems', () => {
  test('includes path', () => {
    const code = loadSelectItems('/items.csv');
    expect(code).toContain('/items.csv');
  });

  test('includes column args', () => {
    const code = loadSelectItems('/items.csv', 'code', 'name');
    expect(code).toContain("'code'");
    expect(code).toContain("'name'");
  });

  test('None when no columns', () => {
    const code = loadSelectItems('/items.csv');
    expect(code).toContain('None');
  });
});

describe('countOutputRows', () => {
  test('includes path and ext', () => {
    const code = countOutputRows('/out.csv', 'csv');
    expect(code).toContain('/out.csv');
    expect(code).toContain("'csv'");
  });
});

describe('readOutputRows', () => {
  test('includes path and ext', () => {
    const code = readOutputRows('/out.jsonl', 'jsonl');
    expect(code).toContain('/out.jsonl');
    expect(code).toContain("'jsonl'");
  });
});

describe('savePng', () => {
  test('includes filename and data', () => {
    const code = savePng('/cap/img.png', 'abc123');
    expect(code).toContain('/cap/img.png');
    expect(code).toContain('abc123');
  });
});

describe('syncOutput', () => {
  test('without dest', () => {
    const code = syncOutput();
    expect(code).toContain('_BA_INSTANCE.sync(');
    expect(code).not.toContain('dest=');
  });

  test('with dest', () => {
    const code = syncOutput('s3://bucket/output');
    expect(code).toContain("dest='s3://bucket/output'");
  });
});

describe('getDefaultProjectPath', () => {
  test('includes slug generation', () => {
    const code = getDefaultProjectPath();
    expect(code).toContain('_slug');
    expect(code).toContain('_def_path');
  });
});

describe('saveProject', () => {
  test('includes path and overwrite', () => {
    const code = saveProject('projects/test.yaml', true);
    expect(code).toContain('projects/test.yaml');
    expect(code).toContain('True');
  });

  test('default no overwrite', () => {
    const code = saveProject('test.yaml');
    expect(code).toContain('False');
  });
});

describe('readState', () => {
  test('reads _CB_STATE', () => {
    const code = readState();
    expect(code).toContain('_CB_STATE');
  });
});

describe('updateConfigFromYaml', () => {
  test('includes yaml string and config type', () => {
    const code = updateConfigFromYaml('project_name: Test', 'project');
    expect(code).toContain('update_config_from_yaml');
    expect(code).toContain("'project'");
  });
});

describe('saveAll', () => {
  test('calls save_all', () => {
    const code = saveAll();
    expect(code).toContain('save_all');
    expect(code).toContain('saved_paths');
  });
});

describe('saveSingleFile', () => {
  test('includes config type', () => {
    const code = saveSingleFile('form_config');
    expect(code).toContain("save_single('form_config')");
  });
});

describe('createDirectory', () => {
  test('includes path', () => {
    const code = createDirectory('/new/dir');
    expect(code).toContain('makedirs');
    expect(code).toContain('/new/dir');
  });
});

describe('readColumns', () => {
  test('includes filepath', () => {
    const code = readColumns('/data.csv');
    expect(code).toContain('read_columns');
    expect(code).toContain('/data.csv');
  });
});

describe('readSampleData', () => {
  test('includes filepath and nRows', () => {
    const code = readSampleData('/data.csv', 10);
    expect(code).toContain('read_sample_data');
    expect(code).toContain('10');
  });

  test('default nRows is 5', () => {
    const code = readSampleData('/data.csv');
    expect(code).toContain('5');
  });
});

describe('setSectionTarget', () => {
  test('includes section and target', () => {
    const code = setSectionTarget('data', 'config');
    expect(code).toContain("'data'");
    expect(code).toContain("'config'");
  });
});

describe('validateConfig', () => {
  test('calls validate', () => {
    const code = validateConfig();
    expect(code).toContain('validate');
  });
});

describe('loadConfig', () => {
  test('includes path', () => {
    const code = loadConfig('/proj.yaml');
    expect(code).toContain('/proj.yaml');
  });

  test('includes file type hint', () => {
    const code = loadConfig('/proj.yaml', 'project');
    expect(code).toContain("file_type='project'");
  });
});

describe('getSummary', () => {
  test('calls build_summary_from_builder', () => {
    const code = getSummary();
    expect(code).toContain('build_summary_from_builder');
    expect(code).toContain('_CB_INSTANCE');
  });
});

describe('resolveOutputTemplates', () => {
  test('includes template parameter', () => {
    const code = resolveOutputTemplates('capture.[[%Y%m%d]].png');
    expect(code).toContain('capture.[[%Y%m%d]].png');
  });

  test('imports _resolve_templates', () => {
    const code = resolveOutputTemplates('test.[[%H%M]].png');
    expect(code).toContain('from jupyter_bioacoustic.api import _resolve_templates');
  });

  test('returns JSON with resolved field', () => {
    const code = resolveOutputTemplates('file.[[%Y]].txt');
    expect(code).toContain('json.dumps({');
    expect(code).toContain("'resolved':");
    expect(code).toContain('_resolve_templates');
  });

  test('escapes single quotes in template', () => {
    const code = resolveOutputTemplates("it's.[[%Y]].png");
    expect(code).toContain("\\'s");
  });
});
