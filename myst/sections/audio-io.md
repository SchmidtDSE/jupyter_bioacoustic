(audio-io)=
# Sync & Audio IO

## Sync Button


```{figure} ../../assets/sync-btn.png
:class: bordered
```

The `output` parameter on `BioacousticAnnotator` accepts a dict with a `uri` (or `url`) field. When configured, a **Sync button** appears in the bottom-right of the form panel. Clicking it uploads the current output file to the remote location, overwriting the remote copy.

```python
ba = BioacousticAnnotator(
    data='detections.csv',
    audio='recording.flac',
    output={
        'path': 'outputs/reviews.csv',
        'uri': 's3://my-bucket/project/reviews.csv',
        'sync_button': 'Sync to S3',
    },
    ...
)
ba.open()
```

| Key | Type | Description |
|-----|------|-------------|
| `path` | `str` | **(required)** Local output file path |
| `uri` / `url` | `str` | Remote destination for sync |
| `sync_button` | `bool` or `str` | Show sync button. `true` → "Sync", string → custom label |
| `recursive` | `bool` | For directory uploads |
| `secrets` | `list` | Auth kwargs — same `{key, value}` format as `data_secrets` |

---

## Programmatic Sync

You can also sync programmatically with `ba.sync()`, which gives slightly more control — you can override the destination or pass different auth credentials per call:

```python
ba.sync()
ba.sync(dest='s3://backup-bucket/reviews.csv')
ba.sync(profile_name='prod', region_name='us-east-1')
```

Set `sync_button: false` in the config to hide the button while still allowing `ba.sync()` from the notebook.

---

## Audio IO Module

Sync is powered by the `jupyter_bioacoustic.audio` module, which can also be used directly for generic file reads and writes across local, S3, GCS, and HTTPS backends. The router dispatches based on the URI scheme. Remote reads and writes go through [ondio](https://pypi.org/project/ondio/). S3, GCS and HTTPS support comes with JBA; no extra install is needed.

```python
from jupyter_bioacoustic.audio import io
```

| Prefix | Backend |
|--------|---------|
| `s3://` | AWS S3 |
| `gs://` | Google Cloud Storage |
| `http://`, `https://` | HTTPS (read-only) |
| anything else | Local filesystem |

With `platform=`, the URI must have that platform's scheme. For example, `io.read('/data/x.csv', platform='aws')` raises `ValueError`.

### Reading Audio

`io.read_segment()` decodes an audio segment from any source. For a remote FLAC file it uses **byte-range reads** by default: it reads only the bytes of the requested window, and the clip has exactly the samples that a read of the full file gives. Other remote formats, or a failed range read, use a full download that is cached in `/tmp/jba_audio_cache`.

```python
raw, sr = io.read_segment('s3://bucket/recording.flac', start_sec=100, dur_sec=15)
raw, sr = io.read_segment('https://example.com/audio.flac', start_sec=0, dur_sec=5)
raw, sr = io.read_segment('local_file.flac', start_sec=30, dur_sec=10)
```

### Writing Files

`io.write()` uploads local files to S3 or GCS. Use `recursive=True` for directory uploads (e.g. partitioned parquet).

```python
io.write('output.csv', 's3://bucket/project/output.csv')
io.write('output_dir/', 's3://bucket/project/output/', recursive=True)
```

### Authentication

Auth kwargs are passed through to the backend:

| Backend | Kwargs |
|---------|--------|
| **S3** | `profile_name`, `region_name`, `client` |
| **GCS** | `project`, `credentials`, `client` |
| **HTTPS** | `cookies`, `auth`, `token` (Bearer), `headers`, `verify`, `timeout`, `allow_redirects` |

```python
io.write('output.csv', 's3://bucket/output.csv', profile_name='my-profile')
io.read('https://example.com/data.csv', dest='local.csv', token='my-token')
```

- **HTTPS timeout:** the default is 10 s to connect and 60 s between bytes. Set `timeout` to change it.
- **HTTPS redirects:** on a redirect to another host, your `headers`, `token` and `cookies` are not sent to the new host.
- **Public buckets:** when JBA loads a data file or checks an audio URL on `s3://` or `gs://`, and your credentials fail, it tries again with no credentials. It does not try again after other errors, such as a network error or a missing file. `io.read`, `io.write` and `io.list_files` use only the credentials you give.

---

## Walkthrough Notebook

The [Sync & Audio IO notebook](../demo/audio-io.ipynb) walks through sync configuration, reading, writing, listing, and standalone spectrogram rendering with working examples.
