# Feasibility planner

Live at **https://oldquads.github.io/bayline/feasibility/**. The car park page (`index.html`) is the first piece; the feasibility page wraps it in the full residential workflow.

## The workflow (user's brief)

1. Receive a site → **done** (Vicmap lot from the shared map, saved lots, pasted boundary)
2. Check the town planning envelope requirements → **done** (Vicmap Planning zone + overlays, zone starting values, editable controls)
3. Form up the building envelope → **done** (setback bands by height, ResCode B17 profile, coverage / garden area pull-in)
4. Select a core configuration → **done** (phase 2)
5. Apply a structural grid to the typical floor → **done** (phase 2)
6. Cut the floor into apartments from a sizing brief → **done** (phase 3)
7. Test the parking arrangement → **done** (phase 4)

Phase 5: scenario compare, exports (PDF, DXF), proper 3D.

## Phase 1 (this page)

| Part | File | Notes |
|---|---|---|
| Geometry | `lib/geom.js` | `setbackShape`: per-edge setbacks measured square to each boundary (mitred). Clipper (`clipper-lib@6.4.2` from jsDelivr) does the booleans and offsets. |
| Map | `lib/vicmap.js` | Same map, lot, road and address code as `index.html`, plus `planningAt(ring)`: `open-data-platform:plan_zone` and `plan_overlay`, intersected with the lot to give the % of the lot each zone/overlay covers. Field names are read loosely (`zone_code`, `zone_description`, `lga`). |
| Rules | `feasibility/rules.js` | Zone starting values (GRZ 11 m / 3 storeys mandatory, NRZ 9 m / 2, RGZ 13.5 m discretionary, others from schedule/DDO), garden area by lot size, setback presets, overlay notes. All editable on the page. |
| Envelope | `feasibility/envelope.js` | `classifyEdges` (street from Vicmap roads, rear faces away from the street, lane by road name), `compute` (level stack → floorplates, GFA, FAR, NSA, coverage, checks), `maxOut` (most floors in the last tower group before height, storeys, FAR or setbacks break), `envelopeSlices` (for drawing). |
| UI | `feasibility/index.html`, `app.js`, `style.css` | Steps on the left, plan / 3D massing in the middle, numbers and checks on the right, area schedule (CSV) below. State in `localStorage` `bayline-feas-v1`; lots shared with the car park page via `bayline-sites`. |

Decisions:

- **Floorplate of a level group = envelope at its top floor** (setbacks never shrink with height, so the top floor governs).
- **Coverage and garden area:** if the envelope covers more of the site than allowed, every floorplate is pulled in evenly until it fits, and the checks say by how much.
- **ResCode B17** (side and rear: 1 m + 0.3 m/m over 3.6 m to 6.9 m, + 1 m/m above) is applied as a minimum on side and rear edges when ticked.
- Apartment counts are NSA ÷ average apartment size until phase 3. Car park levels in the podium count ~30 m² per space until phase 4.
- Not checked: overshadowing, overlooking, daylight to neighbours, DDO wording, Clause 58 standards beyond setbacks.

Test hook: `window.__fz` (`P` project, `R` results, `max`, `loadSite(doc,{planning:false})`, `setPlanning({zones,overlays})`, `set(fn)`, `fill()`).

## Checking a change

```bash
npm i --no-save clipper-lib@6.4.2     # once
node bench/feas.js                     # 21 lots × MUZ (40 m) / GRZ / RGZ; exits 1 on any problem
```

It checks every floorplate stays inside the site, no control fails after "Fill to limits", and the page throws no errors. Screenshots go to `bench/out/feas/`. If `lib/` changes, also run the car park benchmark (the car park page doesn't use `lib/` yet, but will).

## Stock cores (`data/cores.json`)

From Fraser & Partners sheet A0900 (NCC 2026 set, L01–L26). Groups: `lift` (lift shafts only), `stair` (single or scissor), `linear` (lifts and stairs in one row), `kit` (separate blocks at fixed spacing), `deep` (stair block behind lift block). Service-lift on/off is a `variants` entry, not a separate core. Sizes are overall mm including walls; L23, L24 and L26 widths were added up from their parts with the undimensioned gaps measured off the drawing (±100 mm). The user wants every core flippable both ways and rotatable.


## Phase 2: cores and grid

| Part | File | Notes |
|---|---|---|
| Core data | `data/cores.json` | Each core now has `rows` of `parts` (lift, stair, scissor, riser, lobby, gap) in mm, read off the A0900 sheet; gaps in kit cores are open lobby, not core area. Variants (service lift on) carry their own `rows`. Front (lobby side) is +y in the core's own frame. |
| Cores | `feasibility/cores.js` | `geom` (placed parts with rotate / flip), `needs` (exits and lifts), `place` (nearest fit to a target inside every floorplate, square to the grid, snapped), `suggest` (multi-core cover), `travel`, `checks`, `draw`. |
| Grid | `feasibility/grid.js` | Grid square to the street (or a set angle), origin at the street corner or aligned to a core, columns, core snapping, and the car-park fit check. |

How the core suggestion works (all lots, no site fixes):

1. **Needs.** Effective height = floor of the top storey. Over 25 m: 2 exits (NCC D2D3), at least 2 lifts. Lifts = apartments above ground ÷ apartments per lift (60, editable).
2. **Doors.** Apartment doors are taken on the corridor line, one apartment depth (9 m, editable) in from the facade of every apartment floor.
3. **Travel (D2D5 / D2D6).** A door passes if it is within 6 m of a stair, or two stairs lie in clearly different directions (more than 90° apart) and are 9–45 m apart (45 m = D2D6 maximum for Class 2 as understood; editable as `coreRules.exitsApart`). Straight-line estimate, to be replaced by corridor paths in phase 3.
4. **Cover.** Place the smallest core meeting the needs, then add the same type aimed at the worst-served door until every door passes (max 10). After each addition, every core is re-centred on the doors nearest to it while that lowers the worst shortfall. With 2+ cores the lifts are shared and single-stair cores together count as the 2 exits.
5. **Pick.** Try the three smallest types plus every two-stair core; keep the cover with the least total core area.

Placement speed: candidate centres on a 1 m lattice inside the plate are cached per result and core size, and searched in widening rings around the target (about 4× faster than sorting the whole lattice each time).

Car-park fit: across the bays, how many bays fit between columns (spacing − column) and the spare; along the rows, whether some offset keeps every column line out of the aisles of the bay + aisle + bay module (2L + A), with spacings that would.

Checked by `node bench/feas.js`: every lot under MUZ (40 m), GRZ and RGZ gets a core layout that passes travel, no floorplate leaves the site, no control fails, no page errors.

Known simplifications: the floorplate is the whole envelope, so big sites get many cores (that is the honest answer for one floorplate filling the site; phase 3 apartment layout and courtyards will shrink it). The core library filter judges each core against its share of the needs once there are 2+ cores.

## Phase 3: apartment layout

`feasibility/apartments.js`, Step 6 on the page. Every apartment level group is laid out; the plan shows the typical floor (the apartment group with most floors, or the one picked).

| Setting | Default | Notes |
|---|---|---|
| Brief | Studio 32/38/44 m², 3.6 m, 0% · 1B 48/52/58, 5.6 m, 40% · 2B 68/75/82, 7.6 m, 45% · 3B 92/100/110, 9.6 m, 15% | min / target / max area, minimum facade width, mix by count. A placeholder Melbourne brief until the user sends theirs. |
| Apartment depth | 9 m | Also the corridor line used for doors and the travel check. Clause 58 D27: 9 m for open plan with 2.7 m ceilings. |
| Corridor | 1.6 m | Used when the plate is narrower than two apartments and a corridor (apartments get shallower). |
| Party wall | 0.2 m | Thickness of the cuts. |
| Grid | prefer | Walls prefer grid lines, then half-grid lines; or only on them; or ignore the grid. |

How a floor is cut (general moves, no site fixes):

1. **Strip.** Sellable zone = the floorplate less its inset by the apartment depth, less the cores. The middle (inset) is corridor / common area.
2. **Facade loops.** Each ring of the plate is a loop sampled every 0.4 m plus every grid and half-grid crossing. No wall within one apartment depth of an outside corner (turn over 25°), so corner units wrap the corner.
3. **Areas.** Each edge owns the strip between its corner mitres; the area between consecutive samples is the slab square to the facade (mitred at corners) clipped to that share. Wall thickness × depth is taken off each unit's estimate.
4. **Walls.** Shortest path round the loop: unit cost = 8 × ((area − target) / target)² + a per-type weight − a grid bonus; leftover stretches (core in the way) are allowed as voids; a stretch longer than the biggest unit closes as one oversize unit at a heavy penalty. Several start points; the per-type weights are tuned over 7 rounds so counts approach the mix.
5. **Units.** The strip is cut with walls; each piece (outer ring plus holes) is typed by area: in a wanted type's range = that type; in a 0%-mix type's range or between ranges = nearest type, flagged off brief; above every range = oversize; below 85% of the smallest wanted minimum = leftover (storage / services / balcony). Door = nearest point on the corridor line.
6. **Totals.** Apartments and NSA per group = the layout × floors (exact, replacing the NSA ÷ average estimate). Doors feed the core travel check.

Hand edits (per level group, stored in `P.apt.edits`): drag a wall dot along the facade, double-click a dot to remove the wall, double-click inside an apartment to split it midway between its walls. Walls are kept out of corner zones; corner apartments can't be split. Edits are dropped when the floorplate changes; "Reset walls to automatic" clears them.

Checks: apartments per typical floor and efficiency, mix within 10 points of the brief, off-brief and oversize units, leftover strip, narrow plates, depth over 9 m (D27), corridors / middle over 28% of the floor.

`node bench/feas.js` now also fails a lot with no apartments laid out, and reports apartments, off-brief units and mean typical-floor efficiency per zone. Current: MUZ 40 m 5,251 apartments (off brief 49 of 455 on typical floors, 64% mean efficiency), GRZ 1,262 (39 of 418, 70%), RGZ 1,433 (40 of 334, 70%). Efficiency is low on whole-envelope plates because their middle is wasted; the check says so.

Tried and dropped: placing cores in the plate's middle first (outside the apartment strip). It ran 4-5× slower for ±1 point of efficiency.

## Grid and core changes (with phase 4)

- **Grid centred on the typical tower floor** (`GRID.centreOn`): its middle on a grid line, on a mid-bay, or "auto" (whichever puts the outer grid lines nearer the facade). "Align grid to core" switches to set-by-hand.
- **Cores snap their centre** to a grid line or midway between two, both ways (`GRID.snap`).
- **Corridor**: a band of corridor width (1.6 m default) just inside the apartments, drawn on the plan; a core that doesn't touch it is flagged.

## Phase 4: parking

`feasibility/parking.js`, Step 7 and the Parking view.

**Required** (Clause 52.06-5 Table 1, editable, rounded down): Column A 1 space per 1–2 bed dwelling, 2 per 3+ bed, 1 visitor per 5 dwellings (5 or more), retail 4 per 100 m²; Column B (PPTN area) 1 / 1 / 0 / 3.5. Dwellings by bedrooms come from the apartment layouts (Beds column in the brief; studios count with 1–2 bed). Rates were set from memory and one council memo: planning.vic.gov.au wasn't reachable to confirm them.

**Provided**: basements (auto = as many as the requirement needs, up to 6; or a fixed number) plus every level group whose use is Car park. Each level is laid out by the shared engine (`CARPARK.runSync`) with obstacles:
- columns from the structural grid inside the level outline (0.6 m default),
- every core (they run down through the basements),
- a ramp (6.1 m wide, length = basement floor-to-floor × 6) from the street edge, its foot being the level's entry. Up to three ramp positions are tried (centred in a column bay, at least 8 m apart, preferring a foot with no core in the next 15 m); the one that parks most is kept.

All basements are alike, so one is laid out and repeated. Results are cached by outline, obstacles and entry, and computed after the rest of the page (levels first, then the cost breakdown).

**Engine moves added for obstacles** (all general, none run without obstacles, car park benchmark unchanged at 3,420):
1. Bays and the rule checker reject overlaps with obstacles; infill keeps clear of them.
2. Aisles stop at obstacles; pieces still joined to an accessway are kept.
3. The main accessway keeps the longest clear stretch of its band (≥ 12 m), trying sideways shifts up to half a bay.
4. A bay blocked by an obstacle restarts exactly at the obstacle's far face (so 3 × 2.6 m + 0.6 m column fill an 8.4 m bay), along aisles and along the accessway.
5. Row offsets that put an aisle just clear of a column line, and a row spacing stretched to a whole number of column bays (within 2.5 m, e.g. 16.2 → 16.8 m) so aisles stay between the same column lines.
6. An entry whose driveway is blocked slides along the frontage (up to 4.5 m); the driveway may also jog sideways up to 3 m to reach circulation.

**Checks**: provided vs required, the requirement broken down, basements used, a shortfall even at the maximum, no room for a ramp, and what the columns, cores and ramp cost a basement (the same level laid out without each). When no basement layout fits around the cores and columns, the page says so with that breakdown.

**Known limits**: the engine's model is one straight accessway with aisles off it, so cores in the middle of a basement and narrow tails with columns cost a lot, and a few lots get no basement layout (reported). Next engine moves: aisles that route around a core, a second accessway, and ramps that turn.
