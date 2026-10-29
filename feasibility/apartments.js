/* Apartment layout on a typical floor.
   The sellable zone is a strip one apartment depth in from every facade, less the cores. Party walls
   are cut square to the facade. Where they go is a shortest-path choice round each facade loop:
   every unit is scored on how close it is to its type's target area, walls prefer grid lines, and
   per-type weights are tuned so the counts approach the target mix. Walls are never placed within
   one apartment depth of an outside corner, so corner units wrap the corner (dual aspect). */
(function(){
"use strict";
const {area,bbox,centroid,diff,inter,union,shapeArea,offsetShape,D2R}=window.G;
const STEP=0.4,EXT=1.5;

function defaults(){return {depth:8,maxDepth:10,corridor:1.6,wall:0.2,snap:"prefer",typical:null,edits:{},
  types:[{name:"Studio",beds:0,bays:0.5,mix:0},{name:"1B",beds:1,bays:1,mix:40},{name:"2B",beds:2,bays:1.5,mix:45},{name:"3B",beds:3,bays:2,mix:15}]}}

/* deepest inset that still leaves floor: half the plate's widest width */
function maxInset(fp){let lo=0,hi=40;for(let k=0;k<14;k++){const m=(lo+hi)/2;if(offsetShape(fp,-m).length)lo=m;else hi=m}return lo}
/* A product type is a number of grid bays (1B = 1 bay, 2B = 1.5, 3B = 2 by default); its area is what the
   bays give. Area ranges are derived for plates that aren't wings: bays x bay width x depth, ±15%. */
const baysOf=t=>t.bays!=null?+t.bays:(t.beds!=null?Math.max(0.5,+t.beds*0.5+0.5):1);
function productTypes(P){
  const sp=((+P.grid.sx||8.4)+(+P.grid.sy||8.4))/2,d=+P.apt.depth||8;
  return P.apt.types.map(t=>{const b=baysOf(t),tg=b*sp*d;return {...t,bays:b,target:tg,min:tg*0.85,max:tg*1.15,width:b*sp*0.9}}).filter(t=>t.bays>0);
}
/* Apartment depth on a plate: the corridor stays at its set width and the rest of the width goes into
   the apartments. Thinner than two apartments + corridor: shallower apartments. Wider: deeper apartments,
   up to the maximum depth; wider still (a compact tower), the set depth and a core zone in the middle. */
function depthFor(P,fp){
  const A=P.apt,cw=+A.corridor||1.6,d0=+A.depth||8,dMax=Math.max(d0,+A.maxDepth||12),fit=maxInset(fp)-cw/2;
  if(fit<d0)return {d:Math.max(3,fit),narrow:fit<d0-0.3,deep:false};
  if(fit<=dMax)return {d:fit,narrow:false,deep:fit>d0+0.05};
  return {d:d0,narrow:false,deep:false};
}
function simplify(r,tol){
  // drop points that barely change direction (Clipper leaves near-collinear points after offsets)
  let pts=r.slice(),changed=true;
  while(changed&&pts.length>3){changed=false;
    for(let i=0;i<pts.length&&pts.length>3;i++){const a=pts[(i-1+pts.length)%pts.length],b=pts[i],c=pts[(i+1)%pts.length];
      const L=Math.hypot(c.x-a.x,c.y-a.y)||1e-9,dd=Math.abs((c.x-a.x)*(a.y-b.y)-(a.x-b.x)*(c.y-a.y))/L;
      if(dd<tol||Math.hypot(b.x-a.x,b.y-a.y)<0.05){pts.splice(i,1);changed=true;i--}}}
  return pts;
}

/* one facade loop: samples every STEP metres plus grid crossings, with corner info */
function ringSamples(P,ring,d){
  const n=ring.length,edges=[];let s=0;
  for(let i=0;i<n;i++){const a=ring[i],b=ring[(i+1)%n],L=Math.hypot(b.x-a.x,b.y-a.y),e={x:(b.x-a.x)/L,y:(b.y-a.y)/L};
    edges.push({i,a,b,L,e,nw:{x:-e.y,y:e.x},s0:s});s+=L}
  const perim=s;
  // corner turn at the start of each edge: >0 convex (left turn), <0 reflex
  const turn=edges.map((E,i)=>{const p=edges[(i-1+n)%n].e;return Math.atan2(p.x*E.e.y-p.y*E.e.x,p.x*E.e.x+p.y*E.e.y)});
  // a real outside corner: a step under 1 m (where a wing meets a setback line) doesn't count
  const convex=edges.filter((E,i)=>turn[i]>25*D2R&&E.L>=1&&edges[(i-1+n)%n].L>=1).map(E=>E.s0);
  const near=(x)=>convex.some(c=>{let dd=Math.abs(x-c);dd=Math.min(dd,perim-dd);return dd<d+0.05});
  const F=window.GRID.frame(P),g=P.grid;
  const samples=[];
  for(const E of edges){
    const marks=new Map();
    const add=(t,kind)=>{if(t<=1e-6||t>=E.L-1e-6)return;const k=Math.round(t*1000);const cur=marks.get(k);if(!cur||kind==="grid")marks.set(k,kind)};
    for(let t=STEP;t<E.L;t+=STEP)add(t,"");
    // where grid and half-grid lines cross this facade edge
    const A=F.toG(E.a),B=F.toG(E.b);
    for(const [ka,kb,sp] of [["u","u",g.sx],["v","v",g.sy]]){
      const da=B[ka]-A[ka];if(Math.abs(da)<1e-6)continue;
      const lo=Math.min(A[ka],B[ka]),hi=Math.max(A[ka],B[ka]);
      for(let k=Math.ceil(lo/(sp/2));k*(sp/2)<=hi;k++){const u=k*sp/2,t=(u-A[ka])/da*E.L;add(t,k%2===0?"grid":"half")}
    }
    samples.push({s:E.s0,edge:E.i,corner:true,kind:"corner",p:E.a,n:E.nw,ok:false});
    for(const [k,kind] of [...marks.entries()].sort((x,y)=>x[0]-y[0])){const t=k/1000,s2=E.s0+t;
      samples.push({s:s2,edge:E.i,kind,p:{x:E.a.x+E.e.x*t,y:E.a.y+E.e.y*t},n:E.nw,ok:!near(s2)})}
  }
  // inward mitre at each vertex (start of edge i): splits the strip between neighbouring edges
  const miter=edges.map((E,i)=>{const pn=edges[(i-1+n)%n].nw,q={x:pn.x+E.nw.x,y:pn.y+E.nw.y},k=Math.max(0.12,1+pn.x*E.nw.x+pn.y*E.nw.y);let m={x:q.x/k,y:q.y/k};const l=Math.hypot(m.x,m.y);if(l>4)m={x:m.x/l*4,y:m.y/l*4};return m});
  return {edges,perim,samples,turn,miter,convex};
}
/* Sellable strip area between consecutive samples. Each edge owns the part of the strip between
   its corner mitres; a slab is square to the facade, or follows the mitre at a corner. */
function slabAreas(R,strip,d){
  const L=d+EXT,out=[],S=R.samples,m=S.length,E=R.edges,n=E.length;
  const own=E.map((e,i)=>{const ma=R.miter[i],mb=R.miter[(i+1)%n];
    let q=[e.a,e.b,{x:e.b.x+mb.x*L,y:e.b.y+mb.y*L},{x:e.a.x+ma.x*L,y:e.a.y+ma.y*L}];if(area(q)<0)q=q.reverse();
    return inter([q],strip)});
  for(let j=0;j<m;j++){
    const a=S[j],b=S[(j+1)%m],ei=a.edge,e=E[ei];
    const da=a.corner?R.miter[ei]:a.n,db=b.corner?R.miter[(ei+1)%n]:a.n;
    if(!own[ei].length){out.push(0);continue}
    let q=[a.p,b.p,{x:b.p.x+db.x*L,y:b.p.y+db.y*L},{x:a.p.x+da.x*L,y:a.p.y+da.y*L}];if(area(q)<0)q=q.reverse();
    out.push(Math.abs(area(q))<1e-6?0:shapeArea(inter([q],own[ei])));
  }
  return out;
}

/* shortest-path wall positions round one loop, starting at sample `st` */
function solveLoop(R,slab,types,lam,snap,st,wallLoss){
  const S=R.samples,m=S.length,perim=R.perim;
  const pos=k=>S[(st+k)%m],sAt=k=>{let v=pos(k).s-S[st].s;if(k>=m)v=perim+(S[(st+k)%m].s-S[st].s);if(v<0)v+=perim;return k===0?0:(k===m?perim:v)};
  const pre=new Float64Array(m+1);for(let k=0;k<m;k++)pre[k+1]=pre[k]+slab[(st+k)%m];
  const live=types.filter(t=>t.mix>0||types.every(u=>!u.mix));
  const minA=Math.min(...live.map(t=>t.min)),maxA=Math.max(...live.map(t=>t.max));
  const cost=new Float64Array(m+1).fill(Infinity),from=new Int32Array(m+1).fill(-1),what=new Array(m+1);
  cost[0]=0;
  const sv=new Float64Array(m+1);for(let k=0;k<=m;k++)sv[k]=sAt(k);
  // odd-shaped plates: "on grid lines" also allows half-grid lines, as facades rarely meet the grid square
  const cutOK=k=>k===m||pos(k).ok&&(snap!=="only"||pos(k).kind==="grid"||pos(k).kind==="half");
  const bonus=k=>{if(k===m)return 0;const kd=pos(k).kind;return snap==="off"?0:kd==="grid"?-0.12:kd==="half"?-0.05:0};
  for(let k=0;k<m;k++){
    if(cost[k]===Infinity)continue;
    for(let j=k+1;j<=m;j++){
      const w=sv[j]-sv[k],A=pre[j]-pre[k]-(wallLoss||0);
      if(!cutOK(j))continue;
      // void: leftover strip with no apartment (core in the way, or a sliver)
      if(A<minA*0.98){const c=cost[k]+0.6+A/20+bonus(j);if(c<cost[j]){cost[j]=c;from[j]=k;what[j]=null}continue}
      for(const t of live){
        if(A<t.min||A>t.max||w<t.width*0.98)continue;
        const c=cost[k]+((A-t.target)/t.target)**2*8+(lam[t.name]||0)+bonus(j);
        if(c<cost[j]){cost[j]=c;from[j]=k;what[j]=t.name}
      }
      // past the biggest unit: one oversize unit to the first wall position, heavily penalised, so a loop always closes
      if(A>maxA){const c=cost[k]+4+(A-maxA)/10+bonus(j);if(c<cost[j]){cost[j]=c;from[j]=k;what[j]="?"}break}
    }
  }
  if(cost[m]===Infinity)return null;
  const cuts=[],units=[];for(let j=m;j>0;j=from[j]){const k=from[j];cuts.push(pos(j%m===0?0:j).s);units.push(what[j])}
  return {cost:cost[m],cuts:cuts.reverse(),types:units.reverse()};
}

/* cut the strip with walls at the given facade positions */
function cutStrip(R,strip,cuts,d,wall){
  const knives=[];
  for(const s of cuts){
    const E=R.edges.find(e=>s>=e.s0-1e-6&&s<=e.s0+e.L+1e-6)||R.edges[0],t=s-E.s0;
    const p={x:E.a.x+E.e.x*t,y:E.a.y+E.e.y*t},h=wall/2,L=d+EXT;
    const k=[{x:p.x-E.e.x*h-E.nw.x*0.5,y:p.y-E.e.y*h-E.nw.y*0.5},{x:p.x+E.e.x*h-E.nw.x*0.5,y:p.y+E.e.y*h-E.nw.y*0.5},
             {x:p.x+E.e.x*h+E.nw.x*L,y:p.y+E.e.y*h+E.nw.y*L},{x:p.x-E.e.x*h+E.nw.x*L,y:p.y-E.e.y*h+E.nw.y*L}];
    knives.push(area(k)<0?k.reverse():k);
  }
  return knives.length?diff(strip,knives):strip;
}

/* Lay out one floorplate. Wing-shaped pieces (a bar square to the grid, no wider than two of the deepest
   apartments and a corridor) get double-loaded rows; any other piece gets the facade-strip method.
   edits: [{ring, s}] wall positions chosen by hand (facade-strip pieces only). */
function layoutPlate(P,fp,cores,edits){
  const pcs=piecesOf(fp),rows=[],rest=[];
  for(const pc of pcs){const b=barOf(P,pc);if(b)rows.push(b);else rest.push(...pc)}
  if(!rows.length)return stripPlate(P,fp,cores,edits);
  const R=rowPlate(P,rows,cores),S=rest.length?stripPlate(P,rest,cores,edits):null;
  const plate=shapeArea(fp),units=[...R.units,...(S?S.units:[])],left=[...R.left,...(S?S.left:[])],nsa=units.reduce((m,u)=>m+u.area,0);
  const d0=+P.apt.depth||8,d=Math.max(R.d,S?S.d:0);
  return {d,ban:S?S.ban:d0,narrow:R.d<d0-0.3||!!(S&&S.narrow),deep:R.d>d0+0.05||!!(S&&S.deep),inner:[...R.corridor,...(S?S.inner:[])],corridor:[...R.corridor,...(S?S.corridor:[])],
    strip:[...R.strip,...(S?S.strip:[])],units,left,cuts:S?S.cuts:[],loops:S?S.loops:[],rows:rows.length,plate,nsa,common:Math.max(0,plate-nsa-left.reduce((m,u)=>m+u.area,0)),eff:nsa/plate};
}
const piecesOf=sh=>{const hs=sh.filter(r=>area(r)<0);return sh.filter(r=>area(r)>0).map(o=>[o,...hs.filter(h=>window.G.pip(h[0],o))])};

/* A piece is a wing when it has no holes, fills most of its box square to the grid, and is no wider
   than two apartments of the maximum depth plus the corridor. The long side is "along". */
function barOf(P,pc){
  if(pc.length!==1)return null;
  const F=window.GRID.frame(P),q=pc[0].map(p=>F.toG(p));
  const u0=Math.min(...q.map(p=>p.u)),u1=Math.max(...q.map(p=>p.u)),v0=Math.min(...q.map(p=>p.v)),v1=Math.max(...q.map(p=>p.v));
  const alongU=u1-u0>=v1-v0,a0=alongU?u0:v0,a1=alongU?u1:v1;
  // the wing's width along its length (cross-sections every metre): the corridor goes down the middle of
  // the typical (median) section, so a wider end or a step doesn't stop the plate being a wing
  const qa=q.map(p=>alongU?[p.u,p.v]:[p.v,p.u]),secs=[];
  for(let x=a0+0.5;x<a1-0.5;x+=1){const cs=[];for(let i=0;i<qa.length;i++){const [pa,pc2]=qa[i],[qa2,qc]=qa[(i+1)%qa.length];if((pa-x)*(qa2-x)<0)cs.push(pc2+(qc-pc2)*(x-pa)/(qa2-pa))}
    if(cs.length>=2)secs.push([Math.min(...cs),Math.max(...cs)])}
  if(secs.length<4)return null;
  const med=arr=>arr.slice().sort((x,y)=>x-y)[Math.floor(arr.length/2)];
  const Wm=med(secs.map(([l,h])=>h-l)),mid0=med(secs.map(([l,h])=>(l+h)/2));
  const c0=Math.min(...secs.map(x=>x[0])),c1=Math.max(...secs.map(x=>x[1]));
  const cw=+P.apt.corridor||1.6,dMax=Math.max(+P.apt.depth||8,+P.apt.maxDepth||12),d=(Wm-cw)/2;
  // wing-shaped: longer than wide, typical section within the depth limits, and no section much deeper than the cap
  if(d<4||d>dMax+0.05||a1-a0<Wm||secs.some(([l,h])=>Math.max(mid0-l,h-mid0)-cw/2>dMax+3))return null;
  // world point from (along, across)
  const W2=(a,c)=>alongU?F.toW(a,c):F.toW(c,a);
  const rect=(x0,x1,y0,y1)=>{const r=[W2(x0,y0),W2(x1,y0),W2(x1,y1),W2(x0,y1)];return area(r)<0?r.reverse():r};
  return {pc,alongU,a0,a1,c0,c1,mid:mid0,d,cw,W2,rect,sp:alongU?+P.grid.sx:+P.grid.sy,toA:p=>{const g=F.toG(p);return alongU?g.u:g.v},toAC:p=>{const g=F.toG(p);return alongU?[g.u,g.v]:[g.v,g.u]}};
}
/* A unit's type from its area (shared by both methods) */
function typeOf(a,types){
  const live=types.filter(t=>t.mix>0),pool=live.length?live:types,near=(xs)=>xs.slice().sort((x,y)=>Math.abs(a-x.target)-Math.abs(a-y.target))[0];
  const fit=near(pool.filter(t=>a>=t.min&&a<=t.max));
  if(fit)return {name:fit.name,ok:true};
  // matches only a type the brief doesn't want (mix 0): keep its name, but off brief
  const spare=near(types.filter(t=>a>=t.min&&a<=t.max));
  const lo=Math.min(...pool.map(t=>t.min)),hi=Math.max(...pool.map(t=>t.max));
  if(a<lo*0.85)return null;
  // between ranges: nearest type, flagged off brief; above every range: oversize
  return {name:spare?spare.name:a>hi?"Oversize":near(pool).name,ok:false};
}
/* Double-loaded rows (as in built schemes): a straight corridor down the middle of the wing, end to end,
   and one row of apartments each side from the facade to the corridor. Party walls sit on grid lines and
   mid-bay lines only; each unit is a whole number of half bays and its type is its bay count
   (1B = 1 bay, 2B = 1.5, 3B = 2). The end unit of a row takes the part bay up to the end of the wing. Which
   walls is a shortest-path choice per row, with per-type weights tuned so the counts approach the mix. */
function rowPlate(P,bars,cores){
  const A=P.apt,wall=+A.wall||0.2,coreShapes=cores.map(c=>c.outline);
  const types=productTypes(P);
  const want={},tot=types.reduce((m,t)=>m+(+t.mix||0),0)||1;for(const t of types)want[t.name]=(+t.mix||0)/tot;
  const live=types.filter(t=>t.mix>0||types.every(u=>!u.mix)),maxB=Math.max(...live.map(t=>t.bays));
  const rows=[],corridor=[];
  for(const b of bars){
    const mid=b.mid,h=b.cw/2,E=1,hb=b.sp/2;
    let cor=inter([b.pc[0]],[b.rect(b.a0-E,b.a1+E,mid-h,mid+h)]);if(coreShapes.length)cor=diff(cor,coreShapes);corridor.push(...cor);
    for(const [y0,y1,dy] of [[b.c0-E,mid-h,mid-h],[mid+h,b.c1+E,mid+h]]){
      const full=inter([b.pc[0]],[b.rect(b.a0-E,b.a1+E,y0,y1)]);let sh=full;if(coreShapes.length)sh=diff(sh,coreShapes);if(shapeArea(sh)<1)continue;
      // wall positions: grid and mid-bay lines and the row ends
      const xs=new Set([b.a0,b.a1]);
      for(let k=Math.ceil(b.a0/hb);k*hb<b.a1;k++){const x=+(k*hb).toFixed(3);if(x>b.a0+0.3&&x<b.a1-0.3)xs.add(x)}
      // no walls at core faces: walls follow the grid, and a unit beside a core just loses the area the core takes
      const X=[...xs].sort((p,q)=>p-q);
      // a stretch is blocked where a core takes most of the row there
      const ringsAC=sh2=>sh2.map(r=>r.map(b.toAC)),Rs=ringsAC(sh),Rf=ringsAC(full);
      const secLen=(R,x)=>{let L=0;for(const r of R){const cs=[];for(let i=0;i<r.length;i++){const [pa,pc2]=r[i],[qa,qc]=r[(i+1)%r.length];if((pa-x)*(qa-x)<0)cs.push(pc2+(qc-pc2)*(x-pa)/(qa-pa))}cs.sort((u,v)=>u-v);for(let i=0;i+1<cs.length;i+=2)L+=cs[i+1]-cs[i]}return L};
      // blocked only where a core takes nearly the full depth of the row; otherwise the apartment there is notched round the core
      const blocked=X.slice(1).map((x,i)=>{const xm=(X[i]+x)/2;return secLen(Rs,xm)<0.2*secLen(Rf,xm)});
      rows.push({b,sh,X,blocked,door:dy,y0,y1});
    }
  }
  // Every way to cut a row, by how many units of each type it makes (the cheapest cut for each count),
  // then the combination over all rows whose counts are closest to the brief's mix.
  const names=live.map(t=>t.name).concat(["?"]),NT=names.length;
  const rowOptions=r=>{
    const m=r.X.length-1,sp=r.b.sp,S=Array.from({length:m+1},()=>new Map());
    S[0].set("",{cost:0,cnt:new Array(NT).fill(0),prev:null});
    const add=(j,from,fk,cnt,cost,ty)=>{const k=cnt.join(","),cur=S[j].get(k);if(!cur||cost<cur.cost)S[j].set(k,{cost,cnt,prev:[from,fk,ty]})};
    for(let i=0;i<m;i++){
      if(S[i].size>300){const keep=[...S[i].entries()].sort((a,b)=>a[1].cost-b[1].cost).slice(0,300);S[i]=new Map(keep)}
      for(const [fk,st] of S[i])for(let j=i+1;j<=m;j++){
        let bl=false;for(let k=i;k<j;k++)if(r.blocked[k])bl=true;
        const nb=(r.X[j]-r.X[i])/sp;
        // beside a core: may stay empty
        if(bl&&j===i+1){add(j,i,fk,st.cnt,st.cost+0.2,null);continue}
        if(bl)break;
        live.forEach((t,ti)=>{const off=Math.abs(nb-t.bays);if(off>0.45)return;const c=st.cnt.slice();c[ti]++;add(j,i,fk,c,st.cost+off*off*6,t.name)});
        // longer than the biggest type: only if the row can't be divided
        if(nb>maxB+0.45){const c=st.cnt.slice();c[NT-1]++;add(j,i,fk,c,st.cost+30+nb,"?");break}
      }}
    return [...S[m].entries()].map(([k,st])=>{const cuts=[m],types=[];let j=m,key=k;
      while(j>0){const p=S[j].get(key).prev;types.push(p[2]);j=p[0];key=p[1];cuts.push(j)}
      return {cnt:st.cnt,cost:st.cost,cuts:cuts.reverse(),types:types.reverse()}});
  };
  let acc=new Map([["",{cnt:new Array(NT).fill(0),cost:0,picks:[]}]]);
  for(const r of rows){let opts=rowOptions(r);const next=new Map();
    // a row that can't be cut into types (a stub, or cores in the way): one piece, typed by nearest bay count
    if(!opts.length){const m=r.X.length-1,nb=(r.X[m]-r.X[0])/r.b.sp,ti=live.reduce((bi,t,i)=>Math.abs(nb-t.bays)<Math.abs(nb-live[bi].bays)?i:bi,0),cnt=new Array(NT).fill(0),ty=nb<0.4?null:nb>maxB+0.45?"?":live[ti].name;
      if(ty)cnt[ty==="?"?NT-1:ti]++;opts=[{cnt,cost:30,cuts:[0,m],types:[ty]}]}
    for(const a of acc.values())for(const o of opts){const cnt=a.cnt.map((v,i)=>v+o.cnt[i]),k=cnt.join(","),cost=a.cost+o.cost,cur=next.get(k);if(!cur||cost<cur.cost)next.set(k,{cnt,cost,picks:[...a.picks,o]})}
    acc=next.size>2000?new Map([...next.entries()].sort((x,y)=>x[1].cost-y[1].cost).slice(0,2000)):next}
  let best=null;
  for(const a of acc.values()){const n=a.cnt.reduce((x,y)=>x+y,0)||1;
    // oversize units are off the mix
    const err=live.reduce((m,t,ti)=>m+Math.abs(a.cnt[ti]/n-want[t.name]),0)+a.cnt[NT-1]/n;
    const score=err*3+a.cost/n*0.2;if(!best||score<best.score)best={score,sol:a.picks}}
  const units=[],left=[],strip=[];
  rows.forEach((r,ri)=>{strip.push(...r.sh);const s=best.sol[ri];
    for(let k=0;k+1<s.cuts.length;k++){
      const x0=r.X[s.cuts[k]],x1=r.X[s.cuts[k+1]],hw=wall/2,ty=s.types[k];
      const pcs=piecesOf(inter(r.sh,[r.b.rect(x0+(k?hw:0),x1-(k+2<s.cuts.length?hw:0),r.y0-1,r.y1+1)]));
      for(const pc of pcs){const a=shapeArea(pc);if(a<1)continue;
        if(!ty||a<12){left.push({poly:pc[0],rings:pc,area:a});continue}
        const xm=Math.max(x0,Math.min(x1,(x0+x1)/2));
        units.push({poly:pc[0],rings:pc,area:a,type:ty==="?"?"Oversize":ty,ok:ty!=="?",door:r.b.W2(xm,r.door),width:x1-x0})}
    }});
  return {d:Math.max(...bars.map(b=>b.d)),units,left,strip,corridor};
}

/* the facade-strip method, for pieces that aren't wings */
function stripPlate(P,fp,cores,edits){
  const A=P.apt,cw=+A.corridor||1.6,wall=+A.wall||0.2;
  const {d,narrow,deep}=depthFor(P,fp);
  const coreShapes=cores.map(c=>c.outline);
  const inner=offsetShape(fp,-d);
  let strip=inner.length?diff(fp,inner):fp.slice();
  if(coreShapes.length)strip=diff(strip,coreShapes);
  const types=productTypes(P);
  const want={},tot=types.reduce((m,t)=>m+(+t.mix||0),0)||1;for(const t of types)want[t.name]=(+t.mix||0)/tot;
  const rings=fp.map(rg=>simplify(rg,0.12)).filter(rg=>rg.length>=3&&Math.abs(area(rg))>4);
  // no wall within one apartment depth (the brief's, not a deepened one) of an outside corner
  const ban=Math.min(d,+A.depth||8);
  const loops=rings.map(rg=>{const R=ringSamples(P,rg,ban);return {R,slab:slabAreas(R,strip,d)}});
  const allCuts=[];
  const manual=edits&&edits.length?edits:null;
  if(manual){for(const e of manual)if(loops[e.ring])allCuts.push({ring:e.ring,s:e.s})}
  else{
    let lam={};for(const t of types)lam[t.name]=0;
    let best=null;
    for(let it=0;it<7;it++){
      const sol=loops.map(({R,slab})=>{
        const S=R.samples,starts=[];
        // starts: grid crossings first, then evenly spread allowed positions
        S.forEach((x,i)=>{if(x.ok&&x.kind==="grid")starts.push(i)});
        const okIdx=S.map((x,i)=>x.ok?i:-1).filter(i=>i>=0);
        for(let q=0;q<4&&okIdx.length;q++)starts.push(okIdx[Math.floor(q*okIdx.length/4)]);
        let bestL=null;for(const st of [...new Set(starts)].slice(0,6)){const s=solveLoop(R,slab,types,lam,A.snap,st,wall*d);if(s&&(!bestL||s.cost<bestL.cost))bestL=s}
        // a loop with nowhere to cut (all corners, or shorter than any unit): one unit or nothing
        return bestL||{cost:0,cuts:[],types:[]};
      });
      const cnt={};let n=0;// oversize units count in the total, so trading a typed unit for an oversize one never looks better
    for(const s of sol)for(const t of s.types)if(t){cnt[t]=(cnt[t]||0)+1;n++}
      // oversize units are off the mix too
    const err=types.reduce((m,t)=>m+Math.abs((cnt[t.name]||0)/(n||1)-want[t.name]),0)+(cnt["?"]||0)/(n||1);
      const score=err*3+sol.reduce((m,s)=>m+s.cost,0)/Math.max(1,n)*0.2;
      if(!best||score<best.score)best={score,sol};
      for(const t of types)lam[t.name]+=1.2*((cnt[t.name]||0)/(n||1)-want[t.name]);
    }
    best.sol.forEach((s,ri)=>{for(const c of s.cuts)allCuts.push({ring:ri,s:c})});
  }
  // build the units
  let pieces=strip;
  loops.forEach(({R},ri)=>{const cs=allCuts.filter(c=>c.ring===ri).map(c=>c.s);if(cs.length)pieces=cutStrip(R,pieces,cs,d,wall)});
  const units=[],left=[];
  const innerRings=inner.flat().length?inner:null;
  const holes=pieces.filter(r=>area(r)<0);
  for(const pc of pieces){
    if(area(pc)<=0)continue;
    const hs=holes.filter(h=>window.G.pip(h[0],pc)),a=area(pc)+hs.reduce((m,h)=>m+area(h),0),rings=[pc,...hs];
    const ty=typeOf(a,types);
    if(!ty){left.push({poly:pc,rings,area:a});continue}
    const c=centroid(pc);let door=c;
    if(innerRings){let bd=1e9;for(const rg of inner)for(let i=0;i<rg.length;i++){const p=rg[i],q=rg[(i+1)%rg.length],dx=q.x-p.x,dy=q.y-p.y,l=dx*dx+dy*dy||1e-9,t=Math.max(0,Math.min(1,((c.x-p.x)*dx+(c.y-p.y)*dy)/l)),x={x:p.x+t*dx,y:p.y+t*dy},dd=Math.hypot(x.x-c.x,x.y-c.y);if(dd<bd){bd=dd;door=x}}}
    units.push({poly:pc,rings,area:a,type:ty.name,ok:ty.ok,door,width:a/d});
  }
  // corridor: a band of corridor width just inside the apartments (where the doors are)
  const corridor=inner.length?diff(inner,offsetShape(fp,-(d+cw))):[];
  const plate=shapeArea(fp),nsa=units.reduce((m,u)=>m+u.area,0);
  const common=Math.max(0,plate-nsa-left.reduce((m,u)=>m+u.area,0));
  return {d,ban,narrow,deep,inner,corridor,strip,units,left,cuts:allCuts,loops:loops.map(l=>({perim:l.R.perim,edges:l.R.edges,convex:l.R.convex})),plate,nsa,common,eff:nsa/plate};
}

function counts(units){const c={};for(const u of units)c[u.type]=(c[u.type]||0)+1;return c}
function mixText(c,types){return types.filter(t=>c[t.name]).map(t=>`${c[t.name]} × ${t.name}`).concat(c.Oversize?[`${c.Oversize} oversize`]:[]).join(", ")}

/* position along a loop nearest to a point (for dragging and splitting walls by hand) */
function project(loop,p){let best=null;for(const E of loop.edges){const t=Math.max(0,Math.min(E.L,(p.x-E.a.x)*E.e.x+(p.y-E.a.y)*E.e.y)),q={x:E.a.x+E.e.x*t,y:E.a.y+E.e.y*t},d=Math.hypot(q.x-p.x,q.y-p.y);if(!best||d<best.d)best={d,s:E.s0+t,q}}return best}
function pointAt(loop,s){s=((s%loop.perim)+loop.perim)%loop.perim;const E=loop.edges.find(e=>s>=e.s0-1e-6&&s<=e.s0+e.L+1e-6)||loop.edges[0],t=s-E.s0;return {p:{x:E.a.x+E.e.x*t,y:E.a.y+E.e.y*t},n:E.nw}}

/* nearest wall position to s that is at least d from every outside corner */
function clampCut(loop,s,d){
  const P=loop.perim,norm=x=>((x%P)+P)%P,dist=(x,c)=>{const t=Math.abs(norm(x)-c);return Math.min(t,P-t)};
  const bad=x=>loop.convex.some(c=>dist(x,c)<d+0.05);
  if(!bad(s))return norm(s);
  for(let k=1;k<=Math.ceil(P/0.2);k++)for(const x of [s+k*0.2,s-k*0.2])if(!bad(x))return norm(x);
  return norm(s);
}
/* split the apartment around facade position s in half: a wall midway between its two walls */
function splitAt(L,ring,s){
  const lp=L.loops[ring],P=lp.perim,cs=L.cuts.filter(c=>c.ring===ring).map(c=>c.s).sort((a,b)=>a-b);
  if(!cs.length)return clampCut(lp,s+P/2,L.ban||L.d);
  let a=cs[cs.length-1]-P,b=cs[0];for(let i=0;i<cs.length;i++){if(cs[i]>s){b=cs[i];a=i?cs[i-1]:cs[cs.length-1]-P;break}if(i===cs.length-1){a=cs[i];b=cs[0]+P}}
  return clampCut(lp,(a+b)/2,L.ban||L.d);
}
window.APTS={productTypes,baysOf,depthFor,clampCut,splitAt,defaults,layoutPlate,counts,mixText,project,pointAt,maxInset};
})();
