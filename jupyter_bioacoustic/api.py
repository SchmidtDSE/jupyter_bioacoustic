"""
JupyterAudio — opens the bioacoustic review panel from a notebook cell.

Usage (tab/panel — default):
    JupyterAudio(data=df, audio_path='test.flac', category_path='categories.csv',
                 output='observations-test.jsonl').open()

Usage (inline below cell):
    JupyterAudio(data=df, audio_path='test.flac', category_path='categories.csv',
                 output='observations-test.jsonl', inline=True, height=900).open()
"""

import json
import os
import uuid

from IPython import get_ipython
from IPython.display import display, Javascript, HTML


def _read_data(path: str):
    """Read a DataFrame from path, inferring format from extension."""
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


class JupyterAudio:
    def __init__(
        self,
        data,
        audio_path: str,
        category_path: str = '',
        output: str = '',
        prediction_column: str = '',
        display_columns: 'list[str] | None' = None,
        data_columns: 'list[str] | None' = None,
        inline: bool = False,
        width: 'int | str' = '100%',
        height: 'int | str' = 900,
    ):
        """
        Parameters
        ----------
        data : pandas.DataFrame or str
            Rows with at minimum: id, start_time, end_time.
            If a string, treated as a file path; .csv, .parquet, .jsonl,
            and .ndjson are supported.
        audio_path : str
            Local path or s3:// URI to the audio file.
        category_path : str
            Path to categories.csv (used to populate the name dropdown).
        output : str
            Path where rows are appended on Verify/Submit.
            Format is inferred from the extension: .csv, .parquet, or .jsonl/.ndjson.
            Defaults to line-delimited JSON (jsonl) for any other extension.
        prediction_column : str
            Name of the column in ``data`` that holds the model's predicted
            class (e.g. ``'common_name'``).  When set, the widget operates in
            **verification mode**: the predicted class is displayed in the
            player and the form asks is_valid / verified name / confidence.
            When empty (default), the widget operates in **annotation mode**:
            the form asks for start_time / class / confidence / notes.
        display_columns : list of str, optional
            Extra columns from ``data`` to display in the player info card.
        data_columns : list of str, optional
            Ordered list of columns from ``data`` to display in the clip table.
            When set, overrides the default column selection.
        inline : bool
            If True, embed the widget below the cell instead of opening a
            split-right panel. Default False.
        width : int or str
            Width of the inline widget. Integers are treated as pixels.
            Strings are used as-is (e.g. '100%', '800px'). Default '100%'.
        height : int or str
            Height of the inline widget. Integers are treated as pixels.
            Strings are used as-is. Default 900 (px).
        """
        if isinstance(data, str):
            data = _read_data(data)
        self._data = data
        self._audio_path = audio_path
        self._category_path = category_path
        self._output = output
        self._prediction_column = prediction_column
        self._display_columns = display_columns or []
        self._data_columns = data_columns or []
        self._inline = inline
        self._width = width
        self._height = height

    def open(self) -> None:
        """Serialize data into kernel variables and open the review panel."""
        ip = get_ipython()
        if ip is None:
            raise RuntimeError(
                'JupyterAudio.open() must be called from inside a Jupyter kernel.'
            )

        # Store everything the TypeScript widget will read
        ip.user_ns['_BA_DATA'] = self._data.to_json(orient='records')
        ip.user_ns['_BA_AUDIO_PATH'] = self._audio_path
        ip.user_ns['_BA_CATEGORY_PATH'] = self._category_path
        ip.user_ns['_BA_OUTPUT'] = self._output
        ip.user_ns['_BA_PREDICTION_COL'] = self._prediction_column
        ip.user_ns['_BA_DISPLAY_COLS'] = json.dumps(self._display_columns)
        ip.user_ns['_BA_DATA_COLS'] = json.dumps(self._data_columns)

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

        # Create the container div in cell output
        display(HTML(
            f'<div id="{div_id}" style="'
            f'width:{w};height:{h};'
            f'border:1px solid #313244;border-radius:6px;'
            f'overflow:hidden;position:relative;'
            f'"></div>'
        ))

        # Ask the plugin to attach a widget instance to that div
        display(Javascript(
            f"window._bioacousticOpenInline && window._bioacousticOpenInline('{div_id}')"
        ))
