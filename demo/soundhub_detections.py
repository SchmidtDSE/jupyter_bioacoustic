"""
Soundhub Detections Export

Fetches detections (confidence > 0.5) for all 197 deployment codes
from the Wildlife Soundhub API and writes a single CSV.

Requires:
    - SOUNDHUB_SESSION_TOKEN environment variable
    - requests, pandas

Usage:
    python soundhub_detections.py
    python soundhub_detections.py --output my_detections.csv
    python soundhub_detections.py --min-confidence 0.7

License: BSD 3-Clause
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import random
import sys
import time

import pandas as pd
import requests


#
# CONSTANTS
#
API_BASE = 'https://api.dev.wildlifesoundhub.org'
DEFAULT_OUTPUT = 'soundhub_detections.csv'
DEFAULT_MIN_CONFIDENCE = 0.5
DEFAULT_NB_RECORDINGS = 3
DEFAULT_NB_CPUS = 5
SESSION_COOKIE_NAME = '__Secure-authjs.session-token'
DEFAULT_BINS: dict[str, int | bool] = {
    '50': 20,
    '75': 30,
    '85': 20,
    '90': True,
}


#
# PUBLIC
#
def fetch_deployments(cookies: dict) -> list[dict]:
    """Fetch all deployments from the Soundhub API."""
    return _api_request('deployments', cookies=cookies)


def fetch_recordings(deployment_code: str, cookies: dict) -> list[dict]:
    """Fetch all recordings for a deployment code."""
    return _api_request('recordings', cookies=cookies, code=deployment_code)


def fetch_detections(recording_id: int, cookies: dict) -> list[dict]:
    """Fetch detections for a single recording."""
    return _api_request(f'recordings/{recording_id}/detections', cookies=cookies)


def generate_sample_detections(
    n: int,
    bins: dict[str, int | bool] = DEFAULT_BINS,
    path: str = DEFAULT_OUTPUT,
) -> pd.DataFrame:
    """Sample n detections from a CSV, stratified by confidence bins.

    Args:
        n: Total number of rows to return.
        bins: Confidence bin spec. Keys are confidence thresholds × 100
            (e.g. '50' means 0.50). Values are the percentage of n to
            draw from that bin, except the last entry which should be
            True to indicate "remainder".
            Example: {'50': 10, '73': 30, '81': 32, '94': True}
              → 10% from [0.50, 0.73)
              → 30% from [0.73, 0.81)
              → 32% from [0.81, 0.94)
              → 28% from [0.94, 1.0]
        path: Path to the detections CSV.

    Returns:
        DataFrame with n sampled rows.
    """
    df = pd.read_csv(path)
    thresholds = sorted(bins.keys(), key=lambda k: int(k))

    allocated_pct = sum(v for v in bins.values() if isinstance(v, int))
    if allocated_pct > 100:
        raise ValueError(f'Bin percentages sum to {allocated_pct}%, exceeds 100%')
    remainder_pct = 100 - allocated_pct

    frames: list[pd.DataFrame] = []
    for i, key in enumerate(thresholds):
        lo = int(key) / 100.0
        if i + 1 < len(thresholds):
            hi = int(thresholds[i + 1]) / 100.0
            bucket = df[(df['confidence'] >= lo) & (df['confidence'] < hi)]
        else:
            bucket = df[df['confidence'] >= lo]

        pct = bins[key]
        if isinstance(pct, bool) and pct:
            count = round(n * remainder_pct / 100)
        else:
            count = round(n * pct / 100)

        count = min(count, len(bucket))
        if count > 0:
            frames.append(bucket.sample(n=count))

    if not frames:
        return pd.DataFrame(columns=df.columns)

    result = pd.concat(frames, ignore_index=True)
    return result.sample(frac=1).reset_index(drop=True)


def build_detections_df(
    deployments: list[dict],
    cookies: dict,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    nb_recordings: int = DEFAULT_NB_RECORDINGS,
    nb_cpus: int = DEFAULT_NB_CPUS,
) -> pd.DataFrame:
    """Build a single DataFrame of filtered detections across all deployments.

    For each deployment, fetches recordings, randomly samples up to
    nb_recordings, then fetches detections per recording, filters by
    min_confidence, and enriches with deployment metadata.

    Deployments are processed in parallel across nb_cpus threads.
    """
    total = len(deployments)

    def _process_deployment(
        idx: int, dep: dict,
    ) -> pd.DataFrame | None:
        code = dep['code']
        subproject = dep.get('subproject', '')
        placename = dep.get('placename', '')
        lon, lat = dep.get('geometry', {}).get('coordinates', [None, None])

        recordings = fetch_recordings(code, cookies)
        if not recordings:
            return None

        sampled = random.sample(recordings, min(nb_recordings, len(recordings)))

        dep_frames: list[pd.DataFrame] = []
        for rec in sampled:
            dets = fetch_detections(rec['id'], cookies)
            if not dets:
                continue
            df = pd.DataFrame(dets)
            df['audio_uri'] = f's3://{rec["path"]}'
            df['recording_id'] = rec['id']
            df['recording_start_datetime'] = rec['start']
            df['recording_end_datetime'] = rec['end']
            dep_frames.append(df)

        if not dep_frames:
            return None

        dep_df = pd.concat(dep_frames, ignore_index=True)
        dep_df['lon'] = lon
        dep_df['lat'] = lat
        dep_df['deployment_code'] = code
        dep_df['deployment_subproject'] = subproject
        dep_df['deployment_placename'] = placename

        before = len(dep_df)
        dep_df = dep_df[dep_df['confidence'] > min_confidence]
        print(
            f'{idx + 1}/{total}] {code}: {len(sampled)}/{len(recordings)}'
            f' recordings, {before} total, {len(dep_df)} above {min_confidence}'
        )
        return dep_df if len(dep_df) > 0 else None

    all_frames: list[pd.DataFrame] = []
    with ThreadPoolExecutor(max_workers=nb_cpus) as pool:
        futures = {
            pool.submit(_process_deployment, i, dep): dep
            for i, dep in enumerate(deployments)
        }
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                all_frames.append(result)

    if not all_frames:
        return pd.DataFrame()

    return pd.concat(all_frames, ignore_index=True)


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description='Export Soundhub detections to CSV')
    parser.add_argument(
        '--output', '-o',
        default=DEFAULT_OUTPUT,
        help=f'Output CSV path (default: {DEFAULT_OUTPUT})',
    )
    parser.add_argument(
        '--min-confidence', '-c',
        type=float,
        default=DEFAULT_MIN_CONFIDENCE,
        help=f'Minimum confidence threshold (default: {DEFAULT_MIN_CONFIDENCE})',
    )
    parser.add_argument(
        '--nb-recordings', '-n',
        type=int,
        default=DEFAULT_NB_RECORDINGS,
        help=f'Max random recordings per deployment (default: {DEFAULT_NB_RECORDINGS})',
    )
    parser.add_argument(
        '--nb-cpus',
        type=int,
        default=DEFAULT_NB_CPUS,
        help=f'Number of parallel threads (default: {DEFAULT_NB_CPUS})',
    )
    args = parser.parse_args()

    token = os.environ.get('SOUNDHUB_SESSION_TOKEN')
    if not token:
        print('Error: SOUNDHUB_SESSION_TOKEN environment variable not set', file=sys.stderr)
        sys.exit(1)

    cookies = {SESSION_COOKIE_NAME: token}

    print('Fetching deployments...')
    deployments = fetch_deployments(cookies)
    print(f'Found {len(deployments)} deployments\n')

    t0 = time.time()
    df = build_detections_df(
        deployments, cookies,
        min_confidence=args.min_confidence,
        nb_recordings=args.nb_recordings,
        nb_cpus=args.nb_cpus,
    )
    elapsed = time.time() - t0

    if df.empty:
        print('\nNo detections found.')
        return

    df.to_csv(args.output, index=False)
    print(f'\nDone — {len(df):,} detections written to {args.output} ({elapsed:.1f}s)')


#
# INTERNAL
#
def _api_request(route: str, cookies: dict | None = None, **query) -> list | dict:
    """Make a GET request to the Soundhub API."""
    url = f'{API_BASE}/{route}'
    if query:
        params = '&'.join(f'{k}={v}' for k, v in query.items())
        url = f'{url}?{params}'
    response = requests.get(url, cookies=cookies or {})
    response.raise_for_status()
    return response.json()


if __name__ == '__main__':
    main()
