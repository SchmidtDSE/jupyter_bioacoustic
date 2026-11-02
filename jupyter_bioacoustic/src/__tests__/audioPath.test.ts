/**
 * Audio path resolution (audioPath): fixed path / URL, per-row column with fallback,
 * prefix / suffix joining.
 *
 * License: BSD 3-Clause
 */
import { applyPrefixSuffix, resolveAudioPath } from '../sections/audioPath';
import { AudioConfig } from '../types';

const cfg = (over: Partial<AudioConfig>): AudioConfig =>
  ({ type: 'path', value: '', prefix: '', suffix: '', fallback: '', ...over });
const row = (over: Record<string, any> = {}) => ({ start_time: 0, end_time: 1, ...over });

describe('applyPrefixSuffix', () => {
  it('leaves the path alone without prefix / suffix', () => {
    expect(applyPrefixSuffix('a/b.wav', cfg({}))).toBe('a/b.wav');
  });

  it('joins local paths with /', () => {
    expect(applyPrefixSuffix('b.wav', cfg({ prefix: '/data' }))).toBe('/data/b.wav');
    expect(applyPrefixSuffix('dir', cfg({ suffix: 'x.wav' }))).toBe('dir/x.wav');
  });

  it('puts the prefix after a URL scheme', () => {
    expect(applyPrefixSuffix('s3://bucket/k.wav', cfg({ prefix: 'p' }))).toBe('s3://p/bucket/k.wav');
    expect(applyPrefixSuffix('https://h/k', cfg({ type: 'url', suffix: 's' }))).toBe('https://h/k/s');
  });
});

describe('resolveAudioPath', () => {
  it('uses the configured path', () => {
    expect(resolveAudioPath(cfg({ value: '/a.wav' }), row())).toBe('/a.wav');
  });

  it('reads a column, with prefix', () => {
    const c = cfg({ type: 'column', value: 'file', prefix: '/audio' });
    expect(resolveAudioPath(c, row({ file: 'x.flac' }))).toBe('/audio/x.flac');
  });

  it('falls back (without prefix) for an empty cell or no row', () => {
    const c = cfg({ type: 'column', value: 'file', prefix: '/audio', fallback: '/fb.wav' });
    expect(resolveAudioPath(c, row({ file: '  ' }))).toBe('/fb.wav');
    expect(resolveAudioPath(c, null)).toBe('/fb.wav');
    expect(resolveAudioPath(cfg({ type: 'column', value: 'file' }), row())).toBe('');
  });
});
