import { readKernelVars, readAudio, buildSpectrogram } from '../python';
import { extractJson, ensureSetup, updateSection, listFiles, checkFileExists } from '../config_builder/python';

describe('readKernelVars', () => {
  const code = readKernelVars();

  test('contains import json', () => {
    expect(code).toContain('import json');
  });

  test('contains expected variables', () => {
    for (const v of ['_BA_DATA', '_BA_AUDIO', '_BA_OUTPUT', '_BA_FORM_CONFIG',
                      '_BA_CAPTURE', '_BA_CAPTURE_HEIGHT', '_BA_SPEC_RESOLUTIONS']) {
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
