---
title: Jupyter Bioacoustic
subtitle: JupyterLab tools for annotating and reviewing bioacoustic data
abstract: |
    Browse a table of audio clips, play each one with a spectrogram, and optionally record
    verification decisions or annotations — all without leaving the notebook. The form layout
    is fully configurable via YAML; without a form config the widget is a pure visualizer/player.
keywords:
    - bioacoustic monitoring
    - jupyterlab
    - spectrogram
    - annotation
---

Code Repository: https://github.com/SchmidtDSE/dev-jupyter-audio \
API Documentation: https://github.com/SchmidtDSE/dev-jupyter-audio/wiki \
Demo: https://github.com/SchmidtDSE/dev-jupyter-audio-demo

---



```{include} sections/intro.md
```

---

### MSTMD EMBED EXAMPLES

This uses a config file to manage a more advanced configuration


```{embed} nb:simple-examples.3a.parameters
:remove-output: true
:remove-input: false
```

This is the configuration file

```{literalinclude} ../demo/config/simple-examples-3c.yaml
:language: yaml
```    


### OUTLINE

- Intro
    - why bioacoustic annotate/review 
    - other tools
    - bounce
    - advantages of nb env: a common request - how many x.  why hard? lets make it easy

- Overview 

    - 1 Class
    - 2 Methods
    - 1 Property

    - Examples (no config)
        - intro Class has all these params see here, and is best configurable through files  here we'll look at the simplest example
        * IN EXAMPLES READ FROM DF, FILE, REMOTE FILE
        - player
        - annotator
        - reviewer

    - Config files
        - note the config and signature are the same!
        - config for annotator above
        - data
        - audio
        - form



