"""
Tests for _kernel_helpers.py

Unit tests for audio conversion, normalization, mel
filterbank, wav encoding, freq scale resolution,
output row operations, and select item loading.

License: BSD 3-Clause
"""
import base64
import csv
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from jupyter_bioacoustic._kernel_helpers import (
    _to_mono,
    _normalize_db,
    _encode_wav,
    _mel_filterbank,
    _resolve_freq_scale,
    _safe_float,
    count_output_rows,
    read_output_rows,
    write_output_row,
    delete_output_row,
    load_select_items,
    save_png,
)


#
# _to_mono
#
class TestToMono:

    def test_mono_passthrough(self):
        raw = np.ones((100, 1), dtype=np.float32)
        result = _to_mono(raw)
        assert result.ndim == 1
        assert len(result) == 100

    def test_stereo_average(self):
        left = np.ones((100, 1), dtype=np.float32) * 2.0
        right = np.ones((100, 1), dtype=np.float32) * 4.0
        raw = np.hstack([left, right])
        result = _to_mono(raw)
        assert result.ndim == 1
        np.testing.assert_allclose(result, 3.0)

    def test_already_1d(self):
        raw = np.ones((50, 1), dtype=np.float32).ravel()
        raw = raw.reshape(-1, 1)
        result = _to_mono(raw)
        assert result.ndim == 1
        assert len(result) == 50


#
# _normalize_db
#
class TestNormalizeDb:

    def test_output_range(self):
        S = np.random.rand(128, 64).astype(np.float32) + 1e-10
        result = _normalize_db(S)
        assert result.min() >= 0.0
        assert result.max() <= 1.0

    def test_zeros_no_nan(self):
        S = np.zeros((10, 10), dtype=np.float32)
        result = _normalize_db(S)
        assert not np.any(np.isnan(result))
        assert not np.any(np.isinf(result))

    def test_uniform_input(self):
        S = np.ones((10, 10), dtype=np.float32)
        result = _normalize_db(S)
        assert not np.any(np.isnan(result))


#
# _encode_wav
#
class TestEncodeWav:

    def test_returns_base64_string(self):
        mono = np.zeros(1000, dtype=np.float32)
        result = _encode_wav(mono, 22050)
        assert isinstance(result, str)
        raw = base64.b64decode(result)
        assert raw[:4] == b'RIFF'

    def test_nonzero_audio(self):
        mono = np.sin(np.linspace(0, 2 * np.pi, 22050)).astype(np.float32)
        result = _encode_wav(mono, 22050)
        raw = base64.b64decode(result)
        assert len(raw) > 100


#
# _mel_filterbank
#
class TestMelFilterbank:

    def test_output_shape(self):
        mag = np.random.rand(256, 50).astype(np.float32)
        result = _mel_filterbank(mag, 22050, 80.0, 11025.0)
        assert result.shape == (80, 50)

    def test_non_negative(self):
        mag = np.abs(np.random.randn(256, 50).astype(np.float32))
        result = _mel_filterbank(mag, 22050, 80.0, 11025.0)
        assert np.all(result >= 0)

    def test_zeros_in_zeros_out(self):
        mag = np.zeros((256, 50), dtype=np.float32)
        result = _mel_filterbank(mag, 22050, 80.0, 11025.0)
        assert result.sum() == 0.0


#
# _resolve_freq_scale
#
class TestResolveFreqScale:

    def test_string_passthrough(self):
        scale, lut = _resolve_freq_scale('linear', 0.0, 11025.0)
        assert scale == 'linear'
        assert lut is None

    def test_mel_string(self):
        scale, lut = _resolve_freq_scale('mel', 80.0, 11025.0)
        assert scale == 'mel'
        assert lut is None

    def test_callable_returns_lut(self):
        def custom_scale(f, f_min, f_max):
            return (f - f_min) / (f_max - f_min)

        scale, lut = _resolve_freq_scale(custom_scale, 0.0, 11025.0)
        assert scale == 'lut'
        assert isinstance(lut, list)
        assert len(lut) == 256
        assert lut[0] == pytest.approx(0.0)
        assert lut[-1] == pytest.approx(1.0)


#
# _safe_float
#
class TestSafeFloat:

    def test_numeric_string(self):
        assert _safe_float('3.14') == pytest.approx(3.14)

    def test_integer_string(self):
        assert _safe_float('42') == 42.0

    def test_none_returns_nan(self):
        import math
        assert math.isnan(_safe_float(None))

    def test_non_numeric_string_returns_nan(self):
        import math
        assert math.isnan(_safe_float('brookie'))

    def test_empty_string_returns_nan(self):
        import math
        assert math.isnan(_safe_float(''))

    def test_custom_default(self):
        assert _safe_float('bad', default=0.0) == 0.0

    def test_float_passthrough(self):
        assert _safe_float(2.5) == 2.5

    def test_int_passthrough(self):
        assert _safe_float(7) == 7.0


#
# count_output_rows / read_output_rows
#
class TestOutputRowsCsv:

    def _write_csv(self, path, rows):
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader()
            w.writerows(rows)

    def test_count_csv(self, tmp_path):
        p = str(tmp_path / 'out.csv')
        self._write_csv(p, [{'a': '1', 'b': '2'}, {'a': '3', 'b': '4'}])
        result = json.loads(count_output_rows(p, 'csv'))
        assert result['count'] == 2

    def test_count_missing_file(self, tmp_path):
        result = json.loads(count_output_rows(str(tmp_path / 'nope.csv'), 'csv'))
        assert result['count'] == 0

    def test_read_csv(self, tmp_path):
        p = str(tmp_path / 'out.csv')
        self._write_csv(p, [{'x': '10', 'y': '20'}])
        result = json.loads(read_output_rows(p, 'csv'))
        assert len(result) == 1
        assert result[0]['x'] == '10'

    def test_read_missing_file(self, tmp_path):
        result = json.loads(read_output_rows(str(tmp_path / 'nope.csv'), 'csv'))
        assert result == []


class TestOutputRowsJsonl:

    def test_count_jsonl(self, tmp_path):
        p = str(tmp_path / 'out.jsonl')
        with open(p, 'w') as f:
            f.write(json.dumps({'a': 1}) + '\n')
            f.write(json.dumps({'a': 2}) + '\n')
        result = json.loads(count_output_rows(p, 'jsonl'))
        assert result['count'] == 2

    def test_read_jsonl(self, tmp_path):
        p = str(tmp_path / 'out.jsonl')
        with open(p, 'w') as f:
            f.write(json.dumps({'k': 'v'}) + '\n')
        result = json.loads(read_output_rows(p, 'jsonl'))
        assert result == [{'k': 'v'}]


#
# write_output_row
#
class TestWriteOutputRow:

    def test_write_csv_creates_file(self, tmp_path):
        p = str(tmp_path / 'new.csv')
        result = write_output_row(p, {'a': '1', 'b': '2'}, ['a', 'b'], 'csv')
        assert result == 'ok'
        with open(p) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]['a'] == '1'

    def test_write_csv_appends(self, tmp_path):
        p = str(tmp_path / 'app.csv')
        write_output_row(p, {'x': '1'}, ['x'], 'csv')
        write_output_row(p, {'x': '2'}, ['x'], 'csv')
        with open(p) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 2

    def test_write_jsonl(self, tmp_path):
        p = str(tmp_path / 'out.jsonl')
        write_output_row(p, {'k': 'v'}, ['k'], 'jsonl')
        with open(p) as f:
            data = [json.loads(line) for line in f if line.strip()]
        assert data == [{'k': 'v'}]

    def test_write_creates_parent_dirs(self, tmp_path):
        p = str(tmp_path / 'sub' / 'dir' / 'out.csv')
        write_output_row(p, {'a': '1'}, ['a'], 'csv')
        assert os.path.exists(p)

    def test_write_csv_preserves_existing_column_order(self, tmp_path):
        p = str(tmp_path / 'order.csv')
        write_output_row(
            p,
            {'name': 'owl', 'start': '1.0', 'end': '2.0', 'user': 'alice'},
            ['name', 'start', 'end', 'user'],
            'csv',
        )
        write_output_row(
            p,
            {'name': 'hawk', 'user': 'bob', 'start': '3.0', 'end': '4.0'},
            ['name', 'user', 'start', 'end'],
            'csv',
        )
        with open(p) as f:
            reader = csv.reader(f)
            header = next(reader)
            row1 = next(reader)
            row2 = next(reader)
        assert header == ['name', 'start', 'end', 'user']
        assert row1 == ['owl', '1.0', '2.0', 'alice']
        assert row2 == ['hawk', '3.0', '4.0', 'bob']


#
# delete_output_row
#
class TestDeleteOutputRow:

    def test_delete_csv_row(self, tmp_path):
        p = str(tmp_path / 'del.csv')
        write_output_row(p, {'id': '1', 'val': 'a'}, ['id', 'val'], 'csv')
        write_output_row(p, {'id': '2', 'val': 'b'}, ['id', 'val'], 'csv')
        delete_output_row(p, lambda r: r['id'] == '1', 'csv')
        with open(p) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]['id'] == '2'

    def test_delete_jsonl_row(self, tmp_path):
        p = str(tmp_path / 'del.jsonl')
        write_output_row(p, {'id': 1}, ['id'], 'jsonl')
        write_output_row(p, {'id': 2}, ['id'], 'jsonl')
        delete_output_row(p, lambda r: r['id'] == 1, 'jsonl')
        with open(p) as f:
            rows = [json.loads(line) for line in f if line.strip()]
        assert len(rows) == 1
        assert rows[0]['id'] == 2

    def test_delete_csv_with_non_numeric_values(self, tmp_path):
        p = str(tmp_path / 'mixed.csv')
        write_output_row(
            p, {'start_time': '10.5', 'end_time': '15.0', 'name': 'brookie'},
            ['start_time', 'end_time', 'name'], 'csv',
        )
        write_output_row(
            p, {'start_time': '20.0', 'end_time': '25.0', 'name': 'owl'},
            ['start_time', 'end_time', 'name'], 'csv',
        )
        delete_output_row(
            p,
            lambda r: (
                abs(_safe_float(r.get('start_time')) - 10.5) < 0.01
                and abs(_safe_float(r.get('end_time')) - 15.0) < 0.01
            ),
            'csv',
        )
        with open(p) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]['name'] == 'owl'

    def test_delete_csv_safe_float_skips_non_numeric_rows(self, tmp_path):
        p = str(tmp_path / 'bad.csv')
        write_output_row(
            p, {'start_time': 'brookie', 'end_time': 'owl', 'val': 'x'},
            ['start_time', 'end_time', 'val'], 'csv',
        )
        write_output_row(
            p, {'start_time': '10.5', 'end_time': '15.0', 'val': 'y'},
            ['start_time', 'end_time', 'val'], 'csv',
        )
        delete_output_row(
            p,
            lambda r: (
                abs(_safe_float(r.get('start_time')) - 10.5) < 0.01
                and abs(_safe_float(r.get('end_time')) - 15.0) < 0.01
            ),
            'csv',
        )
        with open(p) as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]['val'] == 'x'


#
# save_png
#
class TestSavePng:

    def test_writes_decoded_data(self, tmp_path):
        data = b'\x89PNG\r\n\x1a\nfake_png_data'
        b64 = base64.b64encode(data).decode()
        p = str(tmp_path / 'test.png')
        result = save_png(p, b64)
        assert result == 'ok'
        with open(p, 'rb') as f:
            assert f.read() == data

    def test_creates_parent_dirs(self, tmp_path):
        data = b'test'
        b64 = base64.b64encode(data).decode()
        p = str(tmp_path / 'sub' / 'img.png')
        save_png(p, b64)
        assert os.path.exists(p)


#
# load_select_items — CSV
#
class TestLoadSelectCsv:

    def test_with_columns(self, tmp_path):
        p = str(tmp_path / 'items.csv')
        with open(p, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['code', 'name'])
            w.writeheader()
            w.writerow({'code': 'A', 'name': 'Alpha'})
            w.writerow({'code': 'B', 'name': 'Beta'})
        result = json.loads(load_select_items(p, value_col='code', label_col='name'))
        assert result == [['A', 'Alpha'], ['B', 'Beta']]

    def test_without_columns(self, tmp_path):
        p = str(tmp_path / 'items.csv')
        with open(p, 'w') as f:
            f.write('val1,label1\nval2,label2\n')
        result = json.loads(load_select_items(p))
        assert result == [['val1', 'label1'], ['val2', 'label2']]


#
# load_select_items — JSONL
#
class TestLoadSelectJsonl:

    def test_with_columns(self, tmp_path):
        p = str(tmp_path / 'items.jsonl')
        with open(p, 'w') as f:
            f.write(json.dumps({'id': 1, 'label': 'One'}) + '\n')
            f.write(json.dumps({'id': 2, 'label': 'Two'}) + '\n')
        result = json.loads(load_select_items(p, value_col='id', label_col='label'))
        assert result == [['1', 'One'], ['2', 'Two']]


#
# load_select_items — YAML
#
class TestLoadSelectYaml:

    def test_list_yaml(self, tmp_path):
        p = str(tmp_path / 'items.yaml')
        import yaml
        with open(p, 'w') as f:
            yaml.dump(['alpha', 'beta', 'gamma'], f)
        result = json.loads(load_select_items(p))
        assert result == [['alpha', 'alpha'], ['beta', 'beta'], ['gamma', 'gamma']]


#
# load_select_items — text
#
class TestLoadSelectText:

    def test_simple_lines(self, tmp_path):
        p = str(tmp_path / 'items.txt')
        with open(p, 'w') as f:
            f.write('apple\nbanana\n')
        result = json.loads(load_select_items(p))
        assert result == [['apple', 'apple'], ['banana', 'banana']]

    def test_comma_separated(self, tmp_path):
        p = str(tmp_path / 'items.txt')
        with open(p, 'w') as f:
            f.write('a,Alpha\nb,Beta\n')
        result = json.loads(load_select_items(p))
        assert result == [['a', 'Alpha'], ['b', 'Beta']]
