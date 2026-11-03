/**
 * python.test
 *
 * License: BSD 3-Clause
 */
import {
  readKernelVars, readAudio, buildSpectrogram,
  spectrogramPipeline, loadSelectItems,
  countOutputRows, readOutputRows, writeOutputRow, writeOutputRows, deleteOutputRow,
  savePng, syncOutput,
  resolveOutputTemplates,
} from '../python';
import {
  extractJson, ensureSetup, initBuilder, updateSection, listFiles, checkFileExists,
  updateConfigFromYaml, saveAll, saveSingleFile,
  createDirectory, readColumns, setSectionTarget,
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

describe('initBuilder', () => {
  test('chdirs (escaped) and sets up a ConfigBuilder', () => {
    const code = initBuilder("/my/proj's");
    expect(code).toContain("chdir(_os.path.expanduser('/my/proj\\'s'))");
    expect(code).toContain('ConfigBuilder()');
    expect(code).toContain('_cb.setup()');
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

describe('writeOutputRows', () => {
  // The generated code is RUN in Python (the env with jupyter_bioacoustic) and the file read
  // back: column names / values with quotes, backslashes, newlines and NaN must round-trip.
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const nodePath = require('path');
  const python = process.env.JBA_TEST_PYTHON || 'python';
  const probe = spawnSync(python, ['-c', 'import jupyter_bioacoustic._kernel_helpers']);
  const runIt = probe.status === 0 ? test : test.skip;

  function run(code: string): string {
    const r = spawnSync(python, ['-c', code], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  }

  runIt('writes awkward names and values exactly (jsonl)', () => {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'jba-'));
    const out = nodePath.join(dir, "it's out.jsonl");
    const rows = [
      { "it's": 'owl', 'a"b': 'line1\nline2', 'back\\slash': true, n: NaN },
      { "it's": 'wren', 'a"b': "o'k", 'back\\slash': false, n: 2.5 },
    ];
    expect(run(writeOutputRows(out, rows))).toBe('ok');
    const written = fs.readFileSync(out, 'utf8').trim().split('\n').map((l: string) => JSON.parse(l));
    expect(written).toEqual([
      { "it's": 'owl', 'a"b': 'line1\nline2', 'back\\slash': true, n: null },
      { "it's": 'wren', 'a"b': "o'k", 'back\\slash': false, n: 2.5 },
    ]);
  });

  runIt('single-row helper writes a csv header + row', () => {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'jba-'));
    const out = nodePath.join(dir, 'out.csv');
    expect(run(writeOutputRow(out, { species: 'owl', count: 3 }))).toBe('ok');
    expect(fs.readFileSync(out, 'utf8').trim().split(/\r?\n/)).toEqual(['species,count', 'owl,3']);
  });

  test('passes the extension and all columns', () => {
    const code = writeOutputRows('/data/out.jsonl', [{ a: 1 }, { b: 2 }]);
    expect(code).toContain("'jsonl'");
    expect(code).toContain('write_output_rows');
    expect(code).toContain('"cols":["a","b"]');
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
