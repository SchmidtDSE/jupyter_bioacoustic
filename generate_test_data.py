"""Generate detections-test.csv — 25 rows of synthetic detection data."""
import csv
import random

random.seed(42)

CATEGORIES = [
    ("Northern saw-whet owl",      "Aegolius acadicus"),
    ("Canada goose",               "Branta canadensis"),
    ("Marbled murrelet",           "Brachyramphus marmoratus"),
    ("Great horned owl",           "Bubo virginianus"),
    ("Hermit thrush",              "Catharus guttatus"),
    ("Wolf howl",                  "Canis lupus"),
    ("Swainson's thrush",          "Catharus ustulatus"),
    ("Olive-sided flycatcher",     "Contopus cooperi"),
    ("Wrentit",                    "Chamaea fasciata"),
    ("Common nighthawk call",      "Chordeiles minor"),
    ("Common nighthawk boom",      "Chordeiles minor"),
    ("Northern flicker series",    "Colaptes auratus"),
    ("Common raven",               "Corvus corax"),
    ("Steller's jay",              "Cyanocitta stelleri"),
    ("Sooty grouse",               "Dendragapus fuliginosus"),
    ("Dog barks",                  "NA"),
    ("Downy woodpecker call",      "Dryobates pubescens"),
    ("Northern pygmy-owl",         "Glaucidium gnoma"),
    ("Human speech",               "NA"),
    ("Pileated woodpecker call",   "Dryocopus pileatus"),
    ("Barred owl inspection call", "Strix varia"),
    ("Varied thrush",              "Ixoreus naevius"),
    ("Western screech-owl",        "Megascops kennicotti"),
    ("Townsend's solitaire",       "Myadestes townsendi"),
    ("Clark's nutcracker",         "Nucifraga columbiana"),
    ("American pika",              "Ochotona princeps"),
    ("Mountain quail",             "Oreortyx pictus"),
    ("Canada jay",                 "Perisoreus canadensis"),
    ("Spotted towhee",             "Pipilo maculatus"),
    ("Chickadee song",             "Poecile sp."),
    ("Flammulated owl",            "Psiloscops flammeolus"),
    ("Gunshot",                    "NA"),
    ("Nuthatch",                   "Sitta sp."),
    ("Spotted owl location call",  "Strix occidentalis"),
    ("Barred owl eight-note call", "Strix varia"),
    ("Douglas' squirrel rattle",   "Tamasciurus douglasii"),
    ("Chipmunk chirp",             "Neotamias sp."),
    ("American robin whinny",      "Turdus migratorius"),
    ("Strix owl contact whistle",  "Strix sp."),
    ("Mourning dove",              "Zenaida macroura"),
]

rows = []
for i in range(1, 26):
    common_name, scientific_name = random.choice(CATEGORIES)
    start_time = round(random.uniform(0, 4 * 60 * 60), 2)
    rows.append({
        'id':              i,
        'common_name':     common_name,
        'scientific_name': scientific_name,
        'confidence':      round(random.uniform(0.1, 0.998), 3),
        'rank':            random.randint(1, 3),
        'start_time':      start_time,
        'end_time':        round(start_time + 12, 2),
    })

out = 'detections-test.csv'
fieldnames = ['id', 'common_name', 'scientific_name', 'confidence', 'rank', 'start_time', 'end_time']
with open(out, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f'Written {len(rows)} rows to {out}')
for r in rows:
    print(f"  {r['id']:2d}  {r['common_name']:<35s}  conf={r['confidence']:.3f}  start={r['start_time']:.1f}s")
