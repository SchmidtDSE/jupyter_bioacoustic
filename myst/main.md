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

# APP

![](#embed_app)

## FIG

:::{figure} #embed_app
:label: fig-my-cell
:placeholder: ../assets/app-annotate.png

:::

---


```{embed} #embed_test1
:remove-output: false
:remove-input: false
```

```{code-cell} python
:label: codecell
:caption: Boom

print("Hello world!")
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



