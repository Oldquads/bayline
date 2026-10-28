/* Structural grid: angle, lines, columns, snapping, and how well the spacing suits a car park below. */
(function(){
"use strict";
const {area,bbox,pip,D2R}=window.G;

/* grid angle in radians: set by the user, or square to the street frontage */
function angle(P){
  if(P.grid&&P.grid.angle!=null&&isFinite(P.grid.angle))return P.grid.angle*D2R;
  const s=P.site.pts,i=Math.min(P.site.front||0,s.length-1),a=s[i],b=s[(i+1)%s.length];
  return Math.atan2(b.y-a.y,b.x-a.x);
}
/* world <-> grid frame (u along the street, v across) */
function frame(P){
  const t=angle(P),c=Math.cos(t),s=Math.sin(t),o={x:+P.grid.ox||0,y:+P.grid.oy||0};
  return {t,toG:p=>({u:(p.x-o.x)*c+(p.y-o.y)*s,v:-(p.x-o.x)*s+(p.y-o.y)*c}),toW:(u,v)=>({x:o.x+u*c-v*s,y:o.y+u*s+v*c})};
}
/* grid line positions covering a set of points */
function lines(P,pts){
  const F=frame(P),g=P.grid,us=pts.map(p=>F.toG(p));
  const bb={u0:Math.min(...us.map(q=>q.u)),u1:Math.max(...us.map(q=>q.u)),v0:Math.min(...us.map(q=>q.v)),v1:Math.max(...us.map(q=>q.v))};
  const U=[],V=[];
  for(let k=Math.ceil(bb.u0/g.sx);k*g.sx<=bb.u1+1e-6;k++)U.push(k*g.sx);
  for(let k=Math.ceil(bb.v0/g.sy);k*g.sy<=bb.v1+1e-6;k++)V.push(k*g.sy);
  return {F,U,V,bb};
}
/* column positions inside a floorplate shape, skipping any inside a core */
function columns(P,shape,cores){
  const outer=shape.filter(r=>area(r)>0),holes=shape.filter(r=>area(r)<0);
  if(!outer.length)return [];
  const L=lines(P,outer.flat()),out=[];
  for(const u of L.U)for(const v of L.V){
    const p=L.F.toW(u,v);
    if(!outer.some(r=>pip(p,r))||holes.some(r=>pip(p,r)))continue;
    if(cores.some(c=>pip(p,c.outline)))continue;
    out.push(p);
  }
  return out;
}
/* move a core so its edges sit on grid lines (only when it is square to the grid) */
function snap(P,inst,geo){
  const F=frame(P),g=P.grid;
  const rel=(((inst.rot||0)*D2R-F.t)%(Math.PI/2)+Math.PI/2)%(Math.PI/2);
  if(Math.min(rel,Math.PI/2-rel)>0.01)return {x:inst.x,y:inst.y};
  const q=F.toG({x:inst.x,y:inst.y}),us=geo.outline.map(p=>F.toG(p).u),vs=geo.outline.map(p=>F.toG(p).v);
  const hu=(Math.max(...us)-Math.min(...us))/2,hv=(Math.max(...vs)-Math.min(...vs))/2;
  const s=(x,h,step)=>{const lo=Math.round((x-h)/step)*step+h,hi=Math.round((x+h)/step)*step-h;return Math.abs(lo-x)<=Math.abs(hi-x)?lo:hi};
  const w=F.toW(s(q.u,hu,g.sx),s(q.v,hv,g.sy));return {x:w.x,y:w.y};
}

/* How a column spacing suits parking.
   Across the bays: how many bays fit between columns, and what is left over.
   Along the rows: the bay + aisle + bay module repeats every 2L + A, and a column line must
   never land in an aisle. Finds the best offset and counts column lines that would. */
function across(S,c){const n=Math.floor((S-c.col)/c.W+1e-9),spare=S-c.col-n*c.W;return {S,n,spare,ok:n>=2&&spare<=0.3,meh:n>=2&&spare<=0.9}}
function along(S,c,span){
  const M=2*c.L+c.A,count=Math.max(2,Math.floor(span/S)+1);
  let best={hits:1e9,o:0};
  for(let o=0;o<M;o+=0.05){let h=0;for(let k=0;k<count;k++){const x=((o+k*S)%M+M)%M;if(x>c.L+0.05&&x<c.L+c.A-0.05)h++}if(h<best.hits)best={hits:h,o}}
  return {S,M,hits:best.hits,lines:count,ok:best.hits===0};
}
function carpark(P,span){
  const c={W:+P.park.W||2.6,L:+P.park.L||4.9,A:+P.park.A||6.4,col:+P.grid.col||0.6},g=P.grid;
  const opt=[{dir:"x",ac:across(g.sx,c),al:along(g.sy,c,span)},{dir:"y",ac:across(g.sy,c),al:along(g.sx,c,span)}];
  const score=o=>(o.ac.ok?2:o.ac.meh?1:0)+(o.al.ok?2:0)-o.ac.spare/10;
  opt.sort((a,b)=>score(b)-score(a));
  return {c,best:opt[0],other:opt[1]};
}

window.GRID={angle,frame,lines,columns,snap,carpark};
})();
