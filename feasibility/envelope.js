/* Envelope and level-stack calculations. Pure functions of a project object, no DOM. */
(function(){
"use strict";
const {area,inward,dot,setbackShape,shapeArea,union,inter,offsetShape}=window.G;
const R=window.RULES;

/* Street = edges Vicmap matched to a road (or the chosen frontage); rear = edges facing away from
   the main street; lane = edges on a lane or alley; everything else is a side boundary. */
function classifyEdges(pts,front,roads){
  const n=pts.length,sg=Math.sign(area(pts))||1;
  const street=new Set((roads||[]).map(r=>r.edge));street.add(front);
  const lane=new Set((roads||[]).filter(r=>/\b(LANE|ALLEY|LA|PLACE|WAY|MEWS)\b/i.test(r.road)).map(r=>r.edge));
  const out=i=>{const v=inward(pts,i,sg);return {x:-v.x,y:-v.y}};
  const fo=out(front);
  return pts.map((_,i)=>{
    if(lane.has(i)&&i!==front)return "lane";
    if(street.has(i))return "street";
    const L=Math.hypot(pts[(i+1)%n].x-pts[i].x,pts[(i+1)%n].y-pts[i].y);
    return dot(out(i),fo)<-0.7&&L>1?"rear":"side";
  });
}

function b17(z){if(z<=3.6)return 1;if(z<=6.9)return 1+0.3*(z-3.6);return 1.99+(z-6.9)}
function bandAt(ctl,z){const bs=ctl.bands;for(const b of bs)if(b.upTo==null||z<=b.upTo+1e-6)return b;return bs[bs.length-1]}
function setbackAt(ctl,type,z){
  let s=+bandAt(ctl,z)[type]||0;
  if(ctl.rescode&&(type==="side"||type==="rear"))s=Math.max(s,b17(z));
  return s;
}
/* largest setback each edge needs anywhere between z0 and z1 */
function setbacksFor(P,z0,z1){
  const zs=[z0+0.01,z1];for(const b of P.ctl.bands)if(b.upTo!=null&&b.upTo>z0&&b.upTo<z1)zs.push(b.upTo,b.upTo+0.01);
  return P.site.edges.map(t=>Math.max(...zs.map(z=>setbackAt(P.ctl,t,z))));
}
function footprint(P,z0,z1){return setbackShape(P.site.pts,setbacksFor(P,z0,z1))}

function eff(g){return g.eff!=null?g.eff:(R.USES[g.use]||{eff:0}).eff}

function compute(P){
  const site=P.site,ctl=P.ctl,siteArea=Math.abs(area(site.pts));
  let z=0,storeys=0;const groups=[];
  for(const g of P.stack){
    const floors=Math.max(0,Math.round(+g.floors||0)),ftf=Math.max(2.4,+g.ftf||3.1);
    const z0=z,z1=z+floors*ftf;
    groups.push({...g,floors,ftf,z0,z1,fp:floors?footprint(P,z0,z1):[],storeyFrom:storeys+1,storeyTo:storeys+floors});
    z=z1;storeys+=floors;
  }
  /* Site coverage and garden area cap how much ground the building may cover. If the envelope
     covers more, pull the building's outer edge (the union of all floorplates) in evenly until
     it fits, and cut each floorplate to it. Floors already inside that edge are left alone. */
  let trim=0;
  const allow=siteArea*Math.min(ctl.coverage?ctl.coverage/100:1,ctl.garden?1-ctl.garden/100:1);
  const all=groups.flatMap(g=>g.fp);
  if(allow<siteArea&&P.fitSite!==false&&all.length){
    const U=union(all),cov=d=>shapeArea(d?offsetShape(U,-d):U);
    if(cov(0)>allow+0.5){
      let lo=0,hi=40;for(let k=0;k<18;k++){const m=(lo+hi)/2;if(cov(m)>allow)lo=m;else hi=m}
      trim=hi;const edge=offsetShape(U,-trim);
      for(const g of groups)g.fp=g.fp.length&&edge.length?inter(g.fp,edge):[];
    }
  }
  for(const g of groups){
    g.fpArea=shapeArea(g.fp);g.gfa=g.fpArea*g.floors;g.nsa=g.gfa*eff(g);
    g.apts=g.use==="apartments"?Math.floor(g.nsa/Math.max(30,+P.aptSize||68)):0;
    g.spaces=g.use==="carpark"?Math.floor(g.fpArea/Math.max(20,+P.spaceArea||30))*g.floors:0;
  }
  const roof=+ctl.roof||0;
  const height=z+(storeys?roof:0);
  const gfa=groups.reduce((m,g)=>m+g.gfa,0);
  const farGfa=groups.reduce((m,g)=>m+(ctl.excludeCarpark&&g.use==="carpark"?0:g.gfa),0);
  const nsa=groups.reduce((m,g)=>m+g.nsa,0);
  const apts=groups.reduce((m,g)=>m+g.apts,0);
  const spaces=groups.reduce((m,g)=>m+g.spaces,0);
  const allFp=groups.filter(g=>g.fp.length).map(g=>g.fp).flat();
  const covered=allFp.length?shapeArea(union(allFp)):0;
  const res={siteArea,groups,trim,height,storeys,gfa,farGfa,far:farGfa/siteArea,nsa,apts,spaces,coverage:covered/siteArea*100,garden:(siteArea-covered)/siteArea*100};
  res.checks=checks(P,res);
  return res;
}

function checks(P,r){
  const c=P.ctl,out=[];
  const f1=v=>(Math.round(v*10)/10).toLocaleString();
  if(c.height)out.push(r.height<=c.height+1e-6?["ok",`Height ${f1(r.height)} m is within ${f1(c.height)} m.`]:["bad",`Height ${f1(r.height)} m is over the ${f1(c.height)} m limit by ${f1(r.height-c.height)} m.`]);
  else out.push(["info",`No height limit set. Building height ${f1(r.height)} m.`]);
  if(c.storeys)out.push(r.storeys<=c.storeys?["ok",`${r.storeys} storeys is within ${c.storeys}.`]:["bad",`${r.storeys} storeys is over the ${c.storeys}-storey limit.`]);
  if(c.far)out.push(r.far<=c.far+1e-6?["ok",`Floor area ratio ${r.far.toFixed(2)}:1 is within ${(+c.far).toFixed(2)}:1.`]:["bad",`Floor area ratio ${r.far.toFixed(2)}:1 is over ${(+c.far).toFixed(2)}:1 by ${f1((r.far-c.far)*r.siteArea)} m² of GFA.`]);
  if(c.coverage)out.push(r.coverage<=c.coverage+1e-6?["ok",`Site coverage ${r.coverage.toFixed(0)}% is within ${c.coverage}%.`]:["bad",`Site coverage ${r.coverage.toFixed(0)}% is over ${c.coverage}%.`]);
  if(c.garden)out.push(r.garden>=c.garden-1e-6?["ok",`Open area ${r.garden.toFixed(0)}% meets the ${c.garden}% minimum garden area (approximate: driveways and paths don't count as garden area).`]:["bad",`Open area ${r.garden.toFixed(0)}% is below the ${c.garden}% minimum garden area.`]);
  if(r.trim>0.05)out.push(["info",`Building edge pulled in ${r.trim.toFixed(1)} m from the setback envelope to meet ${c.coverage&&(!c.garden||c.coverage/100<=1-c.garden/100)?"site coverage":"the garden area minimum"}.`]);
  for(const g of r.groups)if(g.floors&&g.fpArea<1)out.push(["bad",`${g.name}: the setbacks leave no floor area at ${f1(g.z1)} m.`]);
  return out;
}

/* Most floors the last tower group (or the last group) can take before a control is broken. */
function maxOut(P){
  let gi=-1;P.stack.forEach((g,i)=>{if(g.type==="tower")gi=i});if(gi<0)gi=P.stack.length-1;if(gi<0)return null;
  const c=P.ctl,cap=200;
  const broken=r=>{const why=[];
    if(c.height&&r.height>c.height+1e-6)why.push("height");
    if(c.storeys&&r.storeys>c.storeys)why.push("storeys");
    if(c.far&&r.far>c.far+1e-6)why.push("FAR");
    const g=r.groups[gi];if(g.floors&&g.fpArea<1)why.push("setbacks");
    return why};
  const at=n=>{const Q={...P,stack:P.stack.map((g,i)=>i===gi?{...g,floors:n}:g)};return compute(Q)};
  let best=0,why=[];
  for(let n=1;n<=cap;n++){const w=broken(at(n));if(w.length){why=w;break}best=n}
  return {group:gi,floors:best,governs:why.length?why:["no limit set"],capped:!why.length};
}

/* The full envelope to the height limit, as horizontal slices, for drawing. */
function envelopeSlices(P,top){
  const zs=new Set([0,top]);for(const b of P.ctl.bands)if(b.upTo!=null&&b.upTo<top)zs.add(b.upTo);
  if(P.ctl.rescode)for(let z=3;z<top;z+=3)zs.add(z);
  const s=[...zs].sort((a,b)=>a-b),out=[];
  for(let i=0;i+1<s.length;i++)out.push({z0:s[i],z1:s[i+1],shape:footprint(P,s[i],s[i+1])});
  return out;
}

window.ENV={classifyEdges,b17,setbackAt,setbacksFor,footprint,compute,maxOut,envelopeSlices};
})();
