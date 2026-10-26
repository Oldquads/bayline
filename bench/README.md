# Layout benchmark

`lots.json` holds 20 real lots (Vicmap Property, simplified to 0.3 m, local metres) from Footscray, Richmond, Dandenong, Box Hill, Preston, Port Melbourne, Ringwood and the CBD, each with its street edge.

`python3 bench/bench.py index.html <tag>` loads each lot into the page with Clause 52.06 defaults (2.6 x 4.9 m bays, 6.4 m aisle, 0 m setbacks, automatic crossover) and prints the best bay count, site area per bay, a packing ratio against area / 21.06 m2, bays removed by the rule checker, and run time. Needs Python Playwright with Chromium.

Results on 26 Oct 2026 (before the review -> after):
- total bays 3,042 -> 3,091; Box Hill 2305\PP3337 (L-shaped) 265 -> 317
- layouts with unreachable bays or bays outside the lot: present in 5 lots -> 1 bay on 1 lot (removed by the checker)
- search time for all 20 lots: 38.5 s -> 22.8 s before zoned layouts (zoned stage adds up to ~3 s on lots with an inside corner, after the first results show)

Clause 52.06 Table 2 pairs in the main grid (26 Oct 2026, second change): total 3,091 -> 3,120 bays. 272-282 Queen St 37 -> 40, Port Melbourne 9\PS537520 48 -> 56, Port Melbourne 11\PS523474 221 -> 239. The extra stage adds 0.3-2.5 s after the first results show.

End-pocket infill (bays facing straight onto the end of an aisle or accessway): 3,120 -> 3,174 bays, 17 of 20 lots gain, none lose, no bays removed by the checker. 272-282 Queen St 40 -> 44.
