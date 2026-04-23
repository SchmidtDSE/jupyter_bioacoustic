(intro)=
# Introduction

![JupyterBioacoustic Plugin](../../assets/app-review.png)

## Why?

Bioacoustic monitoring generates enormous volumes of audio. Automated classifiers like BirdNET can process this at scale, but their outputs still need human review — was that really a Barred Owl at 3 AM, or just wind? Researchers also need to annotate training data, label new species, and validate field recordings before analysis.

These tasks share a common pattern: browse a table of audio segments, listen to each one, look at its spectrogram, and record a decision. Existing tools typically require switching between applications, managing files manually, and writing glue code to connect the pieces.

## What is JupyterBioacoustic?

JupyterBioacoustic is a JupyterLab plugin that keeps the entire review loop inside the computational environment where the analysis lives. It pairs a sortable, filterable clip table with an interactive spectrogram player and a configurable annotation form — all within the notebook.

The same interface works for **collecting new data** (species labeling, time-frequency annotation) and for **reviewing existing results** (validating model predictions, quality-checking automated detections). The form layout is driven by YAML configuration, so switching between workflows requires no code changes.

## Key Capabilities

- Read data from CSV, Parquet, SQL (DuckDB), or API endpoints
- Load audio from local files, S3 URIs (partial byte-range downloads), or HTTPS URLs
- Configure forms with selects, textboxes, checkboxes, and conditional sections
- Write results incrementally to CSV, Parquet, or JSONL
- Track progress with duplicate prevention and session counts
- Capture spectrogram PNGs for reports

## Getting Started

Install from a pre-built wheel — no Node.js or build step needed:

```bash
pip install jupyter_bioacoustic-0.1.8-py3-none-any.whl
```

Open the widget in three lines:

```python
from jupyter_bioacoustic import JupyterAudio

JupyterAudio(data='detections.csv', audio='recording.flac').open()
```
