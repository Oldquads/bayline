# Handover: Bayline, 25–27 Oct 2026

This summarises the claude.ai conversation in which Bayline was built, for the next Claude Code session.

## What the user wanted

The project started as reverse-engineering **TestFit** (a parametric site-planning tool), beginning with car parking only. The user picks a Melbourne address and gets car park layout options for that lot. Bay and aisle sizes can be set, and layouts follow Australian / Victorian rules. The user wants a map like **Datum's 峦头 Luántóu** (datumarchi.com/luantou): MapLibre with OpenFreeMap's Positron OpenStreetMap style, smooth zooming, and a floating panel over a full-width map.

## How it evolved (decisions and why)

1. **claude.ai artifact first** (canvas planner, typed boundary). The user then wanted a live map and addresses.
2. **Vicmap via the desktop app's built-in browser:** artifacts can't fetch outside hosts, so the page went through the Claude desktop app's browser (`host:claude_browser`) to reach the Vicmap WFS. It worked, but it was slow (about 1–2 s per tile) and only worked in the desktop app.
3. **The user asked for the Datum look and pushed back** ("Datum was an artifact made with claude too"). We **tested it** with a probe artifact: OpenFreeMap style, tiles and Vicmap all failed with `TypeError: Failed to fetch` inside a claude.ai artifact. Datum is hosted on its own domain.
4. **Moved to GitHub Pages:** I created repo `Oldquads/bayline` through the user's Chrome. The user verified sudo mode and the Claude GitHub app was installed on the repo. Pages deploys from `main`. The map is now MapLibre with live OpenFreeMap Positron tiles, and Vicmap is queried directly (it allows cross-origin requests).
5. **Engine improvements, each from a user complaint, each generalised and benchmarked:**

| Trigger (lot) | Missing move / bug | Fix |
|---|---|---|
| South Yarra (Chapel St) blank patches | Vicmap 5,000-feature cap truncated dense strata tiles | split over-full tiles recursively |
| 535 Little Lonsdale St, 4th bank missing with 1.8 m slack | row offsets only at 6 fixed steps from the bounding box | add offsets flush to every boundary parallel to the aisles, and grid angles square to every lot edge ≥ 8 m |
| Same lot, narrow southern part wasted | no local reorientation | **infill pass**: carry aisles on at narrower Table 2 widths with wider bays, branch dead-end aisles, line bare edges; 8 m clear of the crossover |
| 272-282 Queen St, 14 bays | crossover stuck at the last slider value (95%) in a 4.3 m tail | automatic crossover search (7 points), reset per new lot |
| "Tighten the algorithms in general" | driveway sometimes joined nothing after trimming; bays a few cm outside the lot (clearance shape built from the wrong corners); slow | **rule checker** on every layout; core/crossover split (about 40% faster); strict `inside`; **zones** for lots with inside corners (Box Hill L-shape 265 → 317) |
| Queen St sketch: 4 rows across 30.3 m | Table 2 pairs only used in infill | **stage 2** reruns top angles with 2.8/5.8, 3.0/5.2, 3.2/4.8 pairs (checkbox) |
| Queen St corners empty | infill never used aisle/accessway *ends* | end-pocket bays |
| 617 Chapel St strip by Almeida Cres | short stub aisles cut through bays lining the accessway | drop weak aisles (under 12 m, or 6 bays or fewer) when lining the accessway gives more |

Benchmark history on the original 20 lots: **3,042 → 3,091 → 3,120 → 3,174 → 3,227 bays**. Lot 20 (617 Chapel St) was added later, at 193 bays.

## Current state

- Live and working. The last commit is `0da683e` (weak-aisle removal). This handover adds `CLAUDE.md`, `docs/`, and portable `bench/` scripts.
- Typical timing: first results within about 0.5–3 s; all stages done within about 1–9 s on large lots.
- Saved lots live in the visitor's browser (`localStorage`), not shared between devices.
- The old claude.ai artifact version ("Bayline Car Park Planner", claude.ai/artifact/UFy7XuiM3rJ6b4A8Ldq1SY) is superseded. Its data store has one saved lot.

## Open ideas (offered to the user, not built)

1. **Second crossover:** when aisles end on the street (Queen St: both aisles end on Finlay Alley), give each its own crossover and drop the linking accessway.
2. **Accessway placement preference:** the user's Queen St sketch put the linking accessway along Finlay Alley, near the entry, while the planner put it on the Queen St side for the same count. Prefer the side nearest the crossover on ties, or add a setting.
3. **Small irregular lots (< about 1,500 m²)** still pack poorly (33–37 m² per bay). The single-accessway-plus-rows model fits odd corners badly.
4. **Zone driveway alignment:** the short driveway into a second zone can sit at an angle and clip a bay (Ringwood 1\PS917433, one bay removed by the checker). Align it with the connector.
5. **General remove-and-refill local search:** infill only adds. Removing a few bays to allow a better move (e.g. a branch aisle) isn't tried.
6. **Angled bays in infill** (only 90° and parallel today). Angled options in the main grid exist but are off by default.
7. **Accessible bays:** placed on standard bays with a neighbour as the shared zone. AS/NZS 2890.6 calls for 2.4 × 5.4 m bays with a 2.4 × 5.4 m shared area, and length isn't checked against 5.4 m.
8. **Merging adjoining lots** into one site is not supported.
9. **Speed:** move the search into a Web Worker so the UI never blocks.
10. Not modelled: ramps, grades, levels, columns, sight distance, Clause 52.06-5 parking rates.

## Where things are

- Repo: https://github.com/Oldquads/bayline (public, GitHub Pages on). The user's GitHub account is **Oldquads**.
- claude.ai Project "Testfit Reverse Engineering" has notes `claude/bayline-hosting.md` and `claude/vicmap-lot-lookup.md`. Their content is mirrored in `CLAUDE.md` and `docs/vicmap.md`.
- The user works in Melbourne (AEST/AEDT) and tests in Chrome. A typical loop: they screenshot a layout, mark wasted space in pink or orange, and ask why. Reproduce the lot by reading `localStorage` keys `bayline-v1` (settings + custom ring) and `bayline-sites` from their browser if a browser tool is available, or ask for the address.
