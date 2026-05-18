import { fmtTime, escPy, parseAccuracyConfig, isTruthyValue } from '../util';

describe('fmtTime', () => {
  test('zero', () => expect(fmtTime(0)).toBe('0:00.00'));
  test('simple seconds', () => expect(fmtTime(5.25)).toBe('0:05.25'));
  test('over a minute', () => expect(fmtTime(65.75)).toBe('1:05.75'));
  test('over an hour', () => expect(fmtTime(3661.5)).toBe('61:01.50'));
  test('negative', () => expect(fmtTime(-30.5)).toBe('-0:30.50'));
  test('fractional centiseconds', () => expect(fmtTime(1.099)).toBe('0:01.09'));
});

describe('escPy', () => {
  test('plain string unchanged', () => expect(escPy('hello')).toBe('hello'));
  test('escapes backslash', () => expect(escPy('a\\b')).toBe('a\\\\b'));
  test('escapes single quote', () => expect(escPy("it's")).toBe("it\\'s"));
  test('escapes newline', () => expect(escPy('a\nb')).toBe('a\\nb'));
  test('escapes carriage return', () => expect(escPy('a\rb')).toBe('a\\rb'));
  test('combined', () => expect(escPy("it's\na\\b")).toBe("it\\'s\\na\\\\b"));
});

describe('parseAccuracyConfig', () => {
  test('null returns null', () => expect(parseAccuracyConfig(null)).toBeNull());
  test('true returns null', () => expect(parseAccuracyConfig(true)).toBeNull());
  test('false returns null', () => expect(parseAccuracyConfig(false)).toBeNull());
  test('string column', () => {
    expect(parseAccuracyConfig('is_valid')).toEqual({ column: 'is_valid', value: null });
  });
  test('object with accuracy string', () => {
    expect(parseAccuracyConfig({ accuracy: 'col' })).toEqual({ column: 'col', value: null });
  });
  test('object with accuracy column+value', () => {
    expect(parseAccuracyConfig({ accuracy: { column: 'c', value: 'yes' } }))
      .toEqual({ column: 'c', value: 'yes' });
  });
  test('object with accuracy column, numeric value', () => {
    expect(parseAccuracyConfig({ accuracy: { column: 'c', value: 1 } }))
      .toEqual({ column: 'c', value: '1' });
  });
  test('empty object returns null', () => expect(parseAccuracyConfig({})).toBeNull());
  test('object without accuracy returns null', () => {
    expect(parseAccuracyConfig({ other: 'x' })).toBeNull();
  });
});

describe('isTruthyValue', () => {
  test('true', () => expect(isTruthyValue(true)).toBe(true));
  test('1', () => expect(isTruthyValue(1)).toBe(true));
  test('"yes"', () => expect(isTruthyValue('yes')).toBe(true));
  test('"valid"', () => expect(isTruthyValue('valid')).toBe(true));
  test('"true"', () => expect(isTruthyValue('true')).toBe(true));
  test('"1.0"', () => expect(isTruthyValue('1.0')).toBe(true));
  test('"is valid"', () => expect(isTruthyValue('is valid')).toBe(true));
  test('"is_true"', () => expect(isTruthyValue('is_true')).toBe(true));
  test('"is-yes"', () => expect(isTruthyValue('is-yes')).toBe(true));

  test('false', () => expect(isTruthyValue(false)).toBe(false));
  test('0', () => expect(isTruthyValue(0)).toBe(false));
  test('2', () => expect(isTruthyValue(2)).toBe(false));
  test('empty string', () => expect(isTruthyValue('')).toBe(false));
  test('null', () => expect(isTruthyValue(null)).toBe(false));
  test('undefined', () => expect(isTruthyValue(undefined)).toBe(false));
  test('"null"', () => expect(isTruthyValue('null')).toBe(false));
  test('"none"', () => expect(isTruthyValue('none')).toBe(false));
  test('"maybe"', () => expect(isTruthyValue('maybe')).toBe(false));
  test('"0"', () => expect(isTruthyValue('0')).toBe(false));
});
