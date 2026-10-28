/* Bayline shared geometry. Plain script (no modules) so pages also run from file://.
   Local coordinates are metres, x east, y north. Polygon booleans use Clipper (clipper-lib),
   which works in integers, so everything is scaled by CS before it goes in. */
(function(){
"use strict";
const D2R=Math.PI/180;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}),mul=(a,k)=>({x:a.x*k,y:a.y*k});
const cross=(a,b)=>a.x*b.y-a.y*b.x,dot=(a,b)=>a.x*b.x+a.y*b.y,len=a=>Math.hypot(a.x,a.y),nrm=a=>{const l=len(a)||1;return {x:a.x/l,y:a.y/l}};
function area(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y}return s/2}
function inward(p,i,sg){const a=p[i],b=p[(i+1)%p.length],e=nrm(sub(b,a));return sg>0?{x:-e.y,y:e.x}:{x:e.y,y:-e.x}}
function pip(pt,Q){let c=false;for(let i=0,j=Q.length-1;i<Q.length;j=i++){const a=Q[i],b=Q[j];if((a.y>pt.y)!==(b.y>pt.y)&&pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)c=!c}return c}
function bbox(P){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of P){if(p.x<x0)x0=p.x;if(p.y<y0)y0=p.y;if(p.x>x1)x1=p.x;if(p.y>y1)y1=p.y}return {x0,y0,x1,y1}}
function centroid(P){let x=0,y=0;for(const p of P){x+=p.x;y+=p.y}return {x:x/P.length,y:y/P.length}}

/* lon/lat ring -> local metres around its own centroid, shifted so the bbox starts at 0,0 (same as the car park page) */
function projectRing(ring){
  const lon0=ring.reduce((m,p)=>m+p[0],0)/ring.length,lat0=ring.reduce((m,p)=>m+p[1],0)/ring.length;
  const kx=111320*Math.cos(lat0*D2R),ky=110574;
  let pts=ring.map(p=>({x:(p[0]-lon0)*kx,y:(p[1]-lat0)*ky}));
  if(pts.length>1&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<0.05)pts.pop();
  const bb=bbox(pts);
  return {pts:pts.map(p=>({x:+(p.x-bb.x0).toFixed(2),y:+(p.y-bb.y0).toFixed(2)})),
    toLL:(x,y)=>[lon0+(x+bb.x0)/kx,lat0+(y+bb.y0)/ky],
    toLocal:(lon,lat)=>({x:(lon-lon0)*kx-bb.x0,y:(lat-lat0)*ky-bb.y0})};
}

/* ---------- Clipper wrappers. A "shape" is an array of rings; outer rings are CCW, holes CW. ---------- */
const CS=1000;
const C=()=>window.ClipperLib;
const toC=r=>r.map(p=>({X:Math.round(p.x*CS),Y:Math.round(p.y*CS)}));
const fromC=r=>r.map(p=>({x:p.X/CS,y:p.Y/CS}));
function bool(type,a,b){
  const L=C();if(!L)throw new Error("Clipper not loaded");
  const c=new L.Clipper();
  c.AddPaths(a.map(toC),L.PolyType.ptSubject,true);
  if(b&&b.length)c.AddPaths(b.map(toC),L.PolyType.ptClip,true);
  const out=new L.Paths();
  c.Execute(type(L.ClipType),out,L.PolyFillType.pftNonZero,L.PolyFillType.pftNonZero);
  return out.map(fromC).filter(r=>Math.abs(area(r))>0.01);
}
const union=(a,b)=>bool(t=>t.ctUnion,a,b||[]);
const diff=(a,b)=>bool(t=>t.ctDifference,a,b);
const inter=(a,b)=>bool(t=>t.ctIntersection,a,b);
const shapeArea=s=>s.reduce((m,r)=>m+area(r),0);
/* buffer of an open path (segment) by d metres with round ends: every point within d of it */
function segBuffer(a,b,d){
  const L=C();const co=new L.ClipperOffset(2,0.05*CS);
  co.AddPath(toC([a,b]),L.JoinType.jtRound,L.EndType.etOpenRound);
  const out=new L.Paths();co.Execute(out,d*CS);return out.map(fromC);
}
/* The part of the site outside every edge's setback, with setbacks measured square to each
   boundary (a mitred offset, as drawn by hand). Each edge removes the band between it and its
   offset line, ended where that line meets the neighbouring edges' offset lines. A plain
   rectangle per edge backs this up where the mitre point is unusable (near-parallel or very
   sharp corners, or a short edge swallowed by its neighbours). */
function setbackShape(site,ds){
  const pts=area(site)<0?site.slice().reverse():site.slice(),n=pts.length;
  const D=area(site)<0?ds.slice().reverse().map((_,i,a)=>a[(i+1)%n]):ds; // edge i of the reversed ring is edge n-2-i of the original
  const lines=pts.map((a,i)=>{const b=pts[(i+1)%n],e=nrm(sub(b,a)),nw={x:-e.y,y:e.x};return {a,b,e,nw,d:Math.max(0,D[i]||0),P:add(a,mul(nw,Math.max(0,D[i]||0)))}});
  const meet=(l1,l2)=>{const c=cross(l1.e,l2.e);if(Math.abs(c)<0.05)return null;const t=cross(sub(l2.P,l1.P),l2.e)/c;return add(l1.P,mul(l1.e,t))};
  const zones=[];
  lines.forEach((l,i)=>{
    if(l.d<=0.001)return;
    const A2=add(l.a,mul(l.nw,l.d)),B2=add(l.b,mul(l.nw,l.d));
    zones.push([l.a,l.b,B2,A2]);
    const lim=3*Math.max(l.d,1)+len(sub(l.b,l.a));
    for(const [j,end] of [[(i-1+n)%n,l.a],[(i+1)%n,l.b]]){
      const m=meet(l,lines[j]);if(!m||len(sub(m,end))>lim)continue;
      const tri=[end,end===l.a?A2:B2,m];if(Math.abs(area(tri))>1e-4)zones.push(area(tri)<0?tri.reverse():tri);
    }
  });
  return zones.length?diff([pts],zones):[pts];
}
/* uniform offset of a shape (negative shrinks) */
function offsetShape(shape,d){
  const L=C();const co=new L.ClipperOffset(2,0.05*CS);
  co.AddPaths(shape.map(toC),L.JoinType.jtMiter,L.EndType.etClosedPolygon);
  const out=new L.Paths();co.Execute(out,d*CS);return out.map(fromC);
}

window.G={D2R,sub,add,mul,cross,dot,len,nrm,area,inward,pip,bbox,centroid,projectRing,union,diff,inter,shapeArea,segBuffer,setbackShape,offsetShape};
})();
