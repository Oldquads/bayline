/* Car parking: spaces required (Clause 52.06-5) and spaces provided on basement and podium car park
   levels, laid out with the shared car park engine (lib/carpark.js) around columns, cores and a ramp. */
(function(){
"use strict";
const {area,bbox,centroid,diff,inter,shapeArea,offsetShape,inward,pip}=window.G;

/* Clause 52.06-5 Table 1 starting values (editable; a Parking Overlay schedule can change them).
   Column B applies in the Principal Public Transport Network area. Results round down. */
const RATES={
  A:{one:1,three:2,visitor:0.2,retail:4},
  B:{one:1,three:1,visitor:0,retail:3.5}
};
function defaults(){return {W:2.6,L:4.9,A:6.4,col:"A",rates:JSON.parse(JSON.stringify(RATES)),basements:"auto",maxBase:6,bSet:0,bFtf:3.0,rampW:6.1,rampGrade:6,acc:0}}
const bedsOf=(t)=>t&&t.beds!=null?+t.beds:(+((String(t&&t.name).match(/(\d+)/)||[0,1])[1]));

/* dwellings by bedrooms from the apartment layouts (or the estimate when there is none) */
function required(P,R){
  const r=P.park.rates[P.park.col]||RATES.A,types=P.apt.types;
  // layouts are per floor: scale by the group's floors; groups without a layout count as 1-2 bed
  let one=0,three=0;
  for(const g of R.groups){if(!g.floors||g.use!=="apartments")continue;
    if(g.layout){for(const u of g.layout.units){const t=types.find(x=>x.name===u.type),b=t?bedsOf(t):3;if(b>=3)three+=g.floors;else one+=g.floors}}
    else one+=g.apts;}
  const dw=one+three;
  const retailNLA=R.groups.filter(g=>g.floors&&g.use==="retail").reduce((m,g)=>m+g.nsa,0);
  const res=Math.floor(one*r.one+1e-9)+Math.floor(three*r.three+1e-9);
  const vis=dw>=5?Math.floor(dw*r.visitor+1e-9):0;
  const ret=Math.floor(retailNLA/100*r.retail+1e-9);
  return {one,three,dw,res,vis,ret,retailNLA,total:res+vis+ret};
}

/* ramp positions: rectangles from the street edge into the level, centred in a column bay; the best few */
function ramp(P,outline,coreGeos){
  const s=P.site,n=s.pts.length,i=Math.min(s.front||0,n-1),a=s.pts[i],b=s.pts[(i+1)%n],L=Math.hypot(b.x-a.x,b.y-a.y);
  const t={x:(b.x-a.x)/L,y:(b.y-a.y)/L},nw=inward(s.pts,i,Math.sign(area(s.pts))||1);
  const w=+P.park.rampW||6.1,len=Math.max(8,(+P.park.bFtf||3)*(+P.park.rampGrade||6)),inset=+P.park.bSet||0;
  const F=window.GRID.frame(P),sx=P.grid.sx;
  const cands=[];
  for(let d=w/2+0.5;d<=L-w/2-0.5;d+=0.25){
    const c={x:a.x+t.x*d+nw.x*inset,y:a.y+t.y*d+nw.y*inset};
    const r=[{x:c.x-t.x*w/2,y:c.y-t.y*w/2},{x:c.x+t.x*w/2,y:c.y+t.y*w/2},{x:c.x+t.x*w/2+nw.x*len,y:c.y+t.y*w/2+nw.y*len},{x:c.x-t.x*w/2+nw.x*len,y:c.y-t.y*w/2+nw.y*len}];
    const rr=area(r)<0?r.slice().reverse():r;
    if(shapeArea(diff([rr],outline))>0.3)continue;
    if(coreGeos.some(g=>shapeArea(inter([rr],[g.outline]))>0.05))continue;
    // prefer the middle of a column bay, then the end of the frontage (keeps the middle of the level free)
    const u=F.toG(c).u,off=Math.abs((((u%sx)+sx)%sx)-sx/2),score=off*2+Math.min(d,L-d)*0.05;
    // the foot should open onto a clear run (no core in the next 15 m straight ahead)
    const f0={x:c.x+nw.x*len,y:c.y+nw.y*len},dw=3.2,ahead=[{x:f0.x-t.x*dw,y:f0.y-t.y*dw},{x:f0.x+t.x*dw,y:f0.y+t.y*dw},{x:f0.x+t.x*dw+nw.x*15,y:f0.y+t.y*dw+nw.y*15},{x:f0.x-t.x*dw+nw.x*15,y:f0.y-t.y*dw+nw.y*15}];
    const blocked=coreGeos.some(g=>shapeArea(inter([area(ahead)<0?ahead.slice().reverse():ahead],[g.outline]))>0.05);
    cands.push({score:score+(blocked?100:0),poly:rr,foot:{x:c.x+nw.x*(len+0.3),y:c.y+nw.y*(len+0.3)},nW:nw,d});
  }
  // the best few, at least 8 m apart along the frontage
  cands.sort((x,y)=>x.score-y.score);const pick=[];
  for(const c of cands){if(pick.every(p=>Math.abs(p.d-c.d)>=8))pick.push(c);if(pick.length>=3)break}
  return pick;
}

/* one level: engine run with columns, cores and ramp as obstacles. Cached by its inputs. */
const cache=new Map();
function solveLevel(P,lvl){
  const key=JSON.stringify([lvl.outline.map(r=>r.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)])),lvl.obstacles.length,lvl.obstacles.slice(0,60).map(o=>[+o[0].x.toFixed(2),+o[0].y.toFixed(2)]),lvl.entries.map(e=>[+e.E.x.toFixed(2),+e.E.y.toFixed(2)]),P.park.W,P.park.L,P.park.A,P.park.acc,lvl.alpha]);
  if(cache.has(key))return cache.get(key);
  const ring=lvl.outline.filter(r=>area(r)>0).sort((a,b)=>area(b)-area(a))[0];
  let res=null;
  if(ring&&lvl.entries.length){
    const out=window.CARPARK.runSync({usable:ring,entries:lvl.entries,obstacles:lvl.obstacles,alphas:[lvl.alpha],W:+P.park.W,L:+P.park.L,A:+P.park.A,acc:+P.park.acc||0,keep:1});
    res=out[0]||null;
  }
  const v={bays:res?res.total:0,layout:res};
  if(cache.size>60)cache.clear();
  cache.set(key,v);return v;
}

/* the levels to lay out: basements under the site, and car park level groups in the stack */
function levels(P,R,coreGeos){
  const site=[area(P.site.pts)<0?P.site.pts.slice().reverse():P.site.pts];
  const bOut=(+P.park.bSet||0)>0?offsetShape(site,-(+P.park.bSet)):site;
  const alpha=window.GRID.angle(P);
  const cores=coreGeos.map(g=>g.outline);
  const colRings=shape=>{const h=(+P.grid.col||0.6)/2,F=window.GRID.frame(P);
    return window.GRID.columns(P,shape,coreGeos).map(p=>{const q=F.toG(p);return [[-h,-h],[h,-h],[h,h],[-h,h]].map(([du,dv])=>F.toW(q.u+du,q.v+dv))})};
  // try each ramp position on a basement; keep the one that parks the most
  let rp=null,bestN=-1;
  for(const c of ramp(P,bOut,coreGeos)){
    const n=solveLevel(P,{outline:bOut,obstacles:[...colRings(bOut),...cores,c.poly],alpha,entries:[{E:c.foot,nW:c.nW}]}).bays;
    if(n>bestN){bestN=n;rp=c}
  }
  const out=[];
  const carGroups=R.groups.filter(g=>g.floors&&g.use==="carpark"&&g.fp.length);
  const streetEntries=(shape,avoid)=>{const s=P.site,n=s.pts.length,i=Math.min(s.front||0,n-1),a=s.pts[i],b=s.pts[(i+1)%n],nw=inward(s.pts,i,Math.sign(area(s.pts))||1);
    return [0.2,0.5,0.8].map(f=>({E:{x:a.x+(b.x-a.x)*f+nw.x*0.05,y:a.y+(b.y-a.y)*f+nw.y*0.05},nW:nw})).filter(e=>!avoid||!pip(e.E,avoid))};
  for(const g of carGroups){
    const atStreet=g.z0<0.01;
    for(let f=0;f<g.floors;f++){
      const obs=[...colRings(g.fp),...cores,...(rp&&(!atStreet||P.park.nBase>0)?[rp.poly]:[])];
      out.push({name:`${g.name}${g.floors>1?` ${f+1}`:""}`,kind:"podium",outline:g.fp,obstacles:obs,alpha,
        entries:atStreet?streetEntries(g.fp,rp&&P.park.nBase>0?rp.poly:null):(rp?[{E:rp.foot,nW:rp.nW}]:[]),ramp:rp,z:g.z0+f*g.ftf});
    }
  }
  return {out,rp,bOut,colRings,cores,alpha};
}

/* Lay out the parking. Basements: "auto" adds levels (all alike, so one is solved and repeated)
   until the requirement is met or the maximum is reached. */
function plan(P,R,coreGeos){
  const req=required(P,R);
  const {out,rp,bOut,colRings,cores,alpha}=levels(P,R,coreGeos);
  const podium=out.map(l=>({...l,...solveLevel(P,l)}));
  const pod=podium.reduce((m,l)=>m+l.bays,0);
  let base=null,nBase=0;
  const bLevel={name:"Basement",kind:"basement",outline:bOut,obstacles:[...colRings(bOut),...cores,...(rp?[rp.poly]:[])],alpha,entries:rp?[{E:rp.foot,nW:rp.nW}]:[],ramp:rp};
  const per=rp?solveLevel(P,bLevel):{bays:0,layout:null};
  if(P.park.basements==="auto"){const need=Math.max(0,req.total-pod);nBase=per.bays>0?Math.min(+P.park.maxBase||6,Math.ceil(need/per.bays)):0}
  else nBase=Math.max(0,Math.min(10,Math.round(+P.park.basements||0)));
  P.park.nBase=nBase;
  const basements=[];for(let k=0;k<nBase;k++)basements.push({...bLevel,name:`B${k+1}`,bays:per.bays,layout:per.layout,z:-(k+1)*(+P.park.bFtf||3)});
  const provided=pod+basements.reduce((m,l)=>m+l.bays,0);
  return {req,levels:[...podium.slice().sort((x,y)=>y.z-x.z),...basements],basements,podium,provided,perBasement:per.bays,ramp:rp,nBase};
}

/* What each obstacle costs on a basement: the same level laid out without columns, without cores,
   and with nothing but a street crossover (all cached) */
function costs(P,R,coreGeos,per){
  const {bOut,cores,alpha,rp,colRings}=levels(P,R,coreGeos);if(!rp)return null;
  const en=[{E:rp.foot,nW:rp.nW}],cols=colRings(bOut);
  const run=(obs,entries)=>solveLevel(P,{outline:bOut,obstacles:obs,alpha,entries}).bays;
  const s=P.site,n=s.pts.length,i=Math.min(s.front||0,n-1),a=s.pts[i],b=s.pts[(i+1)%n];
  return {all:per,noCols:run([...cores,rp.poly],en),noCores:run([...cols,rp.poly],en),open:run([],[0.25,0.5,0.75].map(f=>({E:{x:a.x+(b.x-a.x)*f+rp.nW.x*0.05,y:a.y+(b.y-a.y)*f+rp.nW.y*0.05},nW:rp.nW})))};
}

window.PARK={defaults,RATES,required,plan,costs,bedsOf};
})();
