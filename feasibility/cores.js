/* Stair and lift cores: library, placed geometry, suggestion and NCC-style checks. */
(function(){
"use strict";
const {area,bbox,pip,diff,shapeArea,offsetShape,centroid,D2R}=window.G;
let LIB=null;
const CATS={linear:"Lifts + stairs in a row",deep:"Stacked / split",kit:"Separate blocks",lift:"Lifts only",stair:"Stairs only"};

async function load(url){
  if(LIB)return LIB;
  const r=await fetch(url);if(!r.ok)throw new Error("cores "+r.status);
  LIB=await r.json();return LIB;
}
const byId=id=>LIB&&LIB.cores.find(c=>c.id===id);
/* a core with its variant applied */
function spec(inst){
  const c=byId(inst.core);if(!c)return null;
  const v=inst.variant&&c.variants&&c.variants[inst.variant];
  return v?{...c,...v,rows:v.rows||c.rows}:c;
}
function label(c){return c.family.replace(/^NB_|_2026$/g,"").replace(/^CORE_/,"").replace(/_/g," ").replace(/\s+/g," ").trim()}

/* placed geometry in site metres. Core frame: width along x, rows stacked from +y (first row) down. */
function geom(inst){
  const c=spec(inst);if(!c)return null;
  const W=c.w/1000,D=c.d/1000,t=(inst.rot||0)*D2R,ct=Math.cos(t),st=Math.sin(t);
  const fx=inst.fx?-1:1,fy=inst.fy?-1:1;
  const T=(x,y)=>{x*=fx;y*=fy;return {x:inst.x+x*ct-y*st,y:inst.y+x*st+y*ct}};
  const rect=(x0,y0,x1,y1)=>{const r=[T(x0,y0),T(x1,y0),T(x1,y1),T(x0,y1)];return area(r)<0?r.reverse():r};
  const parts=[];let y=D/2;
  for(const row of c.rows){
    const d=row.d/1000;let x=-W/2;
    for(const p of row.parts){const w=p.w/1000;parts.push({t:p.t,poly:rect(x,y-d,x+w,y),
      // stair treads run along the part's long side; keep the axis for drawing
      ax:T(1,0),o:T(0,0)});x+=w}
    y-=d;
  }
  const outline=rect(-W/2,-D/2,W/2,D/2);
  const solid=parts.filter(p=>p.t!=="gap");
  return {c,outline,parts,area:solid.reduce((m,p)=>m+Math.abs(area(p.poly)),0),lifts:c.lifts,stairs:c.stairs,front:[T(-W/2,D/2),T(W/2,D/2)],dir:{x:Math.cos(t),y:Math.sin(t)}};
}

/* NCC numbers used here (NCC 2022 Volume One; confirm with the building surveyor):
   D2D3 — 2 exits from every storey when effective height is over 25 m.
   D2D5 — in Class 2, a sole-occupancy unit's entrance door within 6 m of an exit, or of a point
   where travel in different directions to 2 exits is available.
   Effective height = floor of the topmost storey above the ground storey. */
function effectiveHeight(R){const gs=R.groups.filter(g=>g.floors);if(!gs.length)return 0;const top=gs[gs.length-1];return top.z1-top.ftf}
function needs(P,R){
  const eh=effectiveHeight(R);
  const apts=R.groups.reduce((m,g)=>m+(g.floors?g.apts*(g.floors-(g.storeyFrom===1?1:0))/g.floors:0),0);
  const perLift=Math.max(10,+P.coreRules.aptsPerLift||60);
  const stairs=eh>25?2:1;
  let lifts=R.storeys>1?Math.max(1,Math.ceil(apts/perLift)):0;if(eh>25)lifts=Math.max(lifts,2);
  return {eh,stairs,lifts,apts:Math.round(apts)};
}

/* the plate every core must fit: intersection of all floorplates (the core runs top to bottom) */
function smallestPlate(R){const gs=R.groups.filter(g=>g.floors&&g.fp.length);if(!gs.length)return [];return gs.reduce((m,g)=>g.fpArea<shapeArea(m)?g.fp:m,gs[0].fp)}
const fits=(geo,plates)=>plates.every(p=>shapeArea(diff([geo.outline],p))<0.05);
/* where a core may stand: inside every floorplate it passes through (cached per result) */
let zoneFor=null,zoneShape=null,corrShape=null,withinShape=null;
function coreZone(R){if(zoneFor===R)return zoneShape;const ps=R.groups.filter(g=>g.floors&&g.fp.length).map(g=>g.fp);
  let z=ps[0]||[];for(const p of ps.slice(1))z=window.G.inter(z,p);zoneFor=R;zoneShape=z;corrShape=null;return z}
/* where the corridor can be on the typical apartment floor: more than one apartment depth from every facade.
   A core must touch it so the lobby opens onto the corridor. */
function corridorZone(P,R){coreZone(R);if(corrShape)return corrShape;
  const gs=R.groups.filter(g=>g.floors&&g.use==="apartments"&&g.fp.length);if(!gs.length)return corrShape=[];
  const t=gs.reduce((m,g)=>g.floors>m.floors||(g.floors===m.floors&&g.z0>m.z0)?g:m,gs[0]);
  // as the apartment layout does: the corridor of each wing (straight rows or H plan), or for other plates
  // the zone beyond one apartment depth from every facade
  if(window.APTS){const z=window.APTS.coreZones(P,t.fp);withinShape=z.within;return corrShape=z.touch}
  withinShape=[];return corrShape=offsetShape(t.fp,-aptDepth(P))}
/* A basement ramp needs a clear lane in from the street: ramp width + 1 m wide, ramp length + 6 m deep.
   True when some lane along the frontage misses every core (or when no lane fits even with no cores). */
function rampLane(P){
  const s=P.site,n=s.pts.length,i=Math.min(s.front||0,n-1),a=s.pts[i],b=s.pts[(i+1)%n],L=Math.hypot(b.x-a.x,b.y-a.y);
  const t={x:(b.x-a.x)/L,y:(b.y-a.y)/L},nw=window.G.inward(s.pts,i,Math.sign(area(s.pts))||1);
  const pk=P.park||{},w=(+pk.rampW||6.1)+1,len=Math.max(8,(+pk.bFtf||3)*(+pk.rampGrade||6))+6,lanes=[];
  for(let d=w/2;d<=L-w/2;d+=0.5){const c={x:a.x+t.x*d,y:a.y+t.y*d};
    const r=[{x:c.x-t.x*w/2,y:c.y-t.y*w/2},{x:c.x+t.x*w/2,y:c.y+t.y*w/2},{x:c.x+t.x*w/2+nw.x*len,y:c.y+t.y*w/2+nw.y*len},{x:c.x-t.x*w/2+nw.x*len,y:c.y-t.y*w/2+nw.y*len}];
    lanes.push(area(r)<0?r.reverse():r)}
  return lanes;
}
const rampOK=(P,geos)=>{if(P.park&&P.park.basements===0)return true;const lanes=rampLane(P);
  return !lanes.length||lanes.some(r=>geos.every(g=>shapeArea(window.G.inter([r],[g.outline]))<0.05))};
const inShape=(p,sh)=>sh.some(r=>area(r)>0&&pip(p,r))&&!sh.some(r=>area(r)<0&&pip(p,r));

let latFor=null;const lattice=new Map();
/* place a core inside the plates: nearest spot to the plate centre, square to the grid, snapped if possible */
/* A split core (stair block and lift block with a lobby gap between) straddles the corridor: the corridor
   runs through the gap. Other cores sit beside the corridor. */
function gapOffset(s){if(!s)return null;let y=s.d/2000;for(const r of s.rows){const d=r.d/1000;if(r.parts.length===1&&r.parts[0].t==="gap")return y-d/2;y-=d}return null}
const isSplit=inst=>gapOffset(spec(inst))!=null;
function place(P,R,inst,others,target){
  if(isSplit(inst)){const p=placeSplit(P,R,inst,others,target);if(p)return p}
  return placeIn(P,R,inst,others,target,true)||placeIn(P,R,inst,others,target,false)}
/* split core on a wing's corridor centre line, square to the wing, centred on a grid line or mid-bay,
   nearest the target (the plate's middle, or the doors a new core has to serve) */
function placeSplit(P,R,inst,others,target){
  const gs=R.groups.filter(g=>g.floors&&g.use==="apartments"&&g.fp.length);if(!gs.length||!window.APTS)return null;
  const t=gs.reduce((m,g)=>g.floors>m.floors||(g.floors===m.floors&&g.z0>m.z0)?g:m,gs[0]);
  let wings=window.APTS.wingLines(P,t.fp);
  // a core for given doors goes in their own wing; a piece of floor that isn't a wing takes another kind of core
  if(target){const own=wings.find(w=>pip(target,w.pc[0]));if(own)wings=[own]}
  wings=wings.filter(w=>!w.none);if(!wings.length)return null;
  const s=spec(inst),off=gapOffset(s),half=s.w/2000,plates=[coreZone(R)],ga=window.GRID.angle(P)/D2R;
  const avoid=(others||[]).map(geom).filter(Boolean);
  const outer=t.fp.filter(r=>area(r)>0).sort((a,b)=>area(b)-area(a))[0],c0=target||centroid(outer);
  let best=null;
  for(const w of wings){const hb=w.sp/2,rot=w.alongU?ga:ga+90,sg=w.alongU?1:-1;
    for(let k=Math.ceil((w.a0+half)/hb);k*hb<=w.a1-half+1e-6;k++)for(const fy of [false,true]){
      // the core's centre sits so the gap's middle is on the corridor's centre line
      const c=w.W2(k*hb,w.mid-sg*(fy?-off:off)),i={...inst,x:c.x,y:c.y,rot,fx:false,fy},g=geom(i);
      const dd=Math.hypot(c.x-c0.x,c.y-c0.y);if(best&&dd>=best.d)continue;
      if(!fits(g,plates))continue;
      if(!avoid.every(o=>shapeArea(window.G.inter([g.outline],[o.outline]))<0.05)||!rampOK(P,[...avoid,g]))continue;
      best={inst:i,d:dd}}}
  return best&&best.inst;
}
function placeIn(P,R,inst,others,target,useCorr){
  const plates=[coreZone(R)];
  const top=smallestPlate(R);if(!top.length)return null;
  const outs=top.filter(r=>area(r)>0),outer=outs.slice().sort((a,b)=>area(b)-area(a))[0];
  const avoid=(others||[]).map(geom).filter(Boolean);
  const bb=bbox(outs.flat()),ga=window.GRID.angle(P)/D2R,corr=useCorr?corridorZone(P,R):[];
  // the core opens onto the corridor but doesn't cut it in two
  // H wings: the core sits mostly in the corridor band and the inner tier, so the spurs can run either side of it
  const within=useCorr&&withinShape?withinShape:[];
  // a core never sits on the corridor: its stair and lift blocks stay off it, and it touches the corridor's edge
  const band=corridorZone(P,R),near=band.length?offsetShape(band,0.4):[];
  const solid=g=>g.parts.filter(p=>p.t!=="gap").map(p=>p.poly);
  const onCorr=g=>(!band.length||shapeArea(window.G.inter(solid(g),band))<0.2)&&(!corr.length||shapeArea(window.G.inter([g.outline],near))>0.5
    &&(!within.length||shapeArea(window.G.inter([g.outline],within))>=0.6*Math.abs(area(g.outline))));
  // aim for the plate centre, or for a second core, halfway to the corner furthest from the others
  let c0=centroid(outer);
  if(target)c0=target;
  else if(avoid.length){const far=outer.reduce((m,p)=>{const d=Math.min(...avoid.map(g=>Math.hypot(p.x-g.outline[0].x,p.y-g.outline[0].y)));return d>m.d?{p,d}:m},{d:-1}).p;c0={x:(c0.x+far.x*2)/3,y:(c0.y+far.y*2)/3}}
  const clear=g=>avoid.every(o=>shapeArea(window.G.inter([g.outline],[o.outline]))<0.05)&&rampOK(P,[...avoid,g]);
  let best=null;
  for(const rot of [ga,ga+90]){
    const g0=geom({...inst,x:0,y:0,rot});if(!g0)return null;
    // candidate centres on a 1 m lattice inside the plate, cached per result and core size
    const key=Math.min(g0.c.w,g0.c.d);
    if(latFor!==R){latFor=R;lattice.clear()}
    if(!lattice.has(key)){const inner=offsetShape(top,-key/2000),pts=[];
      for(let x=bb.x0;x<=bb.x1;x+=1)for(let y=bb.y0;y<=bb.y1;y+=1){const p={x,y};if(inShape(p,inner))pts.push(p)}
      lattice.set(key,pts)}
    // nearest candidates first, searched in widening rings so only a few get sorted
    const all=lattice.get(key);let tried=0,lo=-1;
    search:for(const hi of [3,8,16,32,1e9]){
      if(best&&lo>=best.d)break;
      const ring=[];for(const p of all){const d=Math.hypot(p.x-c0.x,p.y-c0.y);if(d>lo&&d<=hi)ring.push({p,d})}
      ring.sort((a,b)=>a.d-b.d);lo=hi;
      for(const {p,d} of ring){
        if(best&&d>=best.d)break search;if(++tried>400)break search;
        let i={...inst,x:p.x,y:p.y,rot},g=geom(i);
        if(!fits(g,plates)||!clear(g)||!onCorr(g))continue;
        if(P.grid.snap){const s=window.GRID.snap(P,i,g),j={...i,...s},gs=geom(j);if(fits(gs,plates)&&clear(gs)&&onCorr(gs)){i=j;g=gs}}
        best={inst:i,d};break search;
      }
    }
  }
  return best&&best.inst;
}
/* Where apartment doors are: the laid-out apartments' doors when the floor has a layout; otherwise
   on the corridor line, one apartment depth in from each facade of every apartment floor (or the
   middle of the plate where it is thinner than two apartments). */
const aptDepth=P=>+(P.apt&&P.apt.depth)||9;
function doorPoints(P,R){
  const depth=aptDepth(P),pts=[],seen=new Set();
  for(const gr of R.groups){if(!gr.floors||gr.use!=="apartments"||!gr.fp.length)continue;
    if(gr.layout){for(const u of gr.layout.units)pts.push({...u.door,g:gr.name});continue}
    let line=offsetShape(gr.fp,-depth);
    if(!line.length)line=offsetShape(gr.fp,-depth/2);
    if(!line.length)line=gr.fp;
    for(const r of line)for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(L/2));
      for(let j=0;j<n;j++){const q={x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n,g:gr.name},k=Math.round(q.x)+","+Math.round(q.y);if(!seen.has(k)){seen.add(k);pts.push(q)}}
    }}
  return pts;
}
/* every stair in the placed cores, with its centre */
const stairList=cores=>cores.map(geom).filter(Boolean).flatMap(g=>g.parts.filter(p=>p.t==="stair"||p.t==="scissor").map(p=>({poly:p.poly,c:centroid(p.poly)})));
/* NCC D2D5 for Class 2: a sole-occupancy unit's entrance door within 6 m of an exit, or of a point
   from which travel in different directions to 2 exits is available. A door counts as at such a
   point when two stairs lie in clearly different directions (more than 90° apart) and those stairs
   are between 9 m and the D2D6 maximum apart (45 m assumed for Class 2; editable).
   Returns the worst shortfall: 0 when every door passes. Distances are straight lines. */
const fireEng=P=>P.coreRules.fire==="fe";
const travelLim=P=>fireEng(P)?(+P.coreRules.feTravel||25):(+P.coreRules.travel||6);
function travel(P,R,cores,pts){
  const st=stairList(cores);if(!st.length)return null;
  pts=pts||doorPoints(P,R);
  const lim=travelLim(P),maxApart=+P.coreRules.exitsApart||45,fe=fireEng(P);
  // a door is served only by stairs in its own wing (separate buildings on the floor don't share exits)
  const rings={};for(const g of R.groups)if(g.floors&&g.fp.length)rings[g.name]=g.fp.filter(r=>area(r)>0);
  let worst=0,at=null,far=0,choice=0;
  for(const p of pts){
    const wing=(rings[p.g]||[]).find(r=>pip(p,r));
    const mine=wing?st.filter(s=>pip(s.c,wing)):st;
    if(!mine.length){const short=1e3;if(short>worst){worst=short;at=p}continue}
    const ds=mine.map(s=>({s,d:distToPoly(p,s.poly)})).sort((a,b)=>a.d-b.d);
    if(ds[0].d<=lim){far=Math.max(far,ds[0].d);continue}
    if(fe){const short=ds[0].d-lim;if(short>worst){worst=short;at=p}continue}
    const a=ds[0],va={x:a.s.c.x-p.x,y:a.s.c.y-p.y};
    const ok=ds.slice(1).some(b=>{const vb={x:b.s.c.x-p.x,y:b.s.c.y-p.y},cos=(va.x*vb.x+va.y*vb.y)/((Math.hypot(va.x,va.y)*Math.hypot(vb.x,vb.y))||1),apart=Math.hypot(a.s.c.x-b.s.c.x,a.s.c.y-b.s.c.y);return cos<0&&apart>=9&&apart<=maxApart});
    if(ok){choice++;continue}
    const short=ds[0].d-lim;if(short>worst){worst=short;at=p}
  }
  return {worst,where:at?at.g:"",p:at,far,choice,doors:pts.length,lim,fe};
}

/* Smallest core that meets the exit and lift needs, then more of the same until every apartment door
   is within the travel limit: each new core aims at the worst-served door, then every core is
   re-centred on the doors it serves while that helps. With 2 or more cores the lifts are shared and,
   above 25 m, single-stair cores together give the 2 exits. Returns the placed cores. */
function suggest(P,R,maxCores=10){
  if(!LIB)return [];const n=needs(P,R);
  const pts=doorPoints(P,R),wings=corridorZone(P,R)&&smallestPlate(R).filter(r=>area(r)>0).length;
  const pick=k=>{
    const opts=[];
    for(const c of LIB.cores)for(const variant of [null,...Object.keys(c.variants||{})]){
      const s=spec({core:c.id,variant});
      if(s.cat==="lift"||s.cat==="stair")continue;
      if(s.stairs<(k>=2&&wings<2?1:n.stairs)||s.lifts<Math.min(3,Math.max(n.lifts?1:0,Math.ceil(n.lifts/k))))continue;
      opts.push({core:c.id,variant,area:s.w*s.d/1e6});
    }
    return opts.sort((a,b)=>a.area-b.area);
  };
  const cover=type=>{
    const first=place(P,R,{id:"c1",core:type.core,variant:type.variant,fx:false,fy:false});if(!first)return null;
    let cores=[first];
    const worst=cs=>{const t=travel(P,R,cs,pts);return t?t.worst:0};
    for(let k=1;k<maxCores&&worst(cores)>0.05;k++){
      const t=travel(P,R,cores,pts),w0=t.worst;
      const p=place(P,R,{...first,id:"c"+(k+1)},cores,t.p);if(!p)break;
      const next=recentre(P,R,[...cores,p],pts);
      // keep a new core only if it brings the furthest door meaningfully closer
      if(worst(next)>w0-0.5)break;
      cores=next;
    }
    return cores;
  };
  // try the smallest few types plus every two-stair core; keep the least total core area that passes
  const pass=cs=>{const t=travel(P,R,cs,pts);return !t||t.worst<0.05};
  const total=cs=>cs.reduce((m,c)=>m+geom(c).area,0)+(pass(cs)?0:1e6)+cs.length*5;
  // default (user): the split core, 2 lifts (L21), or its 3-lift version where one core must carry more lifts
  const dflt=P.coreRules.core||"L21";
  if(byId(dflt)){const cs=cover({core:dflt,variant:null});
    if(cs&&cs.length){const per=Math.ceil(n.lifts/cs.length),big=dflt==="L21"&&per>2&&byId("L22")?cover({core:"L22",variant:null}):null;
      return (big&&big.length?big:cs).map((c,i)=>({...c,id:"c"+(i+1)}))}}
  let best=null;
  for(let k=1,round=0;round<3;round++){
    const opts=pick(k),types=[...opts.slice(0,3),...opts.filter(o=>spec(o).stair==="two separate")];
    let got=null;
    for(const o of types){const cs=cover(o);if(cs&&(!got||total(cs)<total(got)))got=cs}
    if(!got)break;
    if(!best||total(got)<total(best))best=got;
    if(got.length<=k)break;k=got.length;
  }
  return (best||[]).map((c,i)=>({...c,id:"c"+(i+1)}));
}
/* move each core towards the middle of the doors closest to it, keeping moves that lower the worst travel */
function recentre(P,R,cores,pts){
  const score=cs=>{const t=travel(P,R,cs,pts);return t?t.worst:0};
  let cur=cores,s0=score(cur);
  for(let it=0;it<3;it++){
    const geos=cur.map(geom),own=cur.map(()=>[]);
    for(const p of pts){let bi=0,bd=1e9;geos.forEach((g,i)=>{const d=distToPoly(p,g.outline);if(d<bd){bd=d;bi=i}});own[bi].push(p)}
    let moved=false;
    for(let i=0;i<cur.length;i++){
      if(!own[i].length)continue;const b=bbox(own[i]),target={x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2};
      const others=cur.filter((_,j)=>j!==i),q=place(P,R,cur[i],others,target);if(!q)continue;
      const next=cur.slice();next[i]=q;const s1=score(next);
      if(s1<s0-0.2){cur=next;s0=s1;moved=true}
    }
    if(!moved)break;
  }
  return cur;
}

function checks(P,R,cores){
  const out=[],n=needs(P,R),f1=v=>(Math.round(v*10)/10).toLocaleString();
  const geos=cores.map(geom).filter(Boolean);
  if(!geos.length){out.push(["warn","No core placed. Pick one from the core library."]);return out}
  const stairs=geos.reduce((m,g)=>m+g.stairs,0),lifts=geos.reduce((m,g)=>m+g.lifts,0);
  out.push(stairs>=n.stairs?["ok",`${stairs} stair${stairs>1?"s":""} for an effective height of ${f1(n.eh)} m (${n.stairs===2?"over 25 m: 2 exits needed, NCC D2D3":"25 m or less: 1 exit can serve, subject to D2D5 travel distance"}).`]
    :["bad",`Effective height ${f1(n.eh)} m is over 25 m: every storey needs 2 exits (NCC D2D3). Use a scissor-stair or two-stair core.`]);
  if(n.lifts)out.push(lifts>=n.lifts?["ok",`${lifts} lift${lifts>1?"s":""} for about ${n.apts} apartments above ground (target ${P.coreRules.aptsPerLift} per lift${n.eh>25?", at least 2 above 25 m":""}).`]
    :["warn",`${lifts} lift${lifts===1?"":"s"} for about ${n.apts} apartments above ground: aim for ${n.lifts} (${P.coreRules.aptsPerLift} per lift${n.eh>25?", at least 2 above 25 m":""}).`]);
  if(n.eh>25)out.push(["info","Over 25 m effective height the NCC also calls for an emergency lift, sprinklers and stair pressurisation. Allow for them in the core."]);
  else if(n.eh>12)out.push(["info","Over 12 m effective height at least one lift needs a stretcher facility (NCC Part E3)."]);
  // fit
  for(const [k,g] of geos.entries())for(const gr of R.groups){
    if(!gr.floors||!gr.fp.length)continue;
    const o=shapeArea(diff([g.outline],gr.fp));
    if(o>0.05)out.push(["bad",`Core ${k+1} (${cores[k].core}) sits ${f1(o)} m² outside the ${gr.name} floorplate. Move it or pick a smaller core.`]);
  }
  for(let a=0;a<geos.length;a++)for(let b=a+1;b<geos.length;b++){const o=shapeArea(window.G.inter([geos[a].outline],[geos[b].outline]));if(o>0.05)out.push(["bad",`Cores ${a+1} and ${b+1} overlap.`])}
  // rough travel: furthest apartment door from a stair
  const t=travel(P,R,cores),laid=R.groups.some(g=>g.layout),depth=aptDepth(P),lim=travelLim(P),apart=+P.coreRules.exitsApart||45;
  if(t&&t.fe)out.push(!t.p?["ok",`Every apartment door (${laid?"from the apartment layout":`taken on a corridor ${depth} m in from the facade`}) is within ${lim} m of a stair in its own wing (straight line; furthest ${f1(t.far)} m). Beyond the 6 m of NCC D2D5 this relies on a fire-engineered performance solution, as in the reference schemes; confirm with the fire engineer.`]
    :["warn",`Apartment doors on ${t.where} are ${t.worst>=999?"in a wing with no stair":`up to ${f1(t.worst+lim)} m from a stair`}: the fire-engineered limit set here is ${lim} m. Add or move a core.`]);
  else if(t)out.push(!t.p?["ok",`Every apartment door (${laid?"from the apartment layout":`taken on a corridor ${depth} m in from the facade`}) is within ${lim} m of a stair${t.choice?`, or between two stairs in different directions no more than ${apart} m apart`:""} (NCC D2D5 / D2D6, straight-line estimate).`]
    :["warn",`Apartment doors on ${t.where} are up to ${f1(t.worst+lim)} m from a stair with no second stair the other way within ${apart} m; NCC D2D5 allows ${lim} m to an exit or point of choice. Add or move a core, or plan a fire-engineered solution.`]);
  return out;
}
function distToPoly(p,poly){
  if(pip(p,poly))return 0;let best=1e9;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy||1e-9,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy))}
  return best;
}

/* drawing (plan): parts filled by type, treads on stairs, crosses on lifts */
function draw(g,T,geo,col,k,sel){
  const path=r=>{g.beginPath();r.forEach((p,i)=>{const q=T(p);i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)});g.closePath()};
  for(const p of geo.parts){
    path(p.poly);
    if(p.t==="gap"){g.save();g.setLineDash([3,3]);g.lineWidth=0.8;g.strokeStyle=col.muted;g.stroke();g.restore();continue}
    g.fillStyle=p.t==="lift"?col.lift:p.t==="riser"?col.riser:p.t==="lobby"?col.lobby:col.stair;g.fill();
    g.lineWidth=0.8;g.strokeStyle=col.ink;g.stroke();
    const q=p.poly.map(T);
    if(p.t==="lift"){g.beginPath();g.moveTo(q[0].x,q[0].y);g.lineTo(q[2].x,q[2].y);g.moveTo(q[1].x,q[1].y);g.lineTo(q[3].x,q[3].y);g.lineWidth=0.6;g.stroke()}
    if(p.t==="stair"||p.t==="scissor"){
      // treads across the long side
      const L01=Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y),L12=Math.hypot(q[2].x-q[1].x,q[2].y-q[1].y);
      const [a,b,c2,d]=L01>=L12?[q[0],q[1],q[2],q[3]]:[q[1],q[2],q[3],q[0]];
      const n=Math.max(4,Math.round(Math.max(L01,L12)/5));g.lineWidth=0.5;g.beginPath();
      for(let i=1;i<n;i++){const t=0.15+0.7*i/n;g.moveTo(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);g.lineTo(d.x+(c2.x-d.x)*t,d.y+(c2.y-d.y)*t)}
      g.stroke();
      if(p.t==="scissor"){g.beginPath();g.moveTo(a.x+(d.x-a.x)/2,a.y+(d.y-a.y)/2);g.lineTo(b.x+(c2.x-b.x)/2,b.y+(c2.y-b.y)/2);g.lineWidth=1.4;g.stroke()}
    }
  }
  path(geo.outline);g.lineWidth=sel?2.6:1.6;g.strokeStyle=sel?col.accent:col.ink;g.stroke();
  const f0=T(geo.front[0]),f1=T(geo.front[1]);g.beginPath();g.moveTo(f0.x,f0.y);g.lineTo(f1.x,f1.y);g.lineWidth=3;g.strokeStyle=col.accent;g.stroke();
  if(k!=null){const c=T(centroid(geo.outline));g.font=`600 11px "Barlow",sans-serif`;g.textAlign="center";g.textBaseline="middle";const t=`C${k+1}`,w=g.measureText(t).width+6;g.fillStyle=col.bg;g.fillRect(c.x-w/2,c.y-7,w,14);g.fillStyle=col.ink;g.fillText(t,c.x,c.y)}
}

window.CORES={travel,fits:(inst,R)=>fits(geom(inst),R.groups.filter(g=>g.floors&&g.fp.length).map(g=>g.fp)),load,get lib(){return LIB},byId,spec,label,geom,needs,effectiveHeight,place,suggest,checks,draw,CATS};
})();
