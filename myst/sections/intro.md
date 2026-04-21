(intro)=
# Introduction

![JupyterBioacoustic Plugin](../../assets/app-review.png)

JupyterBioacoustic is a JupyterLab plugin for reviewing and annotating bioacoustic audio clips directly within a notebook environment. It pairs a sortable, filterable clip table with an interactive spectrogram player and a fully configurable annotation form — so researchers can browse model detections, listen to audio segments, inspect spectrograms, and record verification decisions or corrections without switching tools.

The plugin is designed to slot into existing bioacoustic workflows with minimal friction. It reads data from CSV, Parquet, SQL (via DuckDB), or API endpoints, and supports per-row audio files sourced from local paths, S3 URIs (with partial byte-range downloads for multi-hour recordings), or HTTPS URLs. Reviewed results are written incrementally to CSV, Parquet, or line-delimited JSON, with built-in duplicate prevention and progress tracking. For teams working across notebooks — whether validating BirdNET detections, labeling training data, or auditing automated classifiers — JupyterBioacoustic keeps the entire review loop inside the computational environment where the analysis lives.

## Getting Started

Install from a pre-built wheel:

```bash
pip install jupyter_bioacoustic-0.1.8-py3-none-any.whl
```

Open the widget in three lines:

```python
from jupyter_bioacoustic import JupyterAudio

JupyterAudio(data='detections.csv', audio='recording.flac').open()
```

That's it — you get a clip table, spectrogram player, and audio playback with no additional configuration. Add a `form_config` to enable review or annotation workflows.
