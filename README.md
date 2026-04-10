# JupyterBioacoustic

A jupyter plugin that allows users to validate bioacoustic models in the jupyterlab environment.



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
