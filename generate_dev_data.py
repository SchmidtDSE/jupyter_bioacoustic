"""Generate dev-annotate.csv and dev-review.csv — 750 rows each with audio_path, county, lat, lon."""
import csv
import random

random.seed(123)

# Load categories from categories-small.csv
CATEGORIES = []
with open('categories-small.csv') as f:
    for row in csv.DictReader(f):
        CATEGORIES.append((row['common_name'], row['scientific_name']))

# California counties with approximate bounding boxes (lat_min, lat_max, lon_min, lon_max)
CA_COUNTIES = [
    ("Alameda",        37.45, 37.91, -122.37, -121.47),
    ("Alpine",         38.41, 38.77, -120.21, -119.54),
    ("Amador",         38.17, 38.60, -121.03, -120.07),
    ("Butte",          39.38, 40.00, -122.05, -121.15),
    ("Calaveras",      37.83, 38.44, -120.93, -119.88),
    ("Colusa",         38.92, 39.58, -122.66, -121.79),
    ("Contra Costa",   37.73, 38.07, -122.43, -121.56),
    ("Del Norte",      41.55, 42.00, -124.33, -123.51),
    ("El Dorado",      38.48, 39.07, -121.14, -119.88),
    ("Fresno",         36.20, 37.59, -120.92, -118.36),
    ("Glenn",          39.32, 39.87, -122.73, -121.91),
    ("Humboldt",       40.00, 41.47, -124.41, -123.41),
    ("Imperial",       32.62, 33.43, -116.11, -114.46),
    ("Inyo",           35.80, 37.60, -118.84, -115.63),
    ("Kern",           34.79, 35.79, -119.87, -117.63),
    ("Kings",          35.80, 36.49, -120.32, -119.53),
    ("Lake",           38.74, 39.38, -122.94, -122.26),
    ("Lassen",         40.09, 41.18, -121.33, -120.07),
    ("Los Angeles",    33.70, 34.82, -118.94, -117.65),
    ("Madera",         36.78, 37.64, -120.40, -118.86),
    ("Marin",          37.81, 38.26, -123.03, -122.35),
    ("Mariposa",       37.18, 37.91, -120.38, -119.20),
    ("Mendocino",      38.76, 40.00, -124.00, -122.82),
    ("Merced",         36.74, 37.63, -121.25, -120.05),
    ("Modoc",          41.18, 42.00, -121.33, -120.00),
    ("Mono",           37.36, 38.50, -119.64, -117.83),
    ("Monterey",       35.78, 36.92, -121.98, -120.21),
    ("Napa",           38.29, 38.86, -122.64, -122.06),
    ("Nevada",         39.13, 39.62, -121.26, -120.00),
    ("Orange",         33.38, 33.95, -118.11, -117.41),
    ("Placer",         38.73, 39.38, -121.48, -120.00),
    ("Plumas",         39.62, 40.34, -121.44, -120.07),
    ("Riverside",      33.43, 34.08, -117.63, -114.43),
    ("Sacramento",     38.02, 38.74, -121.86, -121.04),
    ("San Benito",     36.19, 36.92, -121.54, -120.60),
    ("San Bernardino", 34.03, 35.81, -117.65, -114.13),
    ("San Diego",      32.53, 33.51, -117.60, -116.08),
    ("San Francisco",  37.70, 37.83, -122.51, -122.36),
    ("San Joaquin",    37.56, 38.30, -121.59, -120.92),
    ("San Luis Obispo",34.99, 35.79, -121.33, -119.47),
    ("San Mateo",      37.11, 37.71, -122.52, -122.08),
    ("Santa Barbara",  34.27, 35.18, -120.64, -119.22),
    ("Santa Clara",    36.89, 37.48, -122.20, -121.21),
    ("Santa Cruz",     36.85, 37.20, -122.32, -121.58),
    ("Shasta",         40.28, 41.18, -122.85, -121.33),
    ("Sierra",         39.38, 39.88, -121.15, -120.01),
    ("Siskiyou",       41.18, 42.00, -123.72, -121.33),
    ("Solano",         38.03, 38.54, -122.41, -121.59),
    ("Sonoma",         38.12, 38.86, -123.37, -122.35),
    ("Stanislaus",     37.28, 37.93, -121.40, -120.39),
    ("Sutter",         38.69, 39.32, -121.91, -121.35),
    ("Tehama",         39.79, 40.43, -122.97, -121.81),
    ("Trinity",        40.15, 41.18, -123.63, -122.45),
    ("Tulare",         35.79, 36.78, -119.54, -117.98),
    ("Tuolumne",       37.64, 38.41, -120.65, -119.20),
    ("Ventura",        34.00, 34.90, -119.48, -118.63),
    ("Yolo",           38.31, 38.93, -122.29, -121.45),
    ("Yuba",           39.09, 39.62, -121.63, -120.96),
]

AUDIO_FILES = ['audio/test1.flac', 'audio/test2.flac', 'audio/test3.flac', None]


def generate(filename, n=500):
    rows = []
    for i in range(1, n + 1):
        common_name, scientific_name = random.choice(CATEGORIES)
        county, lat_min, lat_max, lon_min, lon_max = random.choice(CA_COUNTIES)
        lat = round(random.uniform(lat_min, lat_max), 5)
        lon = round(random.uniform(lon_min, lon_max), 5)
        audio = random.choice(AUDIO_FILES)
        start_time = round(random.uniform(0, 4 * 60 * 60), 2)
        rows.append({
            'id':              i,
            'common_name':     common_name,
            'scientific_name': scientific_name,
            'confidence':      round(random.uniform(0.1, 0.998), 3),
            'rank':            random.randint(1, 3),
            'start_time':      start_time,
            'end_time':        round(start_time + 12, 2),
            'audio_path':      audio or '',
            'county':          county,
            'lat':             lat,
            'lon':             lon,
        })

    fieldnames = [
        'id', 'common_name', 'scientific_name', 'confidence', 'rank',
        'start_time', 'end_time', 'audio_path', 'county', 'lat', 'lon',
    ]
    with open(filename, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f'Written {len(rows)} rows to {filename}')


generate('dev-annotate.csv', 1500)
generate('dev-review.csv', 1500)
