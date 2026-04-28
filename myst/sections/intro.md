(intro)=

# Introduction

```{figure} ../assets/app/bae_1-multibox.png
:class: bordered
```

Bioacoustic monitoring allows scientists to track species presence, population dynamics, and migration patterns. Hundreds of monitoring stations across California alone produce over 100 TB[TODO: WHAT IS A GOOD NUMBER HERE] of audio data annually.

AI models such as [BirdNET](https://birdnet.cornell.edu/), [Perch](https://github.com/google-research/perch), and [PNW-Owl](https://www.sciencedirect.com/science/article/pii/S2352711023001693) can process large volumes of this data — but they require annotated training data, and their outputs need human validation.

[BioacousticAnnotator](https://github.com/SchmidtDSE/jupyter_bioacoustic) is a flexible, easy to configure JupyterLab extension for annotating and reviewing bioacoustic data directly within a notebook. It handles the full annotation-validation loop without leaving the computational environment where the data-processing, model training, and analysis live.

**Why JupyterLab?** A typical bioacoustic workflow includes data annotation, model training, validation, production runs, and reporting. Most of these steps happen in Python, often in JupyterLab, but annotation and validation are usually handled with external tools. `BioacousticAnnotator` brings these steps into the same environment, making the process simpler and more reproducible.


## Features

- **Player / Visualizer** — browse audio clips with interactive spectrograms (plain, mel, log-frequency, or custom)
- **Configurable forms** — YAML-driven annotation and review forms with selects, textboxes, checkboxes, and conditional sections
- **Annotation tools** — time markers, start/end lines, bounding boxes, and multibox (multiple labeled regions per clip)
- **Custom visualizations** — integrate third-party libraries (OpenSoundscape, librosa, SciPy) or write your own
- **Zoom and capture** — keyboard/mouse zoom, drag-to-pan, zoom-to-selection box, and PNG export
- **Flexible data sources** — CSV, Parquet, SQL (DuckDB), API endpoints, S3 byte-range reads


## Getting Started

Install from a pre-built wheel:

```bash
pip install jupyter_bioacoustic-0.1.8-py3-none-any.whl
```

Open the widget in three lines:

```python
from jupyter_bioacoustic import BioacousticAnnotator

BioacousticAnnotator(data='detections.csv', audio='recording.flac').open()
```


## Table of Contents

- [Overview](overview) — API, interface walkthrough
- [Examples](examples) — player, annotator, reviewer, custom visualizations
- [Parameters & Configuration](params) — data, audio, forms reference
- [Form Examples](form-examples) — progressive form complexity
