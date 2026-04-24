(examples)=
# Examples

## Player / Visualizer

No form, no data collection — just browse clips and view spectrograms.

```{embed} myst:ex-player
:remove-output: true
```

![TODO: SCREENSHOT OF PLAYER](../../assets/app-inline.png)


## Annotation (parameters)

Add a `form_config` to collect data for each clip. Here the form presents a species dropdown populated from a categories file — all configured inline as Python dicts.

```{embed} myst:ex-annotate-params
:remove-output: true
```

![TODO: SCREENSHOT OF ANNOTATOR](../../assets/form-annotate.png)


## Annotation (config file)

The same result using a YAML config file. This separates the form layout from the notebook code.

```{embed} myst:ex-annotate-config
:remove-output: true
```

The config file:

```{literalinclude} ../demo/config/annotate-simple.yaml
:language: yaml
```


## Review (advanced config)

A validation workflow with conditional sections, progress tracking, multiple form element types, and spectrogram capture. The config file drives the entire layout:

```{embed} myst:ex-review
:remove-output: true
```

```{literalinclude} ../demo/config/simple-examples-3c.yaml
:language: yaml
```

![TODO: SCREENSHOT OF REVIEWER](../../assets/app-review.png)


## Custom Visualizations (OpenSoundscape)

Integrate third-party spectrogram libraries by wrapping them in a function that returns the standard viz dict. Here we use [OpenSoundscape](https://opensoundscape.org):

```{embed} myst:ex-custom-viz
:remove-output: true
```

The `visualizations` module also works standalone for analysis:

```{embed} myst:standalone-vis
:remove-output: false
:remove-input: false
```
