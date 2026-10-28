# Vicmap WFS notes

The endpoint is open, needs no key, and allows cross-origin requests: `https://opendata.maps.vic.gov.au/geoserver/wfs`. Output is GeoJSON via `outputFormat=application/json`, and `CQL_FILTER` is supported. Native CRS is EPSG:7844 (GDA2020). Attribution: Vicmap © State of Victoria, CC BY 4.0.

**Axis order:** with `srsName=EPSG:4326` and `bbox=minLon,minLat,maxLon,maxLat,EPSG:4326`, coordinates are lon,lat. CQL `BBOX()` / `POINT()` on the native CRS take **lat first**.

**Hard cap:** each response holds at most **5,000 features**, whatever `maxFeatures`/`count` says. Dense strata blocks hold more (one 0.006° × 0.005° South Yarra tile has 8,605 lots), so split any tile that returns exactly 5,000.

## Layers used

| Use | typeName | Fields |
|---|---|---|
| Lots | `open-data-platform:v_parcel_mp` | `parcel_spi`, `parcel_road` (Y = road reserve), `parcel_lot_number`, `parcel_plan_number`, `geom` (MultiPolygon) |
| Road centrelines | `open-data-platform:tr_road` | `road_name`, `road_type`, `class_code` (0 freeway, 1 highway, 2 arterial, 3 sub-arterial, 4 collector, 5+ local), `geom` |
| Addresses | `open-data-platform:address` | `ezi_address` ("133-151 WHITEHALL STREET FOOTSCRAY 3011", full street types), `is_primary`, `geom` (Point) |
| City-scale base (no longer used) | `vmlite_tr_road`, `vmlite_hy_water_area`, `vmlite_victoria_polygon`, `vmlite_built_up_area`, `vmlite_public_land`, `vmlite_tr_rail`, `locality_point` | |

## Queries the page makes

- **Lot tile** (lots and roads in one call):
  `version=1.1.0&request=GetFeature&typeName=open-data-platform:v_parcel_mp,open-data-platform:tr_road&propertyName=(parcel_spi,parcel_road,geom)(road_name,road_type,class_code,geom)&outputFormat=application/json&srsName=EPSG:4326&bbox=<lon,lat,lon,lat>,EPSG:4326`
- **Address search:** `typeNames=open-data-platform:address&CQL_FILTER=ezi_address ILIKE '1 MALCOLM%STREET%SOUTH%YARRA%' OR ezi_address ILIKE '%/1 MALCOLM%...'`. Abbreviations (ST, RD, AVE…) are expanded first. The house number is kept whole, so "1" doesn't match "1309/35".
- **Address of a clicked lot:** address points in the lot's bbox (plus 15 m), keeping those inside the lot polygon, `is_primary=Y` first.
- **Street frontage:** the lot edge whose outside (1.5 m out) falls in a road reserve, or within 25 m and 30° of a named, non-tunnel road centreline. The longest such edge is the street edge.

## Planning layers (feasibility page)

| Use | typeName | Fields read |
|---|---|---|
| Zones | `open-data-platform:plan_zone` | `zone_code` (e.g. GRZ1), `zone_description`, `lga` |
| Overlays | `open-data-platform:plan_overlay` | `zone_code` (e.g. DDO10), `zone_description` |

Queried by the lot's bbox (`bbox=...,EPSG:4326`, lon first), then intersected with the lot polygon to get the share of the lot each zone or overlay covers. Field names are matched loosely in `lib/vicmap.js` in case the GeoServer schema differs from the ArcGIS mirror. Not yet confirmed against a live response: check the first real lookup.
