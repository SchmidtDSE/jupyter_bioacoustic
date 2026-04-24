(intro)=
# Introduction

![JupyterBioacoustic Plugin](../../assets/app-review.png)

Bioacoustic monitoring allows scientists to perform a number of important tasks including the tracking species presence and population, as well as migration patterns. There are hundreds of monitoring stations in California alone, producing 100+ TB of data annually.

AI models such as [BirdNET](https://birdnet.cornell.edu/), [Perch](https://github.com/google-research/perch) and [PNW-Owl](https://www.sciencedirect.com/science/article/pii/S2352711023001693) allow scientist to process large amounts of data.  To do so however, they must first annotate the data for training, and then validate the results of the model runs.

JupyterBioacoustic [BioacousticAnnotator](https://github.com/SchmidtDSE/dev-jupyter-audio) is a robust, flexible, easily configured tool that allows users to annotate and review bioacoustic data directly within a Jupyter Notebook.

There are many other annotation tools available (see below), each with its various strengths and weaknesses.  `BioacousticAnnotator` attempts to handle all use cases, without introducing complexity.  Perhaps its biggest strength is that it is run directly within the JupyterLab environment.

**WHY JUPYTER LAB**
A standard bioacoustic workflow is as follows:

1. Data annotation 
2. Organization and/or processing of annotated data
3. Model Training
4. Interim Model Validation
5. Full Model Run
6. Final Model Validation
7. The production of datasets with the model results, as well as charts and figures explaining the outputs
8. The release of papers and/or applications 

While the majority these steps are managed within a python environment, often in jupyter-lab, the annotation and validation steps (1, 4 and 6), are usually handled with outside tools.  `BioacousticAnnotator` allows one to work in single environment - making the process easier, more reproducible.



## Features

- Read data from CSV, Parquet, SQL (DuckDB), or API endpoints
- Load audio from local files, S3 URIs (partial byte-range downloads), or HTTPS URLs
- Configure forms with selects, textboxes, checkboxes, and conditional sections
- Write results incrementally to CSV, Parquet, or JSONL
- Track progress with duplicate prevention and session counts
- Built-in and custom visualizations with interactive zoom, pan, and configurable resolution
- Capture spectrogram PNGs for reports

## Getting Started

Install from a pre-built wheel — no Node.js or build step needed:

```bash
pip install jupyter_bioacoustic-0.1.8-py3-none-any.whl
```

Open the widget in three lines:

```python
from jupyter_bioacoustic import BioacousticAnnotator

BioacousticAnnotator(data='detections.csv', audio='recording.flac').open()
```
