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

function defaults(){return {mode:"auto",gap:9}}
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
    // apartments deepen to keep the corridor at its width (as the layout does)
    const de=window.APTS?Math.max(d,window.APTS.depthFor(P,pc).d):d;
    const a=shapeArea(pc),in1=offsetShape(pc,-de),strip=a-shapeArea(in1),dark=in1.length?shapeArea(offsetShape(pc,-(de+cw))):0;
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
function bandsAt(ref,t,phase,P){
  const {D}=depths(P),gap=Math.max(3,+P.mass.gap||9),c=Math.cos(t),s=Math.sin(t);
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
function barOptions(P,ref){
  const {D}=depths(P),gap=Math.max(3,+P.mass.gap||9),t0=window.GRID.angle(P),out=[];
  for(const t of [t0,t0+Math.PI/2]){
    let best=null;
    const tryPhase=ph=>{const B=bandsAt(ref,t,ph,P),sh=keep(P,inter(ref,bandShape(B)));if(!sh.length)return;const s=score(P,sh);if(!best||s>best.score)best={kind:"bars",B,shape:sh,score:s,phase:ph}};
    for(let ph=-D+1;ph<gap+1;ph+=1)tryPhase(ph);
    if(best){const p0=best.phase;for(const dp of [-0.5,0.5])tryPhase(p0+dp)}
    if(best)out.push(best);
  }
  return out;
}
function courtOption(P,ref){
  const {D}=depths(P),gap=Math.max(3,+P.mass.gap||9);
  // the courtyard is what is left inside the wings: it must be at least the gap across
  if(!offsetShape(ref,-(D+gap/2)).length)return null;
  const sh=keep(P,diff(ref,offsetShape(ref,-D)));if(!sh.length)return null;
  return {kind:"court",shape:sh,score:score(P,sh)};
}

/* Choose the massing on the reference (typical) floor. Cached by plate and settings. */
const cache=new Map();
function choose(P,ref){
  const mode=P.mass.mode||"auto",{d,cw}=depths(P);
  const key=JSON.stringify([mode,d,cw,P.mass.gap,P.grid.angle,P.site.front,ref.map(r=>r.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)]))]);
  if(cache.has(key))return cache.get(key);
  const fill={kind:"fill",shape:ref,score:score(P,ref)};
  let opts=[fill];
  if(mode!=="fill"){
    if(mode==="auto"||mode==="bars")opts.push(...barOptions(P,ref));
    if(mode==="auto"||mode==="court"){const c=courtOption(P,ref);if(c)opts.push(c)}
    if(mode!=="auto")opts=opts.filter(o=>o.kind===mode).concat(opts.filter(o=>o.kind==="fill"));
  }
  // forced mode: its best option if it has one; auto: the best score (fill wins ties)
  const pick=mode==="auto"?opts.reduce((m,o)=>o.score>m.score+1?o:m,fill):(opts.find(o=>o.kind===mode&&o.kind!=="fill")||fill);
  const res={...pick,options:opts.map(o=>({kind:o.kind,score:o.score,area:shapeArea(o.shape)}))};
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
function describe(P,ch){
  const {d,cw,D}=depths(P);if(!ch)return "";
  if(ch.kind==="fill")return `Floors fill the setback envelope (compact enough for a central core).`;
  const n=outers(ch.shape).length;
  if(ch.kind==="bars")return `${n} double-loaded bar${n>1?"s":""} ${D.toFixed(1)} m deep (${d} m apartment, ${cw} m corridor, ${d} m apartment), ${(+P.mass.gap).toFixed(1)} m apart.`;
  return `Wings ${D.toFixed(1)} m deep round a courtyard at least ${(+P.mass.gap).toFixed(1)} m across.`;
}

window.MASS={defaults,MODES,depths,choose,apply,describe,score};
})();
