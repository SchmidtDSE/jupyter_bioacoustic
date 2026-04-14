"""
Interactive California map with analysis charts.

Paste each section into a separate notebook cell.

Requirements: pip install ipyleaflet ipywidgets pandas shapely requests matplotlib
"""

# ── Cell 1 — Load data and county boundaries ─────────────────

import pandas as pd
import requests
from IPython.display import display

df = pd.read_csv('dev-review.csv')
df_output = pd.read_csv('dev-geo-review-output.csv')

all_counties = requests.get(
    "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
).json()
ca_counties = {
    "type": "FeatureCollection",
    "features": [f for f in all_counties["features"] if f["id"].startswith("06")]
}

print(f"Input: {len(df)} rows, Output: {len(df_output)} rows, Counties: {len(ca_counties['features'])}")


# ── Cell 2 — Species histogram (input data) ──────────────────

from demo_tools import analysis

analysis.species_histogram(df, title='Input detections by species')


# ── Cell 3 — Species histogram (validated data) ──────────────

# Merge output with input to get common_name for validated rows
df_validated = df.merge(
    df_output[['start_time', 'end_time', 'is_valid']],
    on=['start_time', 'end_time'],
    how='inner',
)
analysis.species_histogram(df_validated, title='Validated detections by species')


# ── Cell 4 — County distributions (diversity + accuracy) ─────

analysis.county_distributions(df, df_output)


# ── Cell 5 — Map: dominant species by county ─────────────────

from ipyleaflet import Map

m = Map(center=(37.5, -119.5), zoom=6, layout={'height': '600px'})
layer, info = analysis.county_species_map(m, df, ca_counties)
display(m, info)


# ── Cell 6 — Map: accuracy by county ─────────────────────────

m2 = Map(center=(37.5, -119.5), zoom=6, layout={'height': '600px'})
layer2, info2 = analysis.county_accuracy_map(m2, df, df_output, ca_counties)
display(m2, info2)


# ── Cell 7 — Interactive selection map ────────────────────────

from demo_tools import MapHandler

m3 = Map(center=(37.5, -119.5), zoom=6, layout={'height': '600px'})
handler = MapHandler(df, region_data=ca_counties, region_column='county', color_column='common_name')
handler.add_to(m3)
display(m3)


# ── Cell 8 — Describe the selection ───────────────────────────

handler.describe('common_name', 'confidence')


# ── Cell 9 — Access the filtered result ───────────────────────

if handler.selected is not None:
    print(f"{len(handler.selected)} rows selected")
    # JupyterAudio(data=handler.selected, audio_path='test.flac', ...).open()
else:
    print("No selection yet — click a county, draw a rectangle, or draw a polygon")
