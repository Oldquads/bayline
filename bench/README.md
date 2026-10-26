# Layout benchmark

`lots.json` holds 20 real lots (Vicmap Property, simplified to 0.3 m, local metres) from Footscray, Richmond, Dandenong, Box Hill, Preston, Port Melbourne, Ringwood and the CBD, each with its street edge.

`python3 bench/bench.py index.html <tag>` loads each lot into the page with Clause 52.06 defaults (2.6 x 4.9 m bays, 6.4 m aisle, 0 m setbacks, automatic crossover) and prints the best bay count, site area per bay, a packing ratio against area / 21.06 m2, bays removed by the rule checker, and run time. Needs Python Playwright with Chromium.

Results on 26 Oct 2026 (before the review -> after):
- total bays 3,042 -> 3,091; Box Hill 2305\PP3337 (L-shaped) 265 -> 317
- layouts with unreachable bays or bays outside the lot: present in 5 lots -> 1 bay on 1 lot (removed by the checker)
- search time for all 20 lots: 38.5 s -> 22.8 s before zoned layouts (zoned stage adds up to ~3 s on lots with an inside corner, after the first results show)
