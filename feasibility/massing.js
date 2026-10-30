/* Massing: which part of the setback envelope the apartment floors actually fill.
   Filling the whole envelope gives deep plates with dark middles, scattered cores and a corridor
   ring round nothing. Built schemes (see docs/feasibility.md, "Lessons from the reference drawings")
   use wings of a standard depth instead: apartment + corridor + apartment (double-loaded), laid as
   parallel bars with a gap between them, as a courtyard ring round the site, or, where the envelope
   is compact, the full plate round a central core. Each is scored on sellable strip less dark floor
   and the core it needs; "auto" keeps the best. The choice is made on the typical apartment floor
   and applied to every apartment floor, so the walls stack. */
(function(){
"use strict";
const {area,bbox,diff,inter,shapeArea,offsetShape}=window.G;
const CORE=45;   // m² of floor a core takes (lifts, stair, lobby), for scoring only

function defaults(){return {mode:"auto",gap:9,towers:"auto",podium:"shared",plan:"auto"}}
const PLANS={auto:"Auto",straight:"Straight",h:"H (deep floors)"};
const TOWERS={auto:"Auto",1:"1 tower",2:"2 towers",3:"3 towers",4:"4 towers"};
const PODIUMS={shared:"Shared",separate:"Separate per tower"};
const MODES={auto:"Best of the options",bars:"Double-loaded bars",court:"Courtyard (wings round the edge)",fill:"Fill the envelope"};
function depths(P){const d=+(P.apt&&P.apt.depth)||8,cw=+(P.apt&&P.apt.corridor)||1.6;return {d,cw,D:2*d+cw}}
const outers=sh=>sh.filter(r=>area(r)>0);
/* each outer ring with the holes inside it, as its own shape */
function pieces(sh){const hs=sh.filter(r=>area(r)<0);return outers(sh).map(o=>[o,...hs.filter(h=>window.G.pip(h[0],o))])}

/* Sellable strip (one apartment depth in from every facade), dark floor beyond the corridor,
   and a core per piece: taken from the dark floor first, then from the strip. */
function score(P,sh){
  const {d,cw}=depths(P),A=shapeArea(sh);if(A<1)return -1e9;
  let s=0;
  for(const pc of pieces(sh)){
    // H wing (deeper than two apartments and a corridor): all sellable but the corridor, the two spurs, the
    // core, and any inner tier too far from an end window (more than 1.5 bays) to be an apartment
    const b=window.APTS&&window.APTS.barOf(P,pc);
    // the deep tier's corner apartments want the sun: an H whose deep side doesn't face north scores less
    if(b&&b.kind==="H"){const L=b.a1-b.a0,dark=b.ti*Math.max(0,L-2*cw-7-3*b.sp),o=b.W2(0,0),n=b.W2(0,b.deepHigh?1:-1),north=n.y-o.y,a=shapeArea(pc);
      s+=a-cw*L-2*cw*b.ti-CORE-dark*1.5-0.12*a*(1-Math.max(0,north));continue}
    // apartments deepen to keep the corridor at its width (as the layout does)
    const de=window.APTS?Math.max(d,window.APTS.depthFor(P,pc).d):d;
    // floor deeper than the brief's apartment depth is worth less (D27: rooms far from a window)
    const a=shapeArea(pc),in1=offsetShape(pc,-de),stripE=a-shapeArea(in1),stripD=de>d?a-shapeArea(offsetShape(pc,-d)):stripE,strip=stripD+0.6*(stripE-stripD),dark=in1.length?shapeArea(offsetShape(pc,-(de+cw))):0;
    s+=strip-Math.max(0,CORE-dark)-Math.max(0,dark-CORE)*1.5;
  }
  return s;
}
/* keep pieces nearly a full wing deep and big enough for a few apartments */
function keep(P,sh){
  // a wing must reach nearly its full depth somewhere, so it has a corridor between two rows of apartments
  const {D}=depths(P),w=D/2-0.5;
  // shave off slivers (under 2 m wide) left where a wing meets a setback line
  const o=sh.length?inter(offsetShape(offsetShape(sh,-1),1),sh):sh;
  return pieces(o).filter(pc=>shapeArea(pc)>=150&&offsetShape(pc,-w).length).flat()}

/* parallel bars running at angle t: bands D wide with the gap between, slid across to the best phase */
function bandsAt(ref,t,phase,P,D){
  const gap=Math.max(3,+P.mass.gap||9),c=Math.cos(t),s=Math.sin(t);
  const pts=ref.flat(),us=pts.map(p=>p.x*c+p.y*s),vs=pts.map(p=>-p.x*s+p.y*c);
  const u0=Math.min(...us)-5,u1=Math.max(...us)+5,v1=Math.max(...vs);
  const out=[];
  for(let v=Math.min(...vs)+phase;v<v1-2;v+=D+gap)out.push([v,v+D]);
  return {t,bands:out,u0,u1};
}
function bandShape(B,pts){
  const c=Math.cos(B.t),s=Math.sin(B.t),W=(u,v)=>({x:u*c-v*s,y:u*s+v*c});
  let u0=B.u0,u1=B.u1;if(pts&&pts.length){const us=pts.map(p=>p.x*c+p.y*s);u0=Math.min(u0,Math.min(...us)-5);u1=Math.max(u1,Math.max(...us)+5)}
  return B.bands.map(([a,b])=>{const r=[W(u0,a),W(u1,a),W(u1,b),W(u0,b)];return area(r)<0?r.reverse():r});
}
/* bars from the standard wing (2 × depth + corridor) up to the H plan's depth, 1 m steps */
function barOptions(P,ref){
  const {D,cw}=depths(P),gap=Math.max(3,+P.mass.gap||9),t0=window.GRID.angle(P),out=[];
  const dMax=Math.max(+(P.apt&&P.apt.depth)||8,+(P.apt&&P.apt.maxDepth)||12),widths=[];
  // up to the H plan's depth (see apartments.js)
  const wMax=window.APTS?window.APTS.HDEPTH(P):2*dMax+cw;
  for(let w=D;w<=wMax+1e-6;w+=1)widths.push(w);
  for(const t of [t0,t0+Math.PI/2]){
    // for each number of towers (separate wings): the best bars of any depth, and the best of plain
    // double-loaded depth (no H plan), for the final comparison by layout
    const best=new Map(),wRows=2*dMax+cw+0.6;
    const put=(k,o)=>{const c=best.get(k);if(!c||o.score>c.score)best.set(k,o)};
    const tryPhase=(ph,w)=>{const B=bandsAt(ref,t,ph,P,w),sh=keep(P,inter(ref,bandShape(B)));if(!sh.length)return;const n=outers(sh).length;if(n>4)return;
      const o={kind:"bars",B,shape:sh,score:score(P,sh),phase:ph,w,n,h:w>wRows};put("a"+n,o);if(w<=wRows)put("r"+n,o)};
    for(const w of widths)for(let ph=-w+1;ph<gap+1;ph+=1.5)tryPhase(ph,w);
    for(const o of [...best.values()]){const p0=o.phase,w0=o.w;for(const dp of [-1,-0.5,0.5,1])tryPhase(p0+dp,w0)}
    for(const o of new Set(best.values()))out.push(o);
  }
  return out;
}
function courtOption(P,ref){
  const {D}=depths(P),gap=Math.max(3,+P.mass.gap||9);
  // the courtyard is what is left inside the wings: it must be at least the gap across
  if(!offsetShape(ref,-(D+gap/2)).length)return null;
  const sh=keep(P,diff(ref,offsetShape(ref,-D)));if(!sh.length)return null;
  return {kind:"court",shape:sh,score:score(P,sh),n:outers(sh).length};
}

/* Choose the massing on the reference (typical) floor. Cached by plate and settings. */
const cache=new Map();
function choose(P,ref){
  const mode=P.mass.mode||"auto",{d,cw}=depths(P);
  const want=P.mass.towers==null||P.mass.towers==="auto"?0:+P.mass.towers;
  const key=JSON.stringify([mode,want,P.mass.plan,d,cw,P.apt&&P.apt.maxDepth,P.mass.gap,P.grid.angle,P.site.front,ref.map(r=>r.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)]))]);
  if(cache.has(key))return cache.get(key);
  const fill={kind:"fill",shape:ref,score:score(P,ref),n:outers(ref).length};
  let opts=[fill];
  if(mode!=="fill"){
    if(mode==="auto"||mode==="bars")opts.push(...barOptions(P,ref));
    if(mode==="auto"||mode==="court"){const c=courtOption(P,ref);if(c)opts.push(c)}
    if(mode!=="auto")opts=opts.filter(o=>o.kind===mode).concat(opts.filter(o=>o.kind==="fill"));
  }
  // Number of towers: a set number keeps only options with that many separate buildings (or the nearest
  // count that fits); auto compares the best of each count.
  const counts=[...new Set(opts.map(o=>o.n))];
  if(want){const nb=counts.reduce((m,n)=>Math.abs(n-want)<Math.abs(m-want)||(Math.abs(n-want)===Math.abs(m-want)&&n<m)?n:m,counts[0]);opts=opts.filter(o=>o.n===nb)}
  // the best candidate per count and kind, and only those within reach of the best, go on to be laid out
  const top=Math.max(...opts.map(o=>o.score)),byKey=new Map();
  for(const o of opts.slice().sort((x,y)=>y.score-x.score)){const k=o.kind+o.n+(o.h?"H":"");if(!byKey.has(k)&&(o.score>=0.75*top||o.kind==="fill"))byKey.set(k,o)}
  opts=[...byKey.values()];
  // Final choice by laying each option out: sellable area less half the common area (corridors, cores,
  // storage cost to build but don't sell), less a core per tower. The geometric score only finds the candidates.
  // only apartments that match a product type count as sellable (an oversize leftover isn't a sale)
  if(window.APTS)for(const o of opts){const L=window.APTS.layoutPlate(P,o.shape,[],null),pl=shapeArea(o.shape),ns=L.units.filter(u=>u.ok).reduce((m,u)=>m+u.area,0);
    // floor that can't be planned as rows or an H falls back to the facade-strip method (wedge walls, corridor
    // rings): only used when nothing better fits, so it costs a tenth of its area
    o.nsa=ns;o.plate=pl;o.value=ns-0.5*(pl-ns)-CORE*o.n-0.1*(L.stripArea||0)}
  const val=o=>o.value!=null?o.value:o.score;
  // forced mode: its best option if it has one; auto: the best value (fill wins ties)
  const base=opts.find(o=>o.kind==="fill")||opts[0];
  const forced=opts.filter(o=>o.kind===mode&&o.kind!=="fill").sort((x,y)=>val(y)-val(x))[0];
  const pick=mode==="auto"?opts.reduce((m,o)=>val(o)>val(m)+1?o:m,base):(forced||base);
  // the best of each tower count, for the page to show why this many
  const perCount={};for(const o of opts){const c=perCount[o.n];if(!c||val(o)>c.value)perCount[o.n]={value:val(o),nsa:o.nsa,plate:o.plate}}
  const res={...pick,want,perCount,options:opts.map(o=>({kind:o.kind,n:o.n,score:val(o),area:shapeArea(o.shape)}))};
  if(cache.size>200)cache.clear();
  cache.set(key,res);return res;
}
/* the chosen massing applied to one apartment floorplate */
function apply(P,ch,fp){
  if(!fp.length||ch.kind==="fill")return fp;
  const sh=keep(P,inter(fp,ch.kind==="bars"?bandShape(ch.B,fp.flat()):ch.shape));
  // a floor too small for a wing keeps its envelope plate
  return sh.length?sh:fp;
}
/* A shared podium: one plate spanning the towers and the gaps between them (cut to the podium's own
   envelope). With bars, the band from the first tower to the last; otherwise the towers' convex hull. */
function applyShared(P,ch,fp){
  if(!fp.length||!ch||ch.kind==="fill"||outers(ch.shape).length<2)return apply(P,ch,fp);
  let span;
  if(ch.kind==="bars"){const c=Math.cos(ch.B.t),s=Math.sin(ch.B.t),vs=ch.shape.flat().map(p=>-p.x*s+p.y*c);
    span=bandShape({...ch.B,bands:[[Math.min(...vs),Math.max(...vs)]]},fp.flat())}
  else span=[hull(ch.shape.flat())];
  const sh=keep(P,inter(fp,span));return sh.length?sh:apply(P,ch,fp);
}
function hull(pts){const p=pts.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lo=[],up=[];
  for(const q of p){while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q)}
  for(const q of p.slice().reverse()){while(up.length>1&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q)}
  return lo.slice(0,-1).concat(up.slice(0,-1))}
function describe(P,ch){
  const {d,cw,D}=depths(P);if(!ch)return "";
  const n=outers(ch.shape).length,f=v=>Math.round(v).toLocaleString();
  // how many towers, and the best of each count laid out
  const pc=ch.perCount||{},cs=Object.keys(pc).map(Number).sort((a,b)=>a-b);
  const why=cs.length>1||ch.want?` ${ch.want&&ch.want!==n?`${ch.want} tower${ch.want>1?"s":""} don't fit; nearest is ${n}. `:""}Best laid out by number of towers: ${cs.map(k=>`${k}: ${pc[k].nsa!=null?`${f(pc[k].nsa)} m² net of ${f(pc[k].plate)} m²`:"–"}`).join(" · ")}.`:"";
  const tw=`${n} tower${n>1?"s":""}${n>1?`, podium ${P.mass.podium==="separate"?"separate under each":"shared"}`:""}. `;
  if(ch.kind==="fill")return tw+`Floors fill the setback envelope (compact enough for a central core).`+why;
  if(ch.kind==="bars"){const w=ch.w||D,da=(w-cw)/2;return tw+`${n>1?"Wings":"Wing"} ${w.toFixed(1)} m deep${w>2*Math.max(d,+(P.apt&&P.apt.maxDepth)||10)+cw+0.7?" (H plan)":` (${da.toFixed(1)} m apartment, ${cw} m corridor, ${da.toFixed(1)} m apartment)`}${n>1?`, ${(+P.mass.gap).toFixed(1)} m apart`:""}.`+why}
  return tw+`Wings ${D.toFixed(1)} m deep round a courtyard at least ${(+P.mass.gap).toFixed(1)} m across.`+why;
}

window.MASS={PLANS,applyShared,TOWERS,PODIUMS,defaults,MODES,depths,choose,apply,describe,score};
})();
