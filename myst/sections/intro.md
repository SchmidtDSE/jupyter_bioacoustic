(intro)=

# Introduction


Bioacoustic monitoring allows scientists to track species presence, population dynamics, and migration patterns. Hundreds of monitoring stations across California alone produce over 100 TB[TODO: WHAT IS A GOOD NUMBER HERE] of audio data annually.

AI models such as [BirdNET](https://birdnet.cornell.edu/), [Perch](https://github.com/google-research/perch), and [PNW-Owl](https://www.sciencedirect.com/science/article/pii/S2352711023001693) can process large volumes of this data — but they require annotated training data, and their outputs need human validation.

[BioacousticAnnotator](https://github.com/SchmidtDSE/jupyter_bioacoustic) is a flexible, easy to configure JupyterLab extension for annotating and reviewing bioacoustic data directly within a notebook. It handles the full annotation-validation loop without leaving the computational environment where the data-processing, model training, and analysis live.

```python
from jupyter_bioacoustic import BioacousticAnnotator

BioacousticAnnotator(data='detections.csv', audio='recording.flac').open()
```

```{figure} ../assets/app/bae_1-multibox.png
:class: bordered
```

**Why JupyterLab?** A typical bioacoustic workflow includes data annotation, model training, validation, production runs, and reporting. Most of these steps happen in Python, often in JupyterLab, but annotation and validation are usually handled with external tools. `BioacousticAnnotator` brings these steps into the same environment, making the process simpler and more reproducible.


## Features

- **Player / Visualizer** — browse audio clips with interactive spectrograms and other visualizations (linear, mel, log-frequency, or custom)
- **Configurable forms** — YAML-driven annotation and review forms with selects, textboxes, checkboxes, and conditional sections
- **Annotation tools** — time markers, start/end lines, bounding boxes, and multibox (multiple labeled regions per clip)
- **Custom visualizations** — integrate third-party libraries (OpenSoundscape, librosa, SciPy) or write your own
- **Zoom and capture** — keyboard/mouse zoom, drag-to-pan, zoom-to-selection box, and PNG export
- **Flexible data sources** — CSV, Parquet, SQL (DuckDB), API endpoints, S3 byte-range reads


## Table of Contents

- [Overview](overview) — API, interface walkthrough
- [Examples](examples)
- [Visualizations](visualizations)
