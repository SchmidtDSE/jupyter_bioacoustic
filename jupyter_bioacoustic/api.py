"""
JupyterAudio — opens the bioacoustic review panel from a notebook cell.

Usage (all args):
    JupyterAudio(data=df, audio_path='test.flac', category_path='categories.csv',
                 output='observations-test.jsonl').open()

Usage (config file):
    JupyterAudio(config='config.yaml').open()

Usage (config + overrides):
    JupyterAudio(data=df, audio_path='test.flac', config='config.yaml').open()
"""

import json
import os
import uuid

from IPython import get_ipython
from IPython.display import display, Javascript, HTML

# Sentinel — distinguishes "caller passed nothing" from a real default value
_UNSET = object()


def _read_data(path: str):
    """Read a DataFrame from a file path, inferring format from extension."""
    import pandas as pd
    ext = os.path.splitext(path)[1].lower()
    if ext == '.csv':
        return pd.read_csv(path)
    elif ext == '.parquet':
        return pd.read_parquet(path)
    elif ext in ('.jsonl', '.ndjson'):
        return pd.read_json(path, lines=True)
    elif ext == '.json':
        return pd.read_json(path)
    else:
        raise ValueError(
            f"Unsupported data file extension {ext!r}. "
            f"Expected .csv, .parquet, .jsonl, or .ndjson."
        )


def _load_config(path: str) -> dict:
    """Load a JSON or YAML config file, returning a plain dict."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.json':
        with open(path) as f:
            return json.load(f) or {}
    else:
        # .yaml, .yml, or no extension — all treated as YAML
        try:
            import yaml
        except ImportError:
            raise ImportError(
                "pyyaml is required to load YAML config files: pip install pyyaml"
            )
        with open(path) as f:
            return yaml.safe_load(f) or {}


class JupyterAudio:
    def __init__(
        self,
        data=_UNSET,
        audio_path=_UNSET,
        category_path=_UNSET,
        output=_UNSET,
        prediction_column=_UNSET,
        display_columns=_UNSET,
        data_columns=_UNSET,
        form_config=_UNSET,
        inline=_UNSET,
        width=_UNSET,
        height=_UNSET,
        config=None,
    ):
        """
        Parameters
        ----------
        data : pandas.DataFrame or str, optional
            Rows with at minimum: id, start_time, end_time.
            If a string, treated as a file path; .csv, .parquet, .jsonl,
            and .ndjson are supported.
        audio_path : str, optional
            Local path or s3:// URI to the audio file.
        category_path : str, optional
            Path to categories.csv (used to populate the name dropdown).
        output : str, optional
            Path where rows are appended on Verify/Submit.
            Format is inferred from extension: .csv, .parquet, or .jsonl/.ndjson.
            Defaults to line-delimited JSON for any other/missing extension.
        prediction_column : str, optional
            Name of the column in ``data`` that holds the model's predicted
            class (e.g. ``'common_name'``).  When set, the widget operates in
            **verification mode**. When empty (default), operates in
            **annotation mode**.
        display_columns : list of str, optional
            Extra columns from ``data`` to display in the player info card.
        data_columns : list of str, optional
            Ordered list of columns to display in the clip table.
            Overrides the default column selection.
        inline : bool, optional
            If True, embed the widget below the cell instead of opening a
            split-right panel. Default False.
        width : int or str, optional
            Width of the inline widget. Integers are treated as pixels.
            Default '100%'.
        height : int or str, optional
            Height of the inline widget. Integers are treated as pixels.
            Default 900 (px).
        config : str, optional
            Path to a JSON or YAML config file (.json, .yaml, .yml; no
            extension assumes YAML). Any parameter above can be set in the
            file. Explicitly passed arguments always take precedence over
            config file values.
        """
        cfg = _load_config(config) if config else {}

        def resolve(val, key, default):
            """Return val if explicitly provided, else config value, else default."""
            if val is not _UNSET:
                return val
            if key in cfg:
                return cfg[key]
            return default

        raw_data = resolve(data, 'data', _UNSET)
        if raw_data is _UNSET:
            raise ValueError(
                "'data' is required — pass a DataFrame/path or include 'data' in config."
            )
        if isinstance(raw_data, str):
            raw_data = _read_data(raw_data)

        raw_audio = resolve(audio_path, 'audio_path', _UNSET)
        if raw_audio is _UNSET:
            raise ValueError(
                "'audio_path' is required — pass a path or include 'audio_path' in config."
            )

        self._data             = raw_data
        self._audio_path       = raw_audio
        self._category_path    = resolve(category_path,    'category_path',    '')
        self._output           = resolve(output,           'output',           '')
        self._prediction_column = resolve(prediction_column, 'prediction_column', '')
        self._display_columns  = resolve(display_columns,  'display_columns',  None) or []
        self._data_columns     = resolve(data_columns,     'data_columns',     None) or []
        raw_form = resolve(form_config, 'form_config', None)
        if isinstance(raw_form, str):
            raw_form = _load_config(raw_form)
        self._form_config = raw_form   # dict or None
        self._inline           = resolve(inline,           'inline',           False)
        self._width            = resolve(width,            'width',            '100%')
        self._height           = resolve(height,           'height',           900)

    def open(self) -> None:
        """Serialize data into kernel variables and open the review panel."""
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'JupyterAudio.open() must be called from inside a Jupyter kernel.'
            )

        ip.user_ns['_BA_DATA']           = self._data.to_json(orient='records')
        ip.user_ns['_BA_AUDIO_PATH']     = self._audio_path
        ip.user_ns['_BA_CATEGORY_PATH']  = self._category_path
        ip.user_ns['_BA_OUTPUT']         = self._output
        ip.user_ns['_BA_PREDICTION_COL'] = self._prediction_column
        ip.user_ns['_BA_DISPLAY_COLS']   = json.dumps(self._display_columns)
        ip.user_ns['_BA_DATA_COLS']      = json.dumps(self._data_columns)

        ip.user_ns['_BA_FORM_CONFIG'] = json.dumps(self._form_config)

        if self._inline:
            self._open_inline()
        else:
            display(Javascript(
                "window._bioacousticApp?.commands.execute('bioacoustic:open')"
            ))

    def _open_inline(self) -> None:
        """Inject the widget into the cell output area."""
        div_id = f'bioacoustic-{uuid.uuid4().hex[:8]}'
        w = self._width if isinstance(self._width, str) else f'{self._width}px'
        h = self._height if isinstance(self._height, str) else f'{self._height}px'

        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:{w};height:{h};'
            f'border:1px solid #313244;border-radius:6px;'
            f'overflow:hidden;position:relative;'
            f'"></div>'
        ))

        display(Javascript(
            f"window._bioacousticOpenInline && window._bioacousticOpenInline('{div_id}')"
        ))
