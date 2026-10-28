/* Bayline car park engine, shared by the car park page and the feasibility page.
   Moved out of index.html unchanged: the code reads the caller's settings object S (bay specs,
   accessway and crossover widths, options) and site function, handed over once with setup(). */
(function(){
"use strict";
const D2R=Math.PI/180;
let S=null,sitePoly=()=>[];
function setup(settings,siteFn){S=settings;if(siteFn)sitePoly=siteFn}

/* ---------- Geometry ---------- */
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}), mul=(a,k)=>({x:a.x*k,y:a.y*k});
const cross=(a,b)=>a.x*b.y-a.y*b.x, len=a=>Math.hypot(a.x,a.y), nrm=a=>{const l=len(a)||1;return {x:a.x/l,y:a.y/l}};
function area(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y}return s/2}
function inward(p,i,sg){const a=p[i],b=p[(i+1)%p.length],e=nrm(sub(b,a));return sg>0?{x:-e.y,y:e.x}:{x:e.y,y:-e.x}}
function inset(p,ds){
  const sg=Math.sign(area(p))||1,n=p.length,L=[];
  for(let i=0;i<n;i++){const a=p[i],b=p[(i+1)%n],e=nrm(sub(b,a)),nn=inward(p,i,sg);L.push({P:add(a,mul(nn,ds[i])),e})}
  const out=[];
  for(let i=0;i<n;i++){
    const l1=L[(i-1+n)%n],l2=L[i],c=cross(l1.e,l2.e);
    if(Math.abs(c)<1e-9){out.push(l2.P);continue}
    const t=cross(sub(l2.P,l1.P),l2.e)/c;out.push(add(l1.P,mul(l1.e,t)));
  }
  return out;
}
function pip(pt,Q){let c=false;for(let i=0,j=Q.length-1;i<Q.length;j=i++){const a=Q[i],b=Q[j];if((a.y>pt.y)!==(b.y>pt.y)&&pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)c=!c}return c}
function segX(p1,p2,p3,p4){const d1=cross(sub(p4,p3),sub(p1,p3)),d2=cross(sub(p4,p3),sub(p2,p3)),d3=cross(sub(p2,p1),sub(p3,p1)),d4=cross(sub(p2,p1),sub(p4,p1));return ((d1>1e-9&&d2<-1e-9)||(d1<-1e-9&&d2>1e-9))&&((d3>1e-9&&d4<-1e-9)||(d3<-1e-9&&d4>1e-9))}
function inside(R,Q){
  for(const p of R)if(!pip(p,Q))return false;
  for(let i=0;i<R.length;i++){const a=R[i],b=R[(i+1)%R.length];for(let j=0;j<Q.length;j++)if(segX(a,b,Q[j],Q[(j+1)%Q.length]))return false}
  // a lot corner poking into the bay (touching an edge rather than crossing it) also fails
  const c=centroid(R),Rs=R.map(q=>({x:c.x+(q.x-c.x)*0.999,y:c.y+(q.y-c.y)*0.999}));
  for(const q of Q)if(pip(q,Rs))return false;
  return true;
}
function bbox(P){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of P){if(p.x<x0)x0=p.x;if(p.y<y0)y0=p.y;if(p.x>x1)x1=p.x;if(p.y>y1)y1=p.y}return {x0,y0,x1,y1}}
function bbHit(a,b){return a.x0<b.x1-1e-6&&b.x0<a.x1-1e-6&&a.y0<b.y1-1e-6&&b.y0<a.y1-1e-6}
function sat(A,B){
  for(const P of [A,B])for(let i=0;i<P.length;i++){
    const e=sub(P[(i+1)%P.length],P[i]),ax={x:-e.y,y:e.x};
    let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
    for(const p of A){const d=p.x*ax.x+p.y*ax.y;if(d<a0)a0=d;if(d>a1)a1=d}
    for(const p of B){const d=p.x*ax.x+p.y*ax.y;if(d<b0)b0=d;if(d>b1)b1=d}
    const tol=1e-4*Math.max(1,len(ax));
    if(a1<=b0+tol||b1<=a0+tol)return false;
  }
  return true;
}
function lineInts(Q,V){
  const xs=[];
  for(let i=0;i<Q.length;i++){const a=Q[i],b=Q[(i+1)%Q.length];if((a.y<=V&&b.y>V)||(b.y<=V&&a.y>V))xs.push(a.x+(V-a.y)*(b.x-a.x)/(b.y-a.y))}
  xs.sort((a,b)=>a-b);const r=[];for(let i=0;i+1<xs.length;i+=2)r.push([xs[i],xs[i+1]]);return r;
}
function isect(A,B){const r=[];for(const a of A)for(const b of B){const lo=Math.max(a[0],b[0]),hi=Math.min(a[1],b[1]);if(hi>lo)r.push([lo,hi])}return r}
function stripInts(Q,v0,v1){
  const lines=[v0+1e-6,v1-1e-6,(v0+v1)/2];
  for(const p of Q)if(p.y>v0&&p.y<v1)lines.push(p.y);
  let r=lineInts(Q,lines[0]);for(let i=1;i<lines.length&&r.length;i++)r=isect(r,lineInts(Q,lines[i]));return r;
}
const rect=(u0,u1,v0,v1)=>[{x:u0,y:v0},{x:u1,y:v0},{x:u1,y:v1},{x:u0,y:v1}];
const inRect=(p,r)=>p.x>=r[0].x-1e-6&&p.x<=r[2].x+1e-6&&p.y>=r[0].y-1e-6&&p.y<=r[2].y+1e-6;

/* ---------- Layout engine ---------- */
function shapeFor(t,spec,s,d){
  if(t==="par"){const rel=[{x:0,y:0},{x:spec.L,y:0},{x:spec.L,y:s*spec.W},{x:0,y:s*spec.W}];return {rel,stride:spec.L,depth:spec.W,minU:0,maxU:spec.L,lat:null}}
  const th=(t==="p90"?90:t==="p60"?60:45)*D2R,c=Math.cos(th),sn=Math.sin(th);
  const a={x:Math.abs(c)<1e-9?0:d*c,y:s*sn};
  let b={x:-a.y,y:a.x};const b2={x:a.y,y:-a.x};
  const ok=v=>s*v.y>=-1e-9;
  if(!ok(b)||(ok(b2)&&Math.abs(b.y)<1e-9&&b2.x>b.x))b=b2;
  const rel=[{x:0,y:0},mul(b,spec.W),add(mul(b,spec.W),mul(a,spec.L)),mul(a,spec.L)];
  const xs=rel.map(p=>p.x);
  return {rel,stride:spec.W/sn,depth:spec.L*sn+spec.W*c,minU:Math.min(...xs),maxU:Math.max(...xs),lat:b};
}

function buildCtx(entry){
  if(entry==null)entry=S.entry;
  const site=sitePoly(),n=site.length,fe=Math.min(S.front,n-1);
  const ds=site.map((_,i)=>i===fe?S.setF:S.setO);
  const usable=inset(site,ds);
  const sg=Math.sign(area(site))||1;
  const A=site[fe],B=site[(fe+1)%n];
  const E=add(A,mul(sub(B,A),entry));
  const nW=inward(site,fe,sg);
  return {entry,site,usable,E,nW,fe,frontDir:Math.atan2(B.y-A.y,B.x-A.x),siteArea:Math.abs(area(site)),obstacles:S.obstacles||[]};
}

function frameCache(ctx,alpha){
  const ca=Math.cos(alpha),sa=Math.sin(alpha);
  const toF=p=>({x:p.x*ca+p.y*sa,y:-p.x*sa+p.y*ca});
  const toW=p=>({x:p.x*ca-p.y*sa,y:p.x*sa+p.y*ca});
  const Q=ctx.usable.map(toF),siteF=ctx.site.map(toF);
  const Qs=Q.map(p=>({x:p.y,y:p.x}));
  const bb=bbox(Q);
  const nF={x:ctx.nW.x*ca+ctx.nW.y*sa,y:-ctx.nW.x*sa+ctx.nW.y*ca};
  // obstacles (columns, cores, ramps) in the grid frame
  const obs=(ctx.obstacles||[]).map(o=>{const q=o.map(toF);return {p:q,b:bbox(q)}});
  // column spacing across the rows (y in this frame), when columns line up with it
  let colSp=0;
  if(obs.length){const ys=[...new Set(obs.filter(o=>o.b.x1-o.b.x0<1.5&&o.b.y1-o.b.y0<1.5).map(o=>Math.round((o.b.y0+o.b.y1)/2*20)/20))].sort((a,b)=>a-b);
    const cnt=new Map();for(let i=1;i<ys.length;i++){const d=Math.round((ys[i]-ys[i-1])*20)/20;if(d>2)cnt.set(d,(cnt.get(d)||0)+1)}
    let best=0;for(const [d,c] of cnt)if(c>best){best=c;colSp=d}}
  return {alpha,toF,toW,Q,Qs,siteF,bb,E:toF(ctx.E),nF,obs,colSp};
}

/* Layout in two parts. layoutCore() builds the aisle grid, rows, main
   accessway and its bays for one grid angle, row offset and accessway mode;
   it does not depend on the crossover (except "entry" modes, which put the
   accessway in line with it). attachCrossover() then runs the driveway from a
   crossover point to the nearest circulation, removes only the bays it
   crosses, places accessible bays and totals the result. One core is tried
   against every crossover point. */
function layoutCore(fc,t,phase,mode,uEraw,specO,pitch){
  const spec=specO||S.specs[t],ext=S.blind?1.0:0,Ac=S.spineW,clr=S.wall?0.3:0;
  const {Q,Qs,bb}=fc;
  const p90=S.specs.p90.on?(t==="p90"&&specO?specO:S.specs.p90):null;
  let centers;
  const lo=bb.x0+Ac/2,hi=bb.x1-Ac/2;
  if(hi<lo)return null;
  const bestNear=(start,dir)=>{let best=start,bl=-1;for(let k=0;k<=8;k++){const uc=start+dir*k;if(uc<lo-1e-6||uc>hi+1e-6)break;const iv=stripInts(Qs,uc-Ac/2,uc+Ac/2);const l=iv.reduce((m,x)=>Math.max(m,x[1]-x[0]),0);if(l>bl+0.5){bl=l;best=uc}}return best};
  if(mode==="entry"||mode==="spineOnly")centers=[Math.min(hi,Math.max(lo,uEraw))];
  else if(mode==="left")centers=[bestNear(lo,1)];
  else if(mode==="right")centers=[bestNear(hi,-1)];
  else centers=[bestNear(lo,1),bestNear(hi,-1)];
  if(mode==="loop"&&centers[1]-centers[0]<Ac+3)return null;
  const spines=[];
  for(const uc of centers){
    const iv=stripInts(Qs,uc-Ac/2,uc+Ac/2);if(!iv.length)return null;
    let best=iv[0];for(const x of iv)if(x[1]-x[0]>best[1]-best[0])best=x;
    spines.push({u0:uc-Ac/2,u1:uc+Ac/2,v0:best[0],v1:best[1]});
  }
  // An accessway that runs into obstacles keeps the longest clear stretch of its band (at least 12 m),
  // trying sideways shifts of up to half a bay; the shift that leaves the longest stretch wins.
  if(fc.obs&&fc.obs.length)for(const sp of spines){
    const freeRun=u0=>{const u1=u0+Ac,blk=fc.obs.filter(o=>o.b.x1>u0+1e-6&&o.b.x0<u1-1e-6&&o.b.y1>sp.v0&&o.b.y0<sp.v1&&sat(rect(u0,u1,sp.v0,sp.v1),o.p)).map(o=>[o.b.y0,o.b.y1]).sort((a,b)=>a[0]-b[0]);
      let v=sp.v0,best=[0,0];for(const [a,b] of blk){if(a-v>best[1]-best[0])best=[v,a];v=Math.max(v,b)}if(sp.v1-v>best[1]-best[0])best=[v,sp.v1];return best};
    let pick=null;
    for(let d=0;d<=4.5;d+=0.1)for(const sgn of d?[1,-1]:[1]){const u0=sp.u0+sgn*d;if(u0<lo-Ac/2-1e-6||u0+Ac>hi+Ac/2+1e-6)continue;
      const r=freeRun(u0),L=r[1]-r[0];if(!pick||L>pick.L+0.5)pick={u0,r,L};if(L>=sp.v1-sp.v0-1e-6)break}
    if(!pick||pick.L<12)return null;
    sp.u0=pick.u0;sp.u1=pick.u0+Ac;sp.v0=pick.r[0];sp.v1=pick.r[1];
  }
  const segs=[];
  if(mode!=="spineOnly"){
    const sTop=shapeFor(t,spec,1,1),Dp=sTop.depth,A=spec.A,M=pitch||2*Dp+A;
    let k=0;
    for(let v=bb.y0+phase*M-M;v<bb.y1;v+=M,k++){
      const a0=v+Dp,a1=a0+A;
      if(a1<bb.y0||a0>bb.y1)continue;
      const okV=spines.every(sp=>a0>=sp.v0-1e-6&&a1<=sp.v1+1e-6);if(!okV)continue;
      const iv=stripInts(Q,a0,a1);
      const dir=(k%2===0)?1:-1;
      for(const I of iv){
        if(mode==="loop"){
          const L=spines[0],R=spines[1];
          if(I[0]<=L.u1+1e-6&&I[1]>=R.u0-1e-6)segs.push({lo:L.u1,hi:R.u0,attLo:true,attHi:true,v0:a0,v1:a1,dir});
        }else{
          const sp=spines[0];
          if(I[0]<sp.u0-2&&I[1]>=sp.u0-1e-6)segs.push({lo:I[0],hi:sp.u0,attLo:false,attHi:true,v0:a0,v1:a1,dir});
          if(I[1]>sp.u1+2&&I[0]<=sp.u1+1e-6)segs.push({lo:sp.u1,hi:I[1],attLo:true,attHi:false,v0:a0,v1:a1,dir});
        }
      }
    }
  }
  // aisles stop at obstacles: keep the pieces still joined to an accessway
  if(fc.obs&&fc.obs.length){
    const cutSegs=[];
    for(const sg of segs){
      const blk=fc.obs.filter(o=>o.b.y1>sg.v0+1e-6&&o.b.y0<sg.v1-1e-6&&o.b.x1>sg.lo&&o.b.x0<sg.hi&&sat(rect(sg.lo,sg.hi,sg.v0,sg.v1),o.p)).map(o=>[o.b.x0,o.b.x1]).sort((a,b)=>a[0]-b[0]);
      if(!blk.length){cutSegs.push(sg);continue}
      let lo=sg.lo;const pieces=[];
      for(const [a,b] of blk){if(a>lo)pieces.push([lo,a]);lo=Math.max(lo,b)}
      if(lo<sg.hi)pieces.push([lo,sg.hi]);
      for(const [a,b] of pieces){
        const atLo=sg.attLo&&Math.abs(a-sg.lo)<1e-6,atHi=sg.attHi&&Math.abs(b-sg.hi)<1e-6;
        if((atLo||atHi)&&b-a>2)cutSegs.push({...sg,lo:a,hi:b,attLo:atLo,attHi:atHi});
      }
    }
    segs.length=0;segs.push(...cutSegs);
  }
  const forb=spines.map(sp=>{const r=rect(sp.u0,sp.u1,sp.v0,sp.v1);return {p:r,b:bbox(r)}});
  if(fc.obs)forb.push(...fc.obs);
  const bays=[];let rowId=0;
  const valid=(pts,lat,extra)=>{
    let test=pts;
    if(clr&&lat){const e=mul(lat,clr),c=centroid(pts);test=pts.map(q=>((q.x-c.x)*lat.x+(q.y-c.y)*lat.y)>=0?add(q,e):sub(q,e))}
    if(!inside(test,Q))return false;
    const b=bbox(pts);
    for(const f of forb)if(bbHit(b,f.b)&&sat(pts,f.p))return false;
    if(extra)for(const f of extra)if(bbHit(b,f.b)&&sat(pts,f.p))return false;
    return true;
  };
  for(const sg of segs){
    sg.bays=0;
    for(const s of [-1,1]){
      const sh=shapeFor(t,spec,s,t==="p90"?1:sg.dir);
      const vE=s>0?sg.v1:sg.v0;
      const l=sg.lo+(sg.attLo?0:ext),h=sg.hi-(sg.attHi?0:ext);
      const span=sh.maxU-sh.minU;if(h-l<span)continue;
      const fromHi=sg.attHi&&!sg.attLo;
      const rid=rowId++;
      if(fc.obs&&fc.obs.length){
        // with columns about: step past an obstacle 0.1 m at a time instead of losing a whole bay
        let pos=fromHi?h:l,k=0;
        while(fromHi?pos-span>=l-1e-6:pos+span<=h+1e-6){
          const ox=fromHi?pos-sh.maxU:pos-sh.minU,pts=sh.rel.map(c=>({x:c.x+ox,y:c.y+vE}));
          if(valid(pts,sh.lat)){bays.push({pts,t,row:rid,i:k++,seg:sg,W:spec.W,L:spec.L});sg.bays++;pos+=fromHi?-sh.stride:sh.stride;continue}
          // blocked by an obstacle: start again exactly at its far face; otherwise creep on
          const bb=bbox(pts),hit=fc.obs.filter(o=>bbHit(bb,o.b)&&sat(pts,o.p));
          if(hit.length)pos=fromHi?Math.min(pos-0.01,Math.min(...hit.map(o=>o.b.x0))-1e-4):Math.max(pos+0.01,Math.max(...hit.map(o=>o.b.x1))+1e-4);
          else pos+=fromHi?-0.1:0.1;
        }
        continue;
      }
      for(let k=0;;k++){
        let ox;
        if(fromHi){const top=h-k*sh.stride;if(top-span<l-1e-6)break;ox=top-sh.maxU}
        else{const st=l+k*sh.stride;if(st+span>h+1e-6)break;ox=st-sh.minU}
        const pts=sh.rel.map(c=>({x:c.x+ox,y:c.y+vE}));
        if(valid(pts,sh.lat)){bays.push({pts,t,row:rid,i:k,seg:sg,W:spec.W,L:spec.L});sg.bays++;}
      }
    }
  }
  const keep=segs.filter(sg=>sg.bays>0);
  for(const sg of keep){
    const us=bays.filter(b=>b.seg===sg).flatMap(b=>b.pts.map(p=>p.x));
    if(!sg.attLo)sg.lo=Math.max(sg.lo,Math.min(...us)-ext);
    if(!sg.attHi)sg.hi=Math.min(sg.hi,Math.max(...us)+ext);
  }
  // bays lining the main accessway
  const spineBays=(segList,baseBays)=>{
    const out=[];if(!p90)return out;
    const segF=segList.map(sg=>{const r=rect(sg.lo,sg.hi,sg.v0,sg.v1);return {p:r,b:bbox(r)}});
    const bayF=baseBays.map(b=>({p:b.pts,b:bbox(b.pts)}));
    for(const sp of spines){
      for(const side of [-1,1]){
        const rid=rowId++;
        const u0=side>0?sp.u1:sp.u0-p90.L,u1=side>0?sp.u1+p90.L:sp.u0;
        const vs0=sp.v0+ext,vs1=sp.v1-ext;
        if(fc.obs&&fc.obs.length){
          // with obstacles: after a blocked spot, start again at the obstacle's far face
          let v=vs0,k=0;
          while(v+p90.W<=vs1+1e-6){
            const pts=rect(u0,u1,v,v+p90.W);
            if(valid(pts,{x:0,y:1},[...segF,...bayF])){out.push({pts,t:"p90",row:rid,i:k++,sp,W:p90.W,L:p90.L});bayF.push({p:pts,b:bbox(pts)});v+=p90.W;continue}
            const bb=bbox(pts),hit=fc.obs.filter(o=>bbHit(bb,o.b)&&sat(pts,o.p));
            v=hit.length?Math.max(v+0.01,Math.max(...hit.map(o=>o.b.y1))+1e-4):v+p90.W;
          }
          continue;
        }
        for(let k=0;;k++){
          const v=vs0+k*p90.W;if(v+p90.W>vs1+1e-6)break;
          const pts=rect(u0,u1,v,v+p90.W);
          if(valid(pts,{x:0,y:1},[...segF,...bayF])){out.push({pts,t:"p90",row:rid,i:k,sp,W:p90.W,L:p90.L});bayF.push({p:pts,b:bbox(pts)})}
        }
      }
    }
    return out;
  };
  let keepF=keep.slice(),rowBays=bays.slice(),spB=spineBays(keepF,rowBays);
  // Weak aisles (short, or serving few bays) can cost more bays than they serve,
  // e.g. stubs that cut through bays lining the accessway. Drop one at a time,
  // weakest first, whenever lining the accessway instead gives more bays.
  if(p90&&spines.length){
    const weak=keepF.filter(sg=>sg.hi-sg.lo<12||sg.bays<=6).sort((x,y)=>x.bays-y.bays).slice(0,8);
    for(const sg of weak){
      const k2=keepF.filter(x=>x!==sg),rb2=rowBays.filter(q=>q.seg!==sg),sp2=spineBays(k2,rb2);
      if(rb2.length+sp2.length>rowBays.length+spB.length){keepF=k2;rowBays=rb2;spB=sp2}
    }
  }
  {const kf=keepF.slice(),all=[...rowBays,...spB];keep.length=0;keep.push(...kf);bays.length=0;bays.push(...all);}
  if(!bays.length)return null;
  // the accessway keeps its full length here; attachCrossover trims it
  return {t,mode,phase,alpha:fc.alpha,spines,keep,bays,ext,spec};
}
function attachCrossover(core,fc,ctx){
  const {nF,siteF}=fc,{spines,keep,ext}=core;let E=fc.E;
  // circulation the driveway may join: aisles as built, accessways trimmed to what they serve
  const spv=spines.map(sp=>{
    let v0=1e9,v1=-1e9;const inc=(a,b)=>{v0=Math.min(v0,a);v1=Math.max(v1,b)};
    for(const sg of keep)if(sg.lo<=sp.u1+1e-6&&sg.hi>=sp.u0-1e-6)inc(sg.v0,sg.v1);
    for(const b of core.bays)if(b.sp===sp){const bb2=bbox(b.pts);inc(bb2.y0-ext,bb2.y1+ext)}
    return {sp,v0,v1};
  });
  const circ=[...spv.map(s=>({r:rect(s.sp.u0,s.sp.u1,Math.min(s.v0,s.v1>s.v0?s.v0:s.sp.v0),s.v1>s.v0?s.v1:s.sp.v1),s,full:rect(s.sp.u0,s.sp.u1,s.sp.v0,s.sp.v1)})),...keep.map(sg=>({r:rect(sg.lo,sg.hi,sg.v0,sg.v1),sg}))];
  // walk in from the crossover until the driveway meets circulation (a full-length accessway counts)
  const tF={x:-nF.y,y:nF.x},w2=S.drvW/2;
  const tryAt=E0=>{
    let hit=null,hitT=0;
    for(let tt=0;tt<=60;tt+=0.2){
      const P=add(E0,mul(nF,tt));
      if(tt>0.4&&!pip(P,siteF))break;
      const h=circ.find(c=>inRect(P,c.r)||(c.full&&inRect(P,c.full)));if(h){hit=h;hitT=tt;break}
    }
    if(!hit)return null;
    const sl=hitT+0.6,stub=[add(E0,mul(tF,-w2)),add(E0,mul(tF,w2)),add(add(E0,mul(tF,w2)),mul(nF,sl)),add(add(E0,mul(tF,-w2)),mul(nF,sl))],sb=bbox(stub);
    if(fc.obs&&fc.obs.some(o=>bbHit(sb,o.b)&&sat(stub,o.p)))return null;
    return {hit,hitT,stub,sb,E:E0};
  };
  // with obstacles the driveway may jog sideways (up to 3 m) to clear a column or core
  let at=tryAt(E);
  if(!at&&fc.obs&&fc.obs.length)for(let d=0.25;d<=3+1e-9&&!at;d+=0.25)for(const sg of [1,-1]){at=tryAt(add(E,mul(tF,sg*d)));if(at)break}
  if(!at)return null;
  const {hit,hitT,stub,sb}=at;E=at.E;
  const hitP=add(E,mul(nF,hitT));
  // final accessway extents, including the point where the driveway joins
  const usedSp=[];
  for(const s of spv){
    let v0=s.v0,v1=s.v1;
    if(hit.s===s){const half=Math.abs(nF.x)>0.5?w2:0;v0=Math.min(v0,hitP.y-half);v1=Math.max(v1,hitP.y+half)}
    if(v0<v1)usedSp.push({u0:s.sp.u0,u1:s.sp.u1,v0:Math.max(s.sp.v0,v0),v1:Math.min(s.sp.v1,v1)});
  }
  // drop bays the driveway runs through
  const bays=core.bays.filter(b=>{const bb=bbox(b.pts);return !(bbHit(bb,sb)&&sat(b.pts,stub))}).map(b=>({...b,kind:undefined}));
  if(!bays.length)return null;
  // accessible bays nearest the crossover, each with a shared zone beside it
  let accN=0;
  if(S.acc>0){
    const cand=bays.filter(b=>b.t==="p90").map(b=>{const c=centroid(b.pts);return {b,d:Math.hypot(c.x-E.x,c.y-E.y)}}).sort((a,b)=>a.d-b.d);
    for(const {b} of cand){
      if(accN>=S.acc)break;if(b.kind)continue;
      const nb=bays.find(o=>!o.kind&&o!==b&&o.row===b.row&&Math.abs(o.i-b.i)===1);
      if(!nb)continue;b.kind="acc";nb.kind="shared";accN++;
    }
  }
  const segAlive=new Set(bays.filter(b=>b.seg).map(b=>b.seg));
  const aisles=keep.filter(sg=>segAlive.has(sg)||hit.sg===sg);
  const total=bays.filter(b=>b.kind!=="shared").length;
  const blind=aisles.filter(sg=>!sg.attLo||!sg.attHi).length+(core.mode!=="loop"?usedSp.length:0);
  const circA=aisles.reduce((m,sg)=>m+(sg.hi-sg.lo)*(sg.v1-sg.v0),0)+usedSp.reduce((m,sp)=>m+(sp.u1-sp.u0)*(sp.v1-sp.v0),0);
  const runLen=hitT+usedSp.reduce((m,sp)=>Math.max(m,sp.v1-sp.v0),0)+aisles.reduce((m,sg)=>Math.max(m,sg.hi-sg.lo),0);
  const W=fc.toW,t=core.t;
  return {
    t,mode:core.mode,alpha:fc.alpha,phase:core.phase,total,acc:accN,circA,blind,runLen,stubLen:hitT,ctx,spec:core.spec,
    oneWay:t!=="p90",
    bays:bays.map(b=>({pts:b.pts.map(W),kind:b.kind||"std",t:b.t,W:b.W,L:b.L})),
    aisles:aisles.map(sg=>({pts:rect(sg.lo,sg.hi,sg.v0,sg.v1).map(W),dir:sg.dir,a:W({x:sg.lo,y:(sg.v0+sg.v1)/2}),b:W({x:sg.hi,y:(sg.v0+sg.v1)/2})})),
    spines:usedSp.map(sp=>rect(sp.u0,sp.u1,sp.v0,sp.v1).map(W)),
    stub:stub.map(W)
  };
}
function centroid(P){let x=0,y=0;for(const p of P){x+=p.x;y+=p.y}return {x:x/P.length,y:y/P.length}}

/* Row grid offsets to try. Besides six evenly spaced offsets, start the
   bank|aisle|bank module exactly on every straight boundary that runs along
   the aisles, so the outer bays sit flush against it and no strip is lost. */
function tablePairs(){
  const b=S.specs.p90;if(!S.tablePairs||!b||!b.on)return [];
  return [[2.6,6.4],[2.8,5.8],[3.0,5.2],[3.2,4.8]].filter(([W,A])=>W>b.W+1e-9&&A<b.A-1e-9).map(([W,A])=>({on:true,W,L:b.L,A}));
}
/* with columns: a row spacing stretched to a whole number of column bays (within 2.5 m), so every
   aisle stays between the same column lines instead of drifting into them */
function rowPitch(fc,t,specO){
  if(!fc.colSp)return 0;const spec=specO||S.specs[t],M=2*shapeFor(t,spec,1,1).depth+spec.A;
  const k=Math.ceil(M/fc.colSp-1e-9),P=k*fc.colSp;return P-M>1e-6&&P-M<=2.5?P:0;
}
function rowPhases(fc,t,specO,pitch){
  const spec=specO||S.specs[t],Dp=shapeFor(t,spec,1,1).depth,M=pitch||2*Dp+spec.A;
  const out=[0,1/6,2/6,3/6,4/6,5/6];
  const Q=fc.Q,y0=fc.bb.y0;
  for(let i=0;i<Q.length;i++){
    const a=Q[i],b=Q[(i+1)%Q.length],L=Math.hypot(b.x-a.x,b.y-a.y);
    if(L<4||Math.abs(b.y-a.y)/L>0.02)continue;      // only boundaries parallel to the aisles
    const v=(a.y+b.y)/2;
    for(const off of [0,0.04,-0.04]){                 // tiny nudge absorbs rounding at the wall
      const f=((((v+off)-y0)/M)%1+1)%1;
      if(!out.some(x=>Math.abs(x-f)<0.004||Math.abs(x-f)>0.996))out.push(f);
    }
  }
  // with columns: offsets that put an aisle just clear of a column line, on either side
  if(fc.obs&&fc.obs.length){
    const lines=[...new Set(fc.obs.filter(o=>o.b.x1-o.b.x0<1.5&&o.b.y1-o.b.y0<1.5).map(o=>Math.round((o.b.y0+o.b.y1)/2*20)/20))];
    const h=Math.max(0.3,...fc.obs.filter(o=>o.b.y1-o.b.y0<1.5).map(o=>(o.b.y1-o.b.y0)/2));
    const fs=[];
    for(const v of lines)for(const a0 of [v+h+0.05,v-h-0.05-spec.A]){const f=((((a0-Dp)-y0)/M)%1+1)%1;if(!fs.some(x=>Math.abs(x-f)<0.01||Math.abs(x-f)>0.99))fs.push(f)}
    for(const f of fs.slice(0,10))if(!out.some(x=>Math.abs(x-f)<0.004||Math.abs(x-f)>0.996))out.push(f);
  }
  return out;
}
/* ---------- Zones ----------
   Lots with an inside corner (L, T, dog-leg) are also cut from that corner
   into two pieces. The piece on the street is laid out with its own grid and
   crossover; the other piece gets its own grid angle and is reached from an
   aisle or accessway end in the first piece, extended to the cut if needed. */
function polySplits(P){
  const n=P.length,sg=Math.sign(area(P))||1,A=Math.abs(area(P)),out=[];
  const clean=r=>r.filter((q,ix)=>len(sub(q,r[(ix+1)%r.length]))>0.05);
  for(let i=0;i<n;i++){
    const a=P[(i-1+n)%n],v=P[i],b=P[(i+1)%n];
    if(sg*cross(sub(v,a),sub(b,v))>=-1e-9)continue;              // not an inside corner
    for(const d of [unit(sub(v,a)),unit(sub(v,b))]){
      let best=null;
      for(let k=0;k<n;k++){
        if(k===i||(k+1)%n===i)continue;
        const p=P[k],q=P[(k+1)%n],e=sub(q,p),den=cross(d,e);if(Math.abs(den)<1e-12)continue;
        const w=sub(p,v),t=cross(w,e)/den,u=cross(w,d)/den;
        if(t>1e-6&&u>=-1e-9&&u<=1+1e-9&&(!best||t<best.t))best={t,k,h:add(v,mul(d,t))};
      }
      if(!best||!pip(add(v,mul(d,best.t/2)),P))continue;
      const k=best.k,h=best.h,p1=[v],p2=[h];
      for(let j=(i+1)%n;;j=(j+1)%n){p1.push(P[j]);if(j===k)break}
      p1.push(h);
      for(let j=(k+1)%n;;j=(j+1)%n){p2.push(P[j]);if(j===i)break}
      const P1=clean(p1),P2=clean(p2);if(P1.length<3||P2.length<3)continue;
      const a1=Math.abs(area(P1)),a2=Math.abs(area(P2));
      if(Math.min(a1,a2)<Math.max(300,A*0.12))continue;
      out.push({P1,P2,cut:[v,h],bal:Math.min(a1,a2)/A});
    }
  }
  out.sort((x,y)=>y.bal-x.bal);
  const uniq=[];for(const s of out)if(!uniq.some(u=>len(sub(u.cut[0],s.cut[0]))+len(sub(u.cut[1],s.cut[1]))<2))uniq.push(s);
  return uniq.slice(0,4);
}
function regionAlphas(P,base){
  const set=new Set(),addA=a=>{let d=((a/D2R)%180+180)%180;set.add(Math.round(d*100)/100)};
  addA(base);addA(base+90*D2R);
  for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];if(len(sub(b,a))>=8){const d=Math.atan2(b.y-a.y,b.x-a.x);addA(d);addA(d+90*D2R)}}
  return [...set].map(d=>d*D2R);
}
// synchronous search over a set of crossover contexts
function searchSync(ctxList,alphas,types,specO){
  const found=[];
  for(const a of alphas){
    const fcs=ctxList.map(c=>frameCache(c,a));
    for(const t of types){
      const modes=t==="p90"?["entry","left","right","loop","spineOnly"]:["loop"];
      const pitches=[0];const pp=rowPitch(fcs[0],t,specO);if(pp)pitches.push(pp);
      for(const pitch of pitches)for(const ph of rowPhases(fcs[0],t,specO,pitch))for(const m of modes){
        if(m==="spineOnly"&&ph!==0)continue;
        try{
          if(m==="entry"||m==="spineOnly"){for(let k=0;k<fcs.length;k++){const core=layoutCore(fcs[k],t,ph,m,fcs[k].E.x,specO,pitch);if(core){const r=attachCrossover(core,fcs[k],ctxList[k]);if(r){if(pitch)r.pitch=pitch;found.push(r)}}}}
          else{const core=layoutCore(fcs[0],t,ph,m,0,specO,pitch);if(core){let best=null;for(let k=0;k<fcs.length;k++){const r=attachCrossover(core,fcs[k],ctxList[k]);if(r&&(!best||r.total>best.total))best=r}if(best){if(pitch)best.pitch=pitch;found.push(best)}}}
        }catch(e){}
      }
    }
  }
  return found.sort((x,y)=>y.total-x.total||x.circA-y.circA);
}
// where the first zone's circulation can carry on into the second zone
function zoneConnectors(ra,cut,B,Qall){
  const d=unit(sub(cut[1],cut[0]));let nB={x:-d.y,y:d.x};const mid=mul(add(cut[0],cut[1]),0.5);
  if(!pip(add(mid,mul(nB,0.5)),B))nB=mul(nB,-1);
  const bayF=ra.bays.map(b=>({p:b.pts,b:bbox(b.pts)}));
  const free=p=>{if(!inside(p,Qall))return false;const bb=bbox(p);return !bayF.some(o=>bbHit(bb,o.b)&&sat(p,o.p))};
  const out=[];
  for(const R of [...ra.aisles.map(a=>a.pts),...ra.spines]){
    const c0=centroid(R);
    for(let i=0;i<R.length;i++){
      const a=R[i],b=R[(i+1)%R.length],el=len(sub(b,a));if(el>8.5||el<3)continue;     // aisle / accessway ends only
      const t=unit(sub(b,a));let n={x:-t.y,y:t.x};const m=mul(add(a,b),0.5);if((m.x-c0.x)*n.x+(m.y-c0.y)*n.y<0)n=mul(n,-1);
      if(n.x*nB.x+n.y*nB.y<0.5)continue;                                                  // must head into the second zone
      const den=cross(n,d);if(Math.abs(den)<1e-9)continue;
      const w=sub(cut[0],m),s=cross(w,d)/den,u=cross(w,n)/den;
      if(s<-0.3||s>30||u<-0.5||u>len(sub(cut[1],cut[0]))+0.5)continue;
      const rectC=s>0.3?[a,b,add(b,mul(n,s+0.05)),add(a,mul(n,s+0.05))]:null;
      if(rectC&&!free(rectC))continue;
      out.push({c:add(add(m,mul(n,Math.max(0,s))),mul(n,0.05)),n,rect:rectC,s:Math.max(0,s)});
    }
  }
  return out.sort((x,y)=>x.s-y.s).slice(0,3);
}
function combineZones(ra,rb,con,baseCtx){
  const bBays=rb.bays.map(b=>({...b,kind:b.kind==="acc"||b.kind==="shared"?"std":b.kind}));
  const extra=[];if(con.rect)extra.push({pts:con.rect,dir:0,a:centroid(con.rect),b:centroid(con.rect)});
  extra.push({pts:rb.stub,dir:0,a:centroid(rb.stub),b:centroid(rb.stub)});
  const bays=[...ra.bays,...bBays];
  return {...ra,ctx:baseCtx,bays,aisles:[...ra.aisles,...extra,...rb.aisles],spines:[...ra.spines,...rb.spines],
    total:bays.filter(b=>b.kind!=="shared").length,circA:ra.circA+rb.circA+extra.reduce((m,e)=>m+Math.abs(area(e.pts)),0),
    blind:ra.blind+rb.blind,runLen:ra.runLen+rb.runLen,zoned:{alphaB:rb.alpha,bays:rb.total},validated:false,infilled:false,oneWay:ra.oneWay&&rb.oneWay};
}
function zoneSearch(ctxs,types){
  const base=ctxs[0];const splits=polySplits(base.usable);if(!splits.length)return [];
  const out=[];
  const fs=base.site[base.fe],fe=base.site[(base.fe+1)%base.site.length];
  for(const sp of splits){
    let A=sp.P1,B=sp.P2;
    const inA=c=>pip(add(c.E,mul(c.nW,0.6)),A);
    let cA=ctxs.filter(inA);
    if(!cA.length){[A,B]=[B,A];cA=ctxs.filter(c=>pip(add(c.E,mul(c.nW,0.6)),A))}
    if(!cA.length)continue;
    const ctxA=cA.map(c=>({...c,usable:A}));
    const resA=searchSync(ctxA,regionAlphas(A,base.frontDir),types).slice(0,2);
    for(const ra of resA){
      for(const con of zoneConnectors(ra,sp.cut,B,base.usable)){
        const cB={entry:0,site:B,usable:B,E:con.c,nW:con.n,fe:-1,frontDir:Math.atan2(con.n.x,-con.n.y),siteArea:Math.abs(area(B))};
        const rb=searchSync([cB],regionAlphas(B,Math.atan2(sp.cut[1].y-sp.cut[0].y,sp.cut[1].x-sp.cut[0].x)),types)[0];
        if(!rb)continue;
        const orig=ctxs.find(c=>Math.abs(c.entry-ra.ctx.entry)<1e-9)||base;
        out.push(combineZones(ra,rb,con,orig));
      }
    }
  }
  return out;
}

/* ---------- Local infill ----------
   After the main grid is laid out, leftover space next to the circulation is
   filled with small layouts oriented to their own spot:
   1. carry an aisle on past where it stops, narrowing it to a Clause 52.06
      Table 2 width where it must and widening its bays to match;
   2. branch a new dead-end aisle off a bare aisle or accessway side, square
      to that side, with bays on both sides;
   3. line any bare aisle edge with 90 degree (or parallel) bays.
   Each round takes the move that adds the most bays, up to six rounds. */
function infillCombos(){
  const s=S.specs.p90;if(!s||!s.on)return [];
  const out=[{W:s.W,L:s.L,A:s.A}];
  for(const [W,A] of [[2.6,6.4],[2.8,5.8],[3.0,5.2],[3.2,4.8]])if(W>=s.W-1e-9&&A<=s.A+1e-9&&!out.some(c=>Math.abs(c.W-W)<1e-6&&Math.abs(c.A-A)<1e-6))out.push({W,L:s.L,A});
  return out.sort((a,b)=>a.W-b.W);
}
const unit=v=>{const l=Math.hypot(v.x,v.y)||1;return {x:v.x/l,y:v.y/l}};
function infill(r,ctx){
  if(r.infilled)return r;r.infilled=true;
  const combos=infillCombos();if(!combos.length)return r;
  const Q=ctx.usable,ext=S.blind?1.0:0;
  const occ=[...r.bays.map(b=>b.pts),...r.aisles.map(a=>a.pts),...r.spines,r.stub,...(ctx.obstacles||[])].map(p=>({p,b:bbox(p)}));
  const E0=ctx.E,throat=8; // keep the entry queuing area clear
  const free=pts=>{if(!inside(pts,Q))return false;if(pts.some(q=>Math.hypot(q.x-E0.x,q.y-E0.y)<throat))return false;const b=bbox(pts);for(const o of occ)if(bbHit(b,o.b)&&sat(pts,o.p))return false;return true};
  const quad=(o,t,n,s0,s1,d0,d1)=>[add(o,add(mul(t,s0),mul(n,d0))),add(o,add(mul(t,s1),mul(n,d0))),add(o,add(mul(t,s1),mul(n,d1))),add(o,add(mul(t,s0),mul(n,d1)))];
  // greedy bank of bays along a line: origin o, direction t over [0,len], bays grow towards n
  const bank=(o,t,n,len,W,L,extra)=>{const out=[];let s=0;while(s+W<=len+1e-6){const p=quad(o,t,n,s,s+W,0,L);const ok=free(p)&&!(extra&&extra.some(q=>bbHit(bbox(p),bbox(q))&&sat(p,q)));if(ok){out.push(p);s+=W}else s+=0.2}return out};
  // circulation rectangles we can grow from: [c0,c1,c2,c3]
  const circ=()=>[...r.aisles.map(a=>a.pts),...r.spines];
  const edgesOf=pts=>{const c=centroid(pts);return pts.map((a,i)=>{const b=pts[(i+1)%4],t=unit(sub(b,a)),m=mul(add(a,b),0.5);let n={x:-t.y,y:t.x};if((m.x-c.x)*n.x+(m.y-c.y)*n.y<0)n=mul(n,-1);return {a,b,t,n,len:len(sub(b,a))}})};
  const reach=(o,t,n,w,maxL)=>{let s=0;while(s+0.5<=maxL&&free(quad(o,t,n,0,w,s,s+0.5).map(p=>p)))s+=0.5;return s};
  const added={bays:0,aisles:0,narrow:new Set(),par:0};
  for(let round=0;round<6;round++){
    let best=null;
    const consider=c=>{if(c.bays.length&&(!best||c.bays.length>best.bays.length))best=c};
    for(const pts of circ()){
      const E=edgesOf(pts);const width=Math.min(E[0].len,E[1].len);
      for(const e of E){
        const isEnd=e.len<=width+1e-6;
        if(isEnd){
          // 0. bays facing straight onto the end of an aisle or accessway (corner pockets)
          for(const c of combos)consider({bays:bank(e.a,e.t,e.n,e.len,c.W,c.L),W:c.W,L:c.L,A:c.A,kind:"end"});
          // 1. carry the aisle on, flush to either side, at each Table 2 width that fits
          for(const c of combos){if(c.A>e.len+1e-6)continue;
            for(const flip of [0,1]){
              const o=flip?add(e.b,mul(e.t,-c.A)):e.a; // new aisle spans [o, o+t*A] across, grows along n
              const run=reach(o,e.t,e.n,c.A,120);if(run<c.L*0+5)continue;
              const aisle=quad(o,e.t,e.n,0,c.A,0.05,run);
              const use=run-ext;if(use<c.W)continue;
              // banks either side of the new aisle, bays facing it
              const left=bank(o,e.n,mul(e.t,-1),use,c.W,c.L,[aisle]);
              const right=bank(add(o,mul(e.t,c.A)),e.n,e.t,use,c.W,c.L,[aisle,...left]);
              consider({aisle,bays:[...left,...right],W:c.W,L:c.L,A:c.A,kind:"carry"});
            }}
        }else{
          // 3. bare side: line it with bays (90 degree at the aisle's own width, or parallel)
          const aw=width;
          for(const c of combos){if(c.A>aw+1e-6)continue;consider({bays:bank(e.a,e.t,e.n,e.len,c.W,c.L),W:c.W,L:c.L,A:c.A,kind:"side"});break}
          if(S.specs.par&&S.specs.par.on&&aw>=S.specs.par.A-1e-6){const p=S.specs.par;consider({bays:bank(e.a,e.t,e.n,e.len,p.L,p.W),W:p.W,L:p.L,A:p.A,kind:"par"})}
          // 2. branch a dead-end aisle square to this side
          const c0=combos.find(c=>Math.abs(c.A-S.specs.p90.A)<1e-6)||combos[0];
          for(let s=0;s+c0.A<=e.len+1e-6;s+=1.0){
            const o=add(e.a,mul(e.t,s));
            if(!free(quad(o,e.t,e.n,0,c0.A,0.05,0.55)))continue;
            const run=reach(o,e.t,e.n,c0.A,120);const use=run-ext;if(use<c0.W*2)continue;
            const aisle=quad(o,e.t,e.n,0,c0.A,0.05,run);
            const left=bank(o,e.n,mul(e.t,-1),use,c0.W,c0.L,[aisle]);
            const right=bank(add(o,mul(e.t,c0.A)),e.n,e.t,use,c0.W,c0.L,[aisle,...left]);
            if(left.length+right.length>=3)consider({aisle,bays:[...left,...right],W:c0.W,L:c0.L,A:c0.A,kind:"branch"});
          }
        }
      }
    }
    if(!best||best.bays.length<1)break;
    // commit
    if(best.aisle){const c=centroid(best.aisle);r.aisles.push({pts:best.aisle,dir:0,a:c,b:c,infill:true});occ.push({p:best.aisle,b:bbox(best.aisle)});added.aisles++;r.circA+=Math.abs(area(best.aisle))}
    for(const p of best.bays){r.bays.push({pts:p,kind:"std",t:best.kind==="par"?"par":"p90",W:best.W,L:best.L,infill:true});occ.push({p,b:bbox(p)})}
    added.bays+=best.bays.length;if(best.kind==="par")added.par+=best.bays.length;
    if(Math.abs(best.A-S.specs.p90.A)>1e-6&&best.kind!=="par"&&best.kind!=="end")added.narrow.add(`${best.W.toFixed(1)} × ${best.L} m bays on a ${best.A} m aisle`);
  }
  if(added.bays){r.total+=added.bays;r.infill={bays:added.bays,aisles:added.aisles,narrow:[...added.narrow],par:added.par}}
  return r;
}

/* ---------- Layout rule checker ----------
   Every layout shown is checked against hard rules, and bays that break one
   are removed before ranking:
   - the bay lies inside the usable lot;
   - it does not overlap another bay, an aisle, the accessway or the driveway;
   - it opens onto circulation through its entry edge (a short edge for
     90/60/45 degree bays, a long edge for parallel bays);
   - that circulation is connected back to the crossover. */
function validateLayout(r,ctx){
  if(r.validated)return r;
  const Q=ctx.usable;
  const circ=[r.stub,...r.spines,...r.aisles.map(a=>a.pts)].map((p,i)=>({p,b:bbox(p),i}));
  // connectivity from the crossover driveway (index 0)
  const grow=p=>{const c=centroid(p);return p.map(q=>{const d=sub(q,c),l=len(d)||1;return add(q,mul(d,0.15/l))})};
  const gp=circ.map(c=>{const p=grow(c.p);return {p,b:bbox(p)}});
  const reached=new Set([0]),stack=[0];
  while(stack.length){const i=stack.pop();for(let j=0;j<circ.length;j++){if(reached.has(j))continue;if(bbHit(gp[i].b,gp[j].b)&&sat(gp[i].p,gp[j].p)){reached.add(j);stack.push(j)}}}
  const live=circ.filter(c=>reached.has(c.i));
  const shrink=p=>{const c=centroid(p);return p.map(q=>add(c,mul(sub(q,c),0.995)))};
  const reasons={outside:0,overlap:0,unserved:0,disconnected:0};const badList=[];
  const obsW=(ctx.obstacles||[]).map(p=>({p,b:bbox(p)}));
  const keep=[];
  const placed=[];
  for(const b of r.bays){
    const pts=b.pts,bb=bbox(pts);
    if(!inside(shrink(pts),Q)){reasons.outside++;badList.push({why:'outside',b});continue}
    let bad=false;
    let hitWhat=null;for(const c of circ)if(bbHit(bb,c.b)&&sat(pts,c.p)){bad=true;hitWhat='circ'+c.i;break}
    if(!bad)for(const o of placed)if(bbHit(bb,o.b)&&sat(pts,o.p)){bad=true;hitWhat='bay';break}
    if(!bad)for(const o of obsW)if(bbHit(bb,o.b)&&sat(pts,o.p)){bad=true;hitWhat='obstacle';break}
    if(bad){reasons.overlap++;badList.push({why:'overlap',b,hitWhat});continue}
    if(b.kind!=="shared"){
      // entry edges: the two short edges (long edges for parallel bays)
      const E=pts.map((a,i)=>{const q=pts[(i+1)%4];return {a,q,l:len(sub(q,a))}});
      const sorted=E.slice().sort((x,y)=>x.l-y.l);
      const entry=b.t==="par"?sorted.slice(2):sorted.slice(0,2);
      const c0=centroid(pts);
      const opensOnto=set=>entry.some(e=>{const m=mul(add(e.a,e.q),0.5),d=sub(m,c0),n=mul(d,0.4/(len(d)||1)),pr=add(m,n);return set.some(c=>pr.x>=c.b.x0-1e-6&&pr.x<=c.b.x1+1e-6&&pr.y>=c.b.y0-1e-6&&pr.y<=c.b.y1+1e-6&&pip(pr,c.p))});
      if(!opensOnto(circ)){reasons.unserved++;continue}
      if(!opensOnto(live)){reasons.disconnected++;continue}
    }
    keep.push(b);placed.push({p:pts,b:bb});
  }
  // shared zones only stay next to a surviving accessible bay
  const accs=keep.filter(b=>b.kind==="acc");
  const kept=keep.filter(b=>b.kind!=="shared"||accs.some(a=>{const g=grow(a.pts);return sat(g,b.pts)}));
  const dropped=r.bays.filter(b=>b.kind!=="shared").length-kept.filter(b=>b.kind!=="shared").length;
  r.bays=kept;r.total=kept.filter(b=>b.kind!=="shared").length;r.acc=accs.length;
  r.issues={dropped,reasons,bad:badList};r.validated=true;
  return r;
}


/* One car park level, searched synchronously, for other pages (the feasibility planner).
   o: {usable: ring, entries: [{E, nW}] (crossover or ramp foot, nW pointing into the level),
       obstacles: [ring], alphas: [radians] (e.g. the column grid), W, L, A (90° bays and aisle),
       drvW, acc, keep}. The caller's own settings are untouched. Returns the best layouts, checked. */
function runSync(o){
  const prev=S;
  S={specs:{p90:{on:true,W:o.W||2.6,L:o.L||4.9,A:o.A||6.4},p60:{on:false,W:2.6,L:4.9,A:4.9},p45:{on:false,W:2.6,L:4.9,A:3.5},par:{on:false,W:2.3,L:6.7,A:3.6}},
     spineW:o.A||6.4,drvW:o.drvW||6.1,acc:o.acc||0,blind:true,wall:true,tablePairs:o.tablePairs!==false,obstacles:o.obstacles||[]};
  try{
    const Q=o.usable;
    // an entry whose driveway would run into an obstacle slides along the frontage to the nearest clear spots
    const entries=[];
    for(const en of o.entries){
      if(!S.obstacles.length||o.slide===false){entries.push(en);continue}
      const tg={x:-en.nW.y,y:en.nW.x},w2=S.drvW/2+0.1,clear=E=>{const r=[add(E,mul(tg,-w2)),add(E,mul(tg,w2)),add(add(E,mul(tg,w2)),mul(en.nW,12)),add(add(E,mul(tg,-w2)),mul(en.nW,12))],b=bbox(r);return !S.obstacles.some(ob=>bbHit(b,bbox(ob))&&sat(r,ob))};
      let got=0;for(let d=0;d<=4.5&&got<3;d+=0.25)for(const sg of d?[1,-1]:[1]){const E=add(en.E,mul(tg,sg*d));if(pip(add(E,mul(en.nW,0.5)),Q)&&clear(E)){entries.push({...en,E});got++;if(got>=3)break}}
      if(!got)entries.push(en);
    }
    const ctxs=entries.map((en,i)=>({entry:i,site:o.site||Q,usable:Q,E:en.E,nW:en.nW,fe:-1,frontDir:Math.atan2(en.nW.x,-en.nW.y),siteArea:Math.abs(area(Q)),obstacles:S.obstacles}));
    const set=new Map(),addA=a=>{const d=((a/D2R)%180+180)%180,k=Math.round(d*100);if(!set.has(k))set.set(k,d*D2R)};
    for(const a of o.alphas||[]){addA(a);addA(a+Math.PI/2)}
    for(const a of regionAlphas(Q,ctxs[0].frontDir))addA(a);
    const alphas=[...set.values()];
    let found=searchSync(ctxs,alphas,["p90"]);
    const firstA=[...new Set(found.slice(0,6).map(r=>r.alpha))];
    for(const sp of tablePairs())found=found.concat(searchSync(ctxs,firstA,["p90"],sp));
    const rank=(a,b)=>(b.validated?1:0)-(a.validated?1:0)||b.total-a.total||a.circA-b.circA;
    found.sort((a,b)=>b.total-a.total||a.circA-b.circA);
    for(const r of found.slice(0,12)){try{infill(r,r.ctx)}catch(e){}}
    for(const r of found.slice(0,30)){try{validateLayout(r,r.ctx)}catch(e){}}
    found=found.filter(r=>!r.validated||r.total>0).sort(rank);
    return found.slice(0,o.keep||3);
  }finally{S=prev}
}
window.CARPARK={runSync,setup,sub,add,mul,cross,len,nrm,area,inward,inset,pip,segX,inside,bbox,bbHit,sat,lineInts,isect,stripInts,rect,inRect,centroid,unit,
  shapeFor,buildCtx,frameCache,layoutCore,attachCrossover,tablePairs,rowPhases,rowPitch,polySplits,regionAlphas,searchSync,zoneConnectors,combineZones,zoneSearch,infillCombos,infill,validateLayout};
})();
