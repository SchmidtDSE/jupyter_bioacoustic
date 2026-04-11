# JupyterBioacoustic

A jupyter plugin that allows users to validate bioacoustic models in the jupyterlab environment.

![JupyterBioacoustic Plugin](assets/screenshot.png)

## TODO

- [ ] generate (realtime) reports
- [ ] avoid double verification
- [ ] reload pause btn to pause

---

# Quick Start

## Setup

From the `jupyter_bioacoustic/` directory:

```bash
pixi run setup   # install deps, build TS, register extension
pixi run lab     # launch JupyterLab
```

> After any TypeScript change: `pixi run build` then hard-refresh the browser.

## TEST DATA

Dummy files for testing can be found on S3:

- audio_file: [test.flac](https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/test.flac)
- categories_file: [categories.csv](https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/categories.csv)
- src_file: [detections-test.csv](https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/detections-test.csv)


```bash
# from working folder
curl https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/test.flac
curl https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/categories.csv
curl https://dse-soundhub.s3.us-west-2.amazonaws.com/public/jupyter_bioacoustic/test_files/detections-test.csv
```

## Notebook usage

```python
import pandas as pd
from jupyter_bioacoustic import JupyterAudio

df = pd.read_csv('detections-test.csv')

JupyterAudio(
    data=df,
    audio_path='/path/to/audio.flac',   # local path or s3://bucket/key
    category_path='categories.csv',      # populates the verified-name dropdown
    output='observations-test.csv',      # rows appended here on Verify
).open()
```

This opens the Bioacoustic Reviewer panel in a split-right view alongside your notebook. You can also open it from the command palette: **Bioacoustic → Open Bioacoustic Reviewer**.

## What the panel does

| Section | What you can do |
|---|---|
| **Filter bar** | Expression-based filtering — `common_name = 'Barred owl' and confidence >= 0.5` |
| **Detection table** | Sort by any column, paginate (5 / 10 / 20 / custom rows), click a row to select it |
| **Info card** | Shows selected row's name, time range, confidence, rank — use Prev / Next to step through |
| **Spectrogram player** | Mel spectrogram with buffer overlay, play/pause, click to seek |
| **Verification form** | Mark `is_valid`, add notes, set signal start time; if invalid choose a corrected class and confidence |
| **Skip / Verify** | Skip moves to the next row; Verify writes a row to `output` CSV and advances |

## Test data

Generate a fresh 25-row synthetic detections file:

```bash
pixi run generate-data
```

---

# Motivation
 
Using JupyterGIS as a guide its interesting how we might work with bioacoustic data in Jupyterlab.  It could be an ecosystem like JupyterGIS but it could also be a (or a suite of) jupyter plugin(s).

JupyterGIS's foundation is/will be:

* A schema/set of rules for JSON objects that define what layers exist, the data and data sources being displayed.
* Code that:
    * Translates JSON data into visual display.
    * Allows for two-way communication between cells:
        * Map layers can be translated to Python objects for calculation.
        * Python objects can be translated to map layers.
    * Computes GIS operations (merge / convex hull / simplify / ...).
    * A pipe for real-time collaboration.
    * A way to turn map interactions into reproducible code.

## JupyterBioacoustic/Audio/Something (name-to-be-changed)

JupyterAudio would overlap on many of these points, replacing maps with audio tools. If it grew into a full-fledged product it could probably start as a (or suite of interactive) Jupyter plugin(s).

A schema could be used for easy configuration but one could imagine it’s also possible to configure directly with parameters. Two way communication would be necessary between cells. The number of operations would be much smaller than needed for GIS – mainly various spectrogram generation but maybe others. Real time collaboration is probably not necessary. The reproducible code is probably not necessary but I need to think more.

Thoughts for an initial product:

1. An interactive (dataframe-like) display that allows you to easily filter, order, search data, and select a row that points to an audio source and start time or bounding box.
2. An interface that (for the selected data):
    * Displays spectrograms of various (selectable) flavors.
    * Plays the audio.
    * Shows the predicted class (if predictions exist).
    * Allows the user to verify if it was the correct class, select a new class, add notes, adjust start/end times and/or bounding box, etc..
    * Writes the user data to a new dataset (connected to the original dataset by an ID column).
    * Note: this is probably really similar to the tool Amy is using now for annotation (I think [https://mbsantiago.github.io/whombat/](https://mbsantiago.github.io/whombat/)). The use case described above is for verification but it could be used for annotation too.
3. A set of "reporting/status" tools that display charts and graphs of various sorts, both on the original dataset and the verified dataset:
    * Class distribution of original or verified data.
    * Stats on confidence of predictions.
    * Progress reports on how many have been classified — running accuracy of verified data.
    * ....
4. If the dataset has geographic information — be it points or districts/regions, etc. — we could also have an interactive map that allows us to select data within regions, or display stats (as described in section 3 above) for selected regions.
