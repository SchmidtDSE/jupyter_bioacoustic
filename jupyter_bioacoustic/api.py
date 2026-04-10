"""
JupyterAudio — opens the bioacoustic review panel from a notebook cell.

Usage:
    from jupyter_bioacoustic import JupyterAudio
    import pandas as pd

    df = pd.read_csv('detections-test.csv')
    JupyterAudio(
        data=df,
        audio_path='test.flac',
        category_path='categories.csv',
        output='observations-test.csv',
    ).open()
"""

from IPython import get_ipython
from IPython.display import display, Javascript


class JupyterAudio:
    def __init__(self, data, audio_path: str, category_path: str = '', output: str = ''):
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
        """
        self._data = data
        self._audio_path = audio_path
        self._category_path = category_path
        self._output = output

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

        # Trigger the JupyterLab command registered by the plugin
        display(Javascript(
            "window._bioacousticApp?.commands.execute('bioacoustic:open')"
        ))
