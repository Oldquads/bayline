# Feasibility planner

Live at **https://oldquads.github.io/bayline/feasibility/**. The car park page (`index.html`) is the first piece; the feasibility page wraps it in the full residential workflow.

## The workflow (user's brief)

1. Receive a site → **done** (Vicmap lot from the shared map, saved lots, pasted boundary)
2. Check the town planning envelope requirements → **done** (Vicmap Planning zone + overlays, zone starting values, editable controls)
3. Form up the building envelope → **done** (setback bands by height, ResCode B17 profile, coverage / garden area pull-in)
4. Select a core configuration → **done** (phase 2)
5. Apply a structural grid to the typical floor → **done** (phase 2)
6. Cut the floor into apartments from a sizing brief → phase 3
7. Test the parking arrangement → phase 4 (reuse the car park engine, add columns, core and ramp as obstacles)

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
