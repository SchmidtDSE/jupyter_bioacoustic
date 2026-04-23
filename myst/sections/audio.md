(audio-param)=
# The Audio Parameter

The `audio` parameter specifies where audio files come from. Like `data`, the source type is auto-detected from the string.

| Pattern | Detected as | Example |
|---|---|---|
| Starts with `http://`, `s3://`, `gs://` | URL / URI | `'s3://bucket/recording.flac'` |
| No `/` and no `.` in the string | Column name | `'audio_path'` |
| Everything else | Local file path | `'recordings/site-a.flac'` |


## Local File

A single audio file shared by all rows.

```{embed} #nb.audio.local-path
:remove-output: true
```

## HTTPS URL

The entire file is downloaded on first access and cached locally. Subsequent segments from the same recording load instantly.

```{embed} #nb.audio.https-url
:remove-output: true
```

## S3 URI

S3 audio uses **partial byte-range downloads** — only the FLAC header (4 KB) and the estimated segment range are fetched. Multi-hour recordings load in seconds.

```{embed} #nb.audio.s3-uri
:remove-output: true
```

## Per-Row Audio (Column Mode)

When `audio` is detected as a column name, each row's value is used as the audio file path. Use `audio_fallback` for rows with empty values.

```{embed} #nb.audio.per-row-column
:remove-output: true
```

## Prefix and Suffix

`audio_prefix` and `audio_suffix` are joined with `/` to construct the final path. For URLs, the prefix is inserted after the protocol.

```{embed} #nb.audio.prefix-suffix
:remove-output: true
```

## Dict Form

For explicit control, pass a dict with one source key (`path`, `url`, `uri`, `column`, `sql`, or `api`):

```{embed} #nb.audio.dict-form
:remove-output: true
```

In a YAML config file:

```yaml
audio:
  column: audio_path
  prefix: audio
  fallback: audio/default.flac
  secrets:
    - key: Authorization
      value: env:AUDIO_TOKEN
```

## Audio from SQL or API

When the audio path itself needs to be resolved dynamically, use `audio_sql` or `audio_api` with `audio_property`. The query is executed at init time and the specified field is extracted.

```{embed} #nb.audio.from-sql
:remove-output: true
```

Top-level parameters:

| Parameter | Description |
|---|---|
| `audio_sql` | SQL query to resolve audio path |
| `audio_api` | API URL to resolve audio path |
| `audio_property` | Field/column name to extract from the result |
| `audio_response_index` | 1-based row index (default: 1) |

These can also be set in the audio dict:

```yaml
audio:
  api: https://api.example.com/v1/recordings
  property: file_url
  response_index: 1
  secrets:
    - key: Authorization
      value: env:API_TOKEN
```

## Secrets

`audio_secrets` works identically to `data_secrets` — `env:VAR`, `dialog`, or literal values. The global `secrets` parameter serves as a fallback.

```python
JupyterAudio(
    data='detections.csv',
    audio='s3://private-bucket/recording.flac',
    audio_secrets={'key': 's3_access_key_id', 'value': 'env:AWS_KEY'},
).open()
```
