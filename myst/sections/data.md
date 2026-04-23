(data-param)=
# The Data Parameter

The `data` parameter is how you provide input rows to the widget. It accepts multiple source types — the format is auto-detected from the string.

| Pattern | Detected as | Example |
|---|---|---|
| Contains `SELECT` | SQL query (DuckDB) | `"SELECT * FROM 'data.parquet' WHERE confidence > 0.5"` |
| Starts with `api::` | API endpoint | `"api::https://api.example.com/detections"` |
| Starts with `http://`, `s3://`, etc. | URL / URI | `"https://example.com/detections.csv"` |
| Everything else | Local file path | `"detections.csv"` |


## From a File

The simplest case — a local CSV, Parquet, or JSONL file.

```{embed} #nb.data.from-file
:remove-output: true
```

## From a DataFrame

Pass a pandas DataFrame directly. Useful when you want to filter or transform data before launching the widget.

```{embed} #nb.data.from-dataframe
:remove-output: true
```

## From a URL

URLs are auto-detected. The response format (JSON array, JSONL, or file) is inferred from the Content-Type header.

```{embed} #nb.data.from-url
:remove-output: true
```

## From a SQL Query

Strings containing `SELECT` are executed via [DuckDB](https://duckdb.org/). This works with local files, S3 parquet, and more.

```{embed} #nb.data.from-sql
:remove-output: true
```

## From an API

Use the `api::` prefix to force API mode. Secrets can provide authentication headers, passed as HTTP cookies.

```{embed} #nb.data.from-api
:remove-output: true
```


## Dict Form

For explicit control over the source type, secrets, and columns, pass a dict with one source key (`path`, `url`, `uri`, `api`, or `sql`):

```{embed} #nb.data.dict-form
:remove-output: true
```

In a YAML config file this looks like:

```yaml
data:
  path: data/annotate-data.csv
  columns: [common_name, confidence, start_time, end_time]
  secrets:
    - key: Authorization
      value: env:API_TOKEN
```

The dict form is most useful in config files where you want secrets and column settings grouped with the data source.


## Top-Level Overrides

`data_path`, `data_url`, `data_sql`, and `data_api` let you override the source while keeping other settings (secrets, columns) in a dict or config file:

```{embed} #nb.data.top-level-override
:remove-output: true
```

Only one of the four may be set at a time.


## Custom Time Columns

By default, the widget expects `start_time` and `end_time` columns. Use `data_start_time` and `data_end_time` to rename them, or `data_duration` to compute end times from a duration:

```{embed} #nb.data.duration
:remove-output: true
```

`data_duration` accepts either a column name (string) or a fixed number. When set, it takes precedence over `data_end_time`.


## Secrets

`data_secrets` provides authentication for data loading. Each secret is a `{key, value}` pair:

```yaml
data_secrets:
  - key: Authorization
    value: env:API_TOKEN      # read from environment variable
  - key: session_id
    value: dialog             # prompt the user interactively
```

| Value format | Behavior |
|---|---|
| `env:VAR_NAME` | Reads from `os.environ['VAR_NAME']` |
| `dialog` | Prompts via `getpass` (masked input) |
| Anything else | Used as a literal value |

Secrets are passed as HTTP cookies for URL/API sources, or as DuckDB `SET` commands for SQL sources. A global `secrets` parameter serves as a fallback for both `data_secrets` and `audio_secrets`.
