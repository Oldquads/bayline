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

function defaults(){return {depth:8,maxDepth:12,corridor:1.6,wall:0.2,snap:"prefer",typical:null,edits:{},
  types:[{name:"Studio",beds:0,min:32,target:38,max:44,width:3.6,mix:0},{name:"1B",beds:1,min:48,target:52,max:58,width:5.6,mix:40},
         {name:"2B",beds:2,min:68,target:75,max:82,width:7.6,mix:45},{name:"3B",beds:3,min:92,target:100,max:110,width:9.6,mix:15}]}}

/* deepest inset that still leaves floor: half the plate's widest width */
function maxInset(fp){let lo=0,hi=40;for(let k=0;k<14;k++){const m=(lo+hi)/2;if(offsetShape(fp,-m).length)lo=m;else hi=m}return lo}
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

/* lay out one floorplate. edits: [{ring, s}] wall positions chosen by hand */
function layoutPlate(P,fp,cores,edits){
  const A=P.apt,cw=+A.corridor||1.6,wall=+A.wall||0.2;
  const {d,narrow,deep}=depthFor(P,fp);
  const coreShapes=cores.map(c=>c.outline);
  const inner=offsetShape(fp,-d);
  let strip=inner.length?diff(fp,inner):fp.slice();
  if(coreShapes.length)strip=diff(strip,coreShapes);
  const types=A.types.filter(t=>t.max>t.min&&t.target>0);
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
      const cnt={};let n=0;for(const s of sol)for(const t of s.types)if(t&&t!=="?"){cnt[t]=(cnt[t]||0)+1;n++}
      const err=types.reduce((m,t)=>m+Math.abs((cnt[t.name]||0)/(n||1)-want[t.name]),0);
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
    const live=types.filter(t=>t.mix>0),pool=live.length?live:types;
    let fit=pool.filter(t=>a>=t.min&&a<=t.max).sort((x,y)=>Math.abs(a-x.target)-Math.abs(a-y.target))[0];
    // matches only a type the brief doesn't want (mix 0): keep its name, but off brief
    const spare=fit?null:types.filter(t=>a>=t.min&&a<=t.max).sort((x,y)=>Math.abs(a-x.target)-Math.abs(a-y.target))[0];
    const lo=Math.min(...pool.map(t=>t.min)),hi=Math.max(...pool.map(t=>t.max));
    if(!fit&&a<lo*0.85){left.push({poly:pc,rings,area:a});continue}
    // between ranges: nearest type, flagged off brief; above every range: oversize
    const near=fit||spare||(a>hi?null:pool.slice().sort((x,y)=>Math.abs(a-x.target)-Math.abs(a-y.target))[0]);
    const c=centroid(pc);let door=c;
    if(innerRings){let bd=1e9;for(const rg of inner)for(let i=0;i<rg.length;i++){const p=rg[i],q=rg[(i+1)%rg.length],dx=q.x-p.x,dy=q.y-p.y,l=dx*dx+dy*dy||1e-9,t=Math.max(0,Math.min(1,((c.x-p.x)*dx+(c.y-p.y)*dy)/l)),x={x:p.x+t*dx,y:p.y+t*dy},dd=Math.hypot(x.x-c.x,x.y-c.y);if(dd<bd){bd=dd;door=x}}}
    units.push({poly:pc,rings,area:a,type:near?near.name:"Oversize",ok:!!fit,door,width:a/d});
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
window.APTS={depthFor,clampCut,splitAt,defaults,layoutPlate,counts,mixText,project,pointAt,maxInset};
})();
