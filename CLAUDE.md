# Bayline: car park test-fit planner

Bayline is a single-page car park test-fit tool for Victorian sites, live at **https://oldquads.github.io/bayline/**. You search an address or click a lot on an OpenStreetMap base map. The planner then lays out car parking on the lot's title boundary, ranks the options by bay count, and checks them against **Clause 52.06** of the Victoria Planning Provisions and **AS/NZS 2890.1 / 2890.6**.

Read `docs/HANDOVER.md` first. It covers how the tool got here, the decisions behind it and the open ideas.

## Working rules (from the user, keep to them)

- **Every complaint or sketch is a missing general move, never a site fix.** When the user shows a lot where the planner wastes space, work out which move the engine lacks, build it for all lots, and prove it on the benchmark.
- **Benchmark before every push.** Publish only if no lot gets worse and the rule checker removes no bays. See "Checking a change" below. Add the user's problem lots to `bench/lots.json` so they stay fixed.
- **Victorian and Australian standards:** Clause 52.06-9 Table 2 for 90° bays (2.6/6.4, 2.8/5.8, 3.0/5.2, 3.2/4.8 m bay width / aisle, 4.9 m long), AS/NZS 2890.1 user classes, and AS/NZS 2890.6 for accessible bays.
- The user is direct and wants results, not explanations of limits. If something can't be done, test it and show the evidence (as with the artifact network test in the handover). Don't assert it.
- Explain changes in plain language with before/after bay counts.

## Files

- `index.html`: the whole app (HTML, CSS and JS in one file, about 1,600 lines). No build step.
- `bench/lots.json`: 21 real Melbourne lots (local metres, street edge index).
- `bench/bench.py`: runs every lot through the page headlessly and prints bays, m² per bay and timing.
- `bench/compare.py`: diffs two runs and exits 1 if any lot got worse.
- `bench/show.py`: runs one lot and screenshots an option.
- `bench/out/`: results and screenshots (gitignored).
- `docs/HANDOVER.md`: history, decisions and open ideas.
- `docs/vicmap.md`: Vicmap WFS layers and query notes.

## Map of index.html (search for these markers)

| Section | What it does |
|---|---|
| `Standards presets` | `STD` presets (VIC 52.06, AS 2890.1 classes), `TYPES`, default state `DEF`, localStorage key `bayline-v1` |
| `Geometry` | `area`, `inset` (setbacks), `pip`, `inside` (strict containment incl. corner poke test), `sat` (polygon overlap), `stripInts` |
| `Layout engine` | `shapeFor` (bay shape per angle), `buildCtx` (lot + crossover), `frameCache` (lot rotated into grid frame), **`layoutCore`** (accessway + aisle grid + rows + accessway-side bays + weak-aisle removal), **`attachCrossover`** (driveway from crossover to circulation, accessible bays, totals) |
| `Iteration driver` | `describe`, `keyOf`, `tablePairs`, `rowPhases` (row offsets incl. flush-to-wall), **`recompute`** (stage 1 grid search across 7 crossover points, then stage 2 Table 2 pairs and stage 3 zones, run progressively) |
| `Zones` | `polySplits` (cut at inside corners), `searchSync`, `zoneConnectors`, `combineZones`, `zoneSearch` |
| `Local infill` | `infill`: greedy rounds of end pockets, carry an aisle on at narrower Table 2 widths, dead-end branches, lining bare edges |
| `Layout rule checker` | **`validateLayout`**: inside the lot, no overlap, opens onto circulation via its entry edge, circulation connected to the crossover. Removes offenders. `finish` runs infill and the checker, then ranks. |
| `Drawing` / `Checks` / `UI` | plan canvas, compliance checks list, option cards, settings panel |
| `Saving files` | SVG (1:100, metres) and CSV bay schedule |
| `Vicmap lots` | saved lots (localStorage `bayline-sites`), paste a boundary |
| `Map: MapLibre + OpenFreeMap` | base map, Vicmap lot tiles (split when they hit the 5,000-feature cap), address search, lot selection, frontage detection, `useParcel` |

Test hook: `window.__bl` exposes `results`, `S`, `recompute`, `validateLayout`. `window.__blDone` is true when all search stages have finished.

Coordinates: the planner works in local metres. Lots from the map are projected around their own centroid (`projectRing`). The map module uses a fixed origin (`toM` / `toLL`) for hit-testing.

## Checking a change

You need Python Playwright with Chromium (`pip install playwright && python -m playwright install chromium` if missing).

```bash
git show HEAD:index.html > /tmp/before.html
python3 bench/bench.py /tmp/before.html before      # about 75-90 s for 21 lots
python3 bench/bench.py index.html after
python3 bench/compare.py before after              # must print "worse: none" and "removed by checker: 0"
python3 bench/show.py 19 0                          # screenshot lot 19, option 1, to bench/out/
```

The benchmark uses Clause 52.06 defaults (2.6 × 4.9 m bays, 6.4 m aisle), 0 m setbacks, automatic crossover and no accessible bays. If a change touches angled or parallel bays, setbacks or accessible bays, also run with those settings: pass overrides to `show.py` as JSON.

## Publishing

GitHub Pages deploys `main` (root) in about a minute. Commit as the repo owner and add the co-author lines:

```bash
git -c user.name="Oldquads" -c user.email="Oldquads@users.noreply.github.com" commit -m "..."
git push origin main
```

Pages caches for a few minutes. To confirm a deploy, fetch `index.html?v=<timestamp>` with `cache: "no-store"` and look for a string from your change.

## Gotchas already hit

- **Vicmap caps WFS responses at 5,000 features** and ignores a higher maxFeatures. Tiles that return exactly 5,000 are split into quarters (`loadBox`).
- **CQL axis order:** `BBOX()` and `POINT()` on the native CRS take latitude first. With `srsName=EPSG:4326` and `bbox=...,EPSG:4326`, coordinates are longitude first.
- **Don't clear an array you are about to refill from** (`keep.length=0` on an aliased array removed every aisle once). Copy first.
- **Bay corner order differs by builder:** `shapeFor` uses one order and `rect` another. Derive sides from geometry (the clearance shape bug came from assuming order).
- The page must not show layouts with 0 bays, and it must keep the user's chosen option selected across the progressive stages (`userPicked`).
- claude.ai artifacts cannot fetch outside hosts, which is why this lives on GitHub Pages. That was tested; see the handover.
