(examples)=
# Examples


The most basic configuration of `BioacousticAnnotator` is a simple Player / Visualizer.  

```python
BioacousticAnnotator(data='detections.csv', audio='recording.flac').open()
```

Here we have used a CSV for the source `data`. We could similarly have provided a Parquet, or JSONL file path, an API-endpoit, a Database Query (using DuckDB), or have passed a dataframe directly. For `audio` we have passed a path to an audio file. For this example all the clips will come from the same file. You can also pass an `audio_column` so that each clip can be read from different audio file. The audio files can be local paths or be read over `https://`, `s3://`,  and `gs://`. 


For more advanced configurations it is suggested that to use a configurtion file. 

Here's a basic example:

```{literalinclude} ../../demo/annotator_config/config/simple-examples-3.yaml
:language: yaml
```    

The data file itself is not in the config: it is set in the project file (`annotator_config/projects/simple-examples-3.yaml`) or passed in the notebook, so the same config can be reused across datasets and users. Because this config has a form, it sets the input's index column (`data: {index_column: id}`). 

---

**FORM CONFIG**

We could have included the form config directly, however seperating the form config allows different projects to use the same forms. Forms themeselves can range to a simple select-dropdown to multipart dynamic forms. Even the most complex forms however are easy to configure.

Here we create a "species" select list populated with values from a csv:
```{figure} ../../assets/form_panel/annotate-species.png
:class: bordered
```

```yaml
form:
  - select:
      label: species
      column: common_name
      required: true
      items:
        path: data/species_counts.N-dse.csv
        value: common_name
```

Additional functionality is easily added.  The config below, again creates a "species" select list but now adds a _filter box_, an _Unknown-option_ and the ability to add _custom-values_:

```yaml
form:
  - select:
      label: species
      column: common_name
      required: true
      items:
        path: data/species_counts.N-dse.csv
        value: common_name
        filter_box: true
        custom_value: true
        not_available:
          label: Unknown Species
          value: unknown
```

---

The following configuration below adds a custom title and a progress-tracker, passes the source _id_ to the output dataset with name _detection\_id_, and asks the user if the model has correctly identified the species.

```{literalinclude} ../../demo/annotator_config/forms/simple-examples-3.yaml
:language: yaml
```    

If the response is yes the confirmed_form allows for the user to add additional detials.
```{figure} ../../assets/form_panel/review-yes.png
:class: bordered
```

If the response is no the rejected_form allows the user to select the correct species, ask for a review, etc.
```{figure} ../../assets/form_panel/review-no.png
:class: bordered
```

Additional examples are given in the [Customizable Forms](#form-examples) section.


