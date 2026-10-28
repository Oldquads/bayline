/* Planning rule data for Victorian sites. Every number here is a starting value the user can
   change: zone schedules, DDOs and recent amendments vary, so the page labels them "check the scheme". */
(function(){
"use strict";
const EDGE_TYPES=["street","side","rear","lane"];

/* Setback presets. Bands apply from the previous band's height up to `upTo` (metres above ground).
   rescode: side and rear setbacks never less than Clause 55 Standard B17
   (1 m, plus 0.3 m per metre of height over 3.6 m up to 6.9 m, plus 1 m per metre over 6.9 m). */
const PRESETS={
  rescode:{label:"ResCode (Clause 55) low-rise",rescode:true,bands:[{upTo:null,street:6,side:1,rear:1,lane:1}]},
  podiumTower:{label:"Podium + tower (DDO style)",rescode:false,bands:[{upTo:11,street:0,side:0,rear:3,lane:0},{upTo:null,street:5,side:4.5,rear:4.5,lane:3}]},
  podiumTower3:{label:"Podium + tower + upper setback",rescode:false,bands:[{upTo:11,street:0,side:0,rear:3,lane:0},{upTo:25,street:5,side:4.5,rear:4.5,lane:3},{upTo:null,street:5,side:6,rear:6,lane:5}]},
  boundary:{label:"Built to boundary",rescode:false,bands:[{upTo:null,street:0,side:0,rear:0,lane:0}]}
};

/* Zone starting values (Victoria Planning Provisions). height/storeys null = set by schedule or overlay. */
const ZONES={
  GRZ:{name:"General Residential Zone",height:11,storeys:3,mandatory:true,garden:true,preset:"rescode",note:"Clause 32.08: 11 m and 3 storeys are mandatory unless the schedule says otherwise. Minimum garden area applies to lots of 400 m² or more."},
  NRZ:{name:"Neighbourhood Residential Zone",height:9,storeys:2,mandatory:true,garden:true,preset:"rescode",note:"Clause 32.09: 9 m and 2 storeys are mandatory unless the schedule says otherwise. Minimum garden area applies."},
  RGZ:{name:"Residential Growth Zone",height:13.5,storeys:null,mandatory:false,garden:false,preset:"rescode",note:"Clause 32.07: building height should not exceed 13.5 m unless the schedule sets another height (discretionary). Clause 58 applies to apartments of 5 or more storeys."},
  MUZ:{name:"Mixed Use Zone",height:null,storeys:null,preset:"podiumTower",note:"No default height. Check the zone schedule and any DDO."},
  C1Z:{name:"Commercial 1 Zone",height:null,storeys:null,preset:"podiumTower",note:"No default height. Height and setbacks normally come from a DDO."},
  C2Z:{name:"Commercial 2 Zone",height:null,storeys:null,preset:"podiumTower",note:"Dwellings are generally prohibited in C2Z. Check the use table."},
  C3Z:{name:"Commercial 3 Zone",height:null,storeys:null,preset:"podiumTower",note:"Check the use table and schedule."},
  ACZ:{name:"Activity Centre Zone",height:null,storeys:null,preset:"podiumTower",note:"Heights and setbacks are set in the ACZ schedule."},
  CCZ:{name:"Capital City Zone",height:null,storeys:null,preset:"podiumTower",note:"Controls come from the CCZ schedule and DDOs (floor area ratio, podium and tower setbacks)."},
  DZ:{name:"Docklands Zone",height:null,storeys:null,preset:"podiumTower",note:"Controls come from the schedule and DDOs."},
  CDZ:{name:"Comprehensive Development Zone",height:null,storeys:null,preset:"podiumTower",note:"Controls come from the incorporated plan."},
  PDZ:{name:"Priority Development Zone",height:null,storeys:null,preset:"podiumTower",note:"Controls come from the schedule and incorporated plan."},
  SUZ:{name:"Special Use Zone",height:null,storeys:null,preset:"podiumTower",note:"Controls come from the schedule."},
  UGZ:{name:"Urban Growth Zone",height:null,storeys:null,preset:"rescode",note:"Controls come from the precinct structure plan."},
  TZ:{name:"Township Zone",height:null,storeys:null,preset:"rescode",note:"Check the schedule."},
  IN1Z:{name:"Industrial 1 Zone",height:null,storeys:null,preset:"boundary",note:"Dwellings are prohibited in industrial zones."}
};
function zoneKey(code){const m=String(code||"").toUpperCase().match(/^[A-Z]+[0-9]?Z|^[A-Z]+/);if(!m)return null;let k=m[0];if(ZONES[k])return k;k=k.replace(/\d+$/,"");return ZONES[k]?k:(ZONES[k+"Z"]?k+"Z":null)}

const OVERLAYS={
  DDO:"Design and Development Overlay: often sets height, podium/street wall height and tower setbacks. Enter its numbers in the controls.",
  HO:"Heritage Overlay: demolition and height may be restricted. Allow for upper-level setbacks from the street.",
  DPO:"Development Plan Overlay: a development plan must be approved first.",
  IPO:"Incorporated Plan Overlay: built form follows the incorporated plan.",
  PO:"Parking Overlay: may change the Clause 52.06 car parking rates.",
  EAO:"Environmental Audit Overlay: an audit is needed before a sensitive use such as dwellings.",
  SBO:"Special Building Overlay: overland flooding, floor levels may be set.",
  LSIO:"Land Subject to Inundation Overlay: flooding, floor levels may be set.",
  PAO:"Public Acquisition Overlay: part of the land may be acquired.",
  VPO:"Vegetation Protection Overlay.",
  SLO:"Significant Landscape Overlay.",
  NCO:"Neighbourhood Character Overlay: may vary ResCode standards.",
  BMO:"Bushfire Management Overlay.",
  DCPO:"Development Contributions Plan Overlay: levies apply.",
  ICO:"Infrastructure Contributions Overlay: levies apply.",
  MAEO:"Melbourne Airport Environs Overlay.",
  AEO:"Airport Environs Overlay.",
  ESO:"Environmental Significance Overlay.",
  CDO:"Comprehensive Development Plan Overlay.",
  SRO:"State Resource Overlay.",
  BAO:"Buffer Area Overlay."
};
function overlayNote(code){const k=String(code||"").toUpperCase().replace(/\d+$/,"");return OVERLAYS[k]||"Check the overlay schedule."}

/* Clause 32.08-4 / 32.09-4 minimum garden area by lot size */
function gardenMin(siteArea){if(siteArea<400)return 0;if(siteArea<500)return 25;if(siteArea<=650)return 30;return 35}

const USES={apartments:{label:"Apartments",eff:0.78},retail:{label:"Retail / commercial",eff:0.9},lobby:{label:"Lobby / services",eff:0},carpark:{label:"Car park",eff:0}};
const LEVEL_TYPES={ground:"Ground",podium:"Podium",tower:"Tower"};

window.RULES={EDGE_TYPES,PRESETS,ZONES,zoneKey,OVERLAYS,overlayNote,gardenMin,USES,LEVEL_TYPES};
})();
