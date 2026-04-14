"""Analysis charts and maps for bioacoustic review data."""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors


def species_histogram(df: pd.DataFrame, title: str = 'Detections by species',
                      column: str = 'common_name', figsize=(12, 5)):
    """Horizontal bar chart of counts by species, sorted most to least."""
    counts = df[column].value_counts().sort_values(ascending=True)
    fig, ax = plt.subplots(figsize=figsize)
    counts.plot.barh(ax=ax, color='#89b4fa')
    ax.set_xlabel('Count')
    ax.set_title(title)
    ax.spines[['top', 'right']].set_visible(False)
    plt.tight_layout()
    return fig


def accuracy_by_county(input_df: pd.DataFrame, output_df: pd.DataFrame,
                       county_column: str = 'county',
                       n: int = 10, figsize=(12, 6)):
    """Show the n most and n least accurate counties side by side.

    Matches input rows to output rows by index position (review order).
    """
    # We need to join input county with output is_valid
    # Output rows correspond to a subset of input rows — use start_time+end_time as join key
    merged = input_df.merge(
        output_df[['start_time', 'end_time', 'is_valid']],
        on=['start_time', 'end_time'],
        how='inner',
    )
    merged['correct'] = (merged['is_valid'] == 'yes').astype(int)

    county_stats = merged.groupby(county_column).agg(
        total=('correct', 'count'),
        correct=('correct', 'sum'),
    )
    county_stats['accuracy'] = county_stats['correct'] / county_stats['total']
    county_stats = county_stats[county_stats['total'] >= 3]  # min sample size
    county_stats = county_stats.sort_values('accuracy')

    bottom_n = county_stats.head(n)
    top_n = county_stats.tail(n).iloc[::-1]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)

    # Least accurate
    colors_bad = ['#f38ba8' if a < 0.5 else '#fab387' for a in bottom_n['accuracy']]
    ax1.barh(
        [f"{c} ({int(r['total'])})" for c, r in bottom_n.iterrows()],
        bottom_n['accuracy'] * 100,
        color=colors_bad,
    )
    ax1.set_xlabel('Accuracy %')
    ax1.set_title(f'{n} least accurate counties')
    ax1.set_xlim(0, 105)
    ax1.invert_yaxis()
    for i, (_, r) in enumerate(bottom_n.iterrows()):
        ax1.text(r['accuracy'] * 100 + 1, i, f"{r['accuracy']*100:.0f}%", va='center', fontsize=9)
    ax1.spines[['top', 'right']].set_visible(False)

    # Most accurate
    colors_good = ['#a6e3a1' if a >= 0.9 else '#89b4fa' for a in top_n['accuracy']]
    ax2.barh(
        [f"{c} ({int(r['total'])})" for c, r in top_n.iterrows()],
        top_n['accuracy'] * 100,
        color=colors_good,
    )
    ax2.set_xlabel('Accuracy %')
    ax2.set_title(f'{n} most accurate counties')
    ax2.set_xlim(0, 105)
    ax2.invert_yaxis()
    for i, (_, r) in enumerate(top_n.iterrows()):
        ax2.text(r['accuracy'] * 100 + 1, i, f"{r['accuracy']*100:.0f}%", va='center', fontsize=9)
    ax2.spines[['top', 'right']].set_visible(False)

    plt.tight_layout()
    return fig


def county_species_map(m, input_df: pd.DataFrame, county_geojson: dict,
                       species_column: str = 'common_name',
                       county_column: str = 'county',
                       region_name_key: str = 'NAME'):
    """Add a choropleth layer to an ipyleaflet Map coloring counties by dominant species.

    Adds tooltips with count and percent.
    """
    from ipyleaflet import GeoJSON
    import json

    # Compute dominant species per county
    county_stats = {}
    for county, grp in input_df.groupby(county_column):
        total = len(grp)
        top = grp[species_column].value_counts()
        dominant = top.index[0]
        count = top.iloc[0]
        pct = count / total * 100
        county_stats[county.lower()] = {
            'dominant': dominant, 'count': count, 'total': total, 'pct': pct,
        }

    # Assign colors by species
    all_dominant = sorted(set(s['dominant'] for s in county_stats.values()))
    palette = [
        '#89b4fa', '#a6e3a1', '#f38ba8', '#fab387', '#cba6f7',
        '#89dceb', '#f9e2af', '#94e2d5', '#eba0ac', '#74c7ec',
        '#b4befe', '#a6adc8', '#f5c2e7', '#bac2de', '#f2cdcd',
    ]
    species_colors = {sp: palette[i % len(palette)] for i, sp in enumerate(all_dominant)}

    # Build styled GeoJSON
    features = []
    for feat in county_geojson['features']:
        name = feat['properties'].get(region_name_key, '')
        stats = county_stats.get(name.lower())
        if not stats:
            continue
        new_feat = dict(feat)
        new_feat['properties'] = dict(feat['properties'])
        new_feat['properties']['_dominant'] = stats['dominant']
        new_feat['properties']['_count'] = stats['count']
        new_feat['properties']['_total'] = stats['total']
        new_feat['properties']['_pct'] = f"{stats['pct']:.0f}%"
        new_feat['properties']['_color'] = species_colors[stats['dominant']]
        features.append(new_feat)

    styled_geojson = {"type": "FeatureCollection", "features": features}

    def style_fn(feature):
        return {
            'color': '#45475a',
            'weight': 1,
            'fillColor': feature['properties'].get('_color', '#6c7086'),
            'fillOpacity': 0.5,
        }

    layer = GeoJSON(
        data=styled_geojson,
        style_callback=style_fn,
        hover_style={'weight': 3, 'fillOpacity': 0.7},
        name='Species by county',
    )

    from ipywidgets import Output
    info = Output()

    def on_hover(feature, **kwargs):
        props = feature['properties']
        name = props.get(region_name_key, '?')
        dom = props.get('_dominant', '?')
        cnt = props.get('_count', '?')
        tot = props.get('_total', '?')
        pct = props.get('_pct', '?')
        with info:
            info.clear_output()
            print(f"{name}: {dom} — {cnt}/{tot} ({pct})")

    layer.on_hover(on_hover)
    m.add(layer)

    # Print legend
    print("Legend (dominant species → color):")
    for sp, color in species_colors.items():
        print(f"  {color}  {sp}")

    return layer, info
