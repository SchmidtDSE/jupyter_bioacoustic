"""
JupyterAudio — opens the bioacoustic review panel from a notebook cell.

Usage (tab/panel — default):
    JupyterAudio(data=df, audio_path='test.flac', category_path='categories.csv',
                 output='observations-test.csv').open()

Usage (inline below cell):
    JupyterAudio(data=df, audio_path='test.flac', category_path='categories.csv',
                 output='observations-test.csv', inline=True, height=900).open()
"""

import uuid

from IPython import get_ipython
from IPython.display import display, Javascript, HTML


class JupyterAudio:
    def __init__(
        self,
        data,
        audio_path: str,
        category_path: str = '',
        output: str = '',
        inline: bool = False,
        width: 'int | str' = '100%',
        height: 'int | str' = 900,
    ):
        """
        Parameters
        ----------
        data : pandas.DataFrame
            Detection rows with columns: id, common_name, scientific_name,
            confidence, rank, start_time, end_time.
        audio_path : str
            Local path or s3:// URI to the audio file.
        category_path : str
            Path to categories.csv (used to populate the verified-name dropdown).
        output : str
            Path to the output CSV where observations are appended on Verify.
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
        self._data = data
        self._audio_path = audio_path
        self._category_path = category_path
        self._output = output
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
