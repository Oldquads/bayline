/* Bayline shared map: MapLibre + OpenFreeMap base map, Vicmap lots, roads, addresses and planning
   zones/overlays. Same queries as the car park page (see docs/vicmap.md). Plain script, exposes window.VM. */
(function(){
"use strict";
const {area,pip,bbox,inward,inter,shapeArea,D2R}=window.G;
const WFS="https://opendata.maps.vic.gov.au/geoserver/wfs";
const LON0=144.96,LAT0=-37.81,KX=111320*Math.cos(LAT0*D2R),KY=110574;
const toM=(lon,lat)=>({x:(lon-LON0)*KX,y:(lat-LAT0)*KY});
const toLL=(x,y)=>[LON0+x/KX,LAT0+y/KY];
const LOTZ=15.4,T2={lon:0.006,lat:0.005},VICMAP_CAP=5000;
const M={parcels:new Map(),roads:new Map(),tiles:new Map(),addr:new Map(),sel:null,map:null,ready:false,marker:null,opts:null};
const titleCase=t=>String(t).toLowerCase().replace(/\b([a-z])/g,c=>c.toUpperCase()).replace(/\b(\d+)([a-z])\b/gi,(m,a,b)=>a+b.toUpperCase());

async function wfs(url,signal){const r=await fetch(url,{signal});if(!r.ok)throw {code:"http",message:"Vicmap answered "+r.status};return r.json()}
const boxURL=b=>`${WFS}?service=WFS&version=1.1.0&request=GetFeature&typeName=open-data-platform:v_parcel_mp,open-data-platform:tr_road&propertyName=(parcel_spi,parcel_road,geom)(road_name,road_type,class_code,geom)&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=5000&bbox=${b.map(v=>v.toFixed(6)).join(",")},EPSG:4326`;
function ingest(fc){
  for(const f of fc.features||[]){
    const g=f.geometry;if(!g)continue;
    const kind=String(f.id||"").split(".")[0];const p=f.properties||{};
    if(kind==="tr_road"){
      if(M.roads.has(f.id))continue;
      const lines=(g.type==="LineString"?[g.coordinates]:g.type==="MultiLineString"?g.coordinates:[]).map(l=>l.map(c=>toM(c[0],c[1])));
      M.roads.set(f.id,{name:p.road_name&&p.road_name!=="UNNAMED"?p.road_name:"",type:p.road_type||"",cls:p.class_code==null?6:+p.class_code,lines,bb:bbox(lines.flat())});
    }else if(kind==="v_parcel_mp"){
      const polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
      if(!polys.length)continue;
      const key=(p.parcel_spi||"")+"|"+polys[0][0][0].join(",");
      if(M.parcels.has(key))continue;
      const rings=polys.map(pg=>pg[0].map(c=>toM(c[0],c[1])));
      M.parcels.set(key,{key,spi:p.parcel_spi||"",road:p.parcel_road==="Y",rings,ll:polys.map(pg=>pg[0]),bb:bbox(rings.flat()),area:rings.reduce((m,r)=>m+Math.abs(area(r)),0)});
    }
  }
}
const setStat=t=>{const el=M.opts&&M.opts.stat;if(el){el.textContent=t;el.hidden=!t}};
function lotsFC(){const fs=[];for(const p of M.parcels.values()){if(p.road)continue;fs.push({type:"Feature",properties:{key:p.key},geometry:{type:"MultiPolygon",coordinates:p.ll.map(r=>[r])}})}return {type:"FeatureCollection",features:fs}}
let lotsRaf=0;function pushLots(){cancelAnimationFrame(lotsRaf);lotsRaf=requestAnimationFrame(()=>{const s=M.map&&M.map.getSource("lots");if(s)s.setData(lotsFC())})}
let inflight=0;const queue=[];
function pump(){while(inflight<4&&queue.length){const job=queue.shift();inflight++;job().finally(()=>{inflight--;pump();stat()})}}
function stat(){if(!M.map)return;const n=inflight+queue.length;setStat(n?`Loading lots from Vicmap… ${n} area${n>1?"s":""} left`:M.map.getZoom()<LOTZ?"Zoom in to see lot boundaries":"")}
let tileTmr=null;function refreshTiles(){clearTimeout(tileTmr);tileTmr=setTimeout(loadTiles,120)}
function loadTiles(){
  const map=M.map;if(!map)return;
  if(map.getZoom()<LOTZ){queue.length=0;stat();return}
  const b=map.getBounds(),w=b.getWest(),e=b.getEast(),s=b.getSouth(),n=b.getNorth();
  const want=[];
  for(let ix=Math.floor(w/T2.lon);ix<=Math.floor(e/T2.lon);ix++)for(let iy=Math.floor(s/T2.lat);iy<=Math.floor(n/T2.lat);iy++)want.push([ix,iy]);
  const c=map.getCenter();want.sort((p,q)=>Math.hypot((p[0]+.5)*T2.lon-c.lng,(p[1]+.5)*T2.lat-c.lat)-Math.hypot((q[0]+.5)*T2.lon-c.lng,(q[1]+.5)*T2.lat-c.lat));
  const keep=new Set(want.map(([x,y])=>x+","+y));
  for(let i=queue.length-1;i>=0;i--)if(!keep.has(queue[i].k)){M.tiles.delete(queue[i].k);queue.splice(i,1)}
  for(const [ix,iy] of want){const k=ix+","+iy;if(M.tiles.has(k))continue;M.tiles.set(k,"loading");
    const box=[ix*T2.lon,iy*T2.lat,(ix+1)*T2.lon,(iy+1)*T2.lat];
    const job=()=>loadBox(box,0,0).then(()=>{M.tiles.set(k,"ok")}).catch(()=>{M.tiles.delete(k);setStat("Vicmap didn't answer for part of the map. Move the map to retry.")});
    job.k=k;queue.push(job)}
  pump();stat();
}
/* Vicmap returns at most 5,000 features per request: split full answers into quarters. */
async function loadBox(b,depth,attempt){
  let fc;
  try{fc=await wfs(boxURL(b))}
  catch(e){if(attempt<2){await new Promise(r=>setTimeout(r,600*(attempt+1)));return loadBox(b,depth,attempt+1)}throw e}
  if((fc.features||[]).length>=VICMAP_CAP&&depth<4){
    const mx=(b[0]+b[2])/2,my=(b[1]+b[3])/2;
    await Promise.all([[b[0],b[1],mx,my],[mx,b[1],b[2],my],[b[0],my,mx,b[3]],[mx,my,b[2],b[3]]].map(q=>loadBox(q,depth+1,0)));
    return;
  }
  ingest(fc);pushLots();afterLoad();
}
let pendingPick=null,pendingAddr=null;
function afterLoad(){if(pendingPick){const p=parcelAt(pendingPick);if(p){select(p,pendingAddr);pendingPick=null}}}
function parcelAt(pt){let best=null;for(const p of M.parcels.values()){if(pt.x<p.bb.x0||pt.x>p.bb.x1||pt.y<p.bb.y0||pt.y>p.bb.y1)continue;if(p.rings.some(r=>pip(pt,r))&&(!best||(best.road&&!p.road)||(p.road===best.road&&p.area<best.area)))best=p}return best}
function panelPad(){return window.innerWidth>760?{top:40,bottom:40,left:392,right:60}:{top:30,bottom:30,left:30,right:30}}
function flyToLL(lon,lat,zoom){M.map&&M.map.flyTo({center:[lon,lat],zoom,padding:panelPad(),speed:1.6})}
function setGeo(src,fc){const s=M.map&&M.ready&&M.map.getSource(src);if(s)s.setData(fc)}
function drawSel(){
  const fs=[];const p=M.sel;
  if(p){fs.push({type:"Feature",properties:{kind:"lot"},geometry:{type:"MultiPolygon",coordinates:p.ll.map(r=>[r])}});
    if(p.frontWorld)fs.push({type:"Feature",properties:{kind:"front"},geometry:{type:"LineString",coordinates:p.frontWorld.map(q=>toLL(q.x,q.y))}})}
  setGeo("sel",{type:"FeatureCollection",features:fs});
}
function setPin(lon,lat){if(!M.map)return;if(!M.marker){const el=document.createElement("div");el.className="pin";M.marker=new maplibregl.Marker({element:el,anchor:"bottom"})}M.marker.setLngLat([lon,lat]).addTo(M.map)}
function clearPin(){if(M.marker)M.marker.remove()}

function init(opts){
  M.opts=opts;
  if(typeof maplibregl==="undefined"){opts.onFail&&opts.onFail("The map library didn't load. Check your internet connection and reload the page.");return false}
  const map=new maplibregl.Map({container:opts.container,style:"https://tiles.openfreemap.org/styles/positron",center:[144.96,-37.83],zoom:window.innerWidth>760?9.4:8.6,minZoom:5,maxZoom:19.5,
    maxBounds:[[139.5,-40.5],[151.5,-33.2]],attributionControl:false,dragRotate:false,pitchWithRotate:false});
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
  map.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-right");
  map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:"Lots, roads, addresses & planning: Vicmap © State of Victoria, CC BY 4.0"}),"bottom-right");
  M.map=map;
  if(window.innerWidth>760)map.setPadding({left:372,top:0,right:0,bottom:0});
  map.on("load",()=>{
    const firstSymbol=(map.getStyle().layers.find(l=>l.type==="symbol")||{}).id;
    const acc=opts.accent||"#E2B007",ink="#1E292D";
    map.addSource("lots",{type:"geojson",data:lotsFC(),promoteId:"key"});
    map.addSource("saved",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addSource("sel",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"lots-fill",type:"fill",source:"lots",minzoom:14,paint:{"fill-color":"#ffffff","fill-opacity":0.01}},firstSymbol);
    map.addLayer({id:"lots-hover",type:"fill",source:"lots",minzoom:14,paint:{"fill-color":acc,"fill-opacity":["case",["boolean",["feature-state","hover"],false],0.22,0]}},firstSymbol);
    map.addLayer({id:"lots-line",type:"line",source:"lots",minzoom:14,paint:{"line-color":"#8E959A","line-opacity":["interpolate",["linear"],["zoom"],14,0.2,16,0.7],"line-width":["interpolate",["linear"],["zoom"],15,0.4,18,1.1]}},firstSymbol);
    map.addLayer({id:"saved-line",type:"line",source:"saved",paint:{"line-color":"#2C6A88","line-width":1.6,"line-dasharray":[2,1.5]}});
    map.addLayer({id:"sel-fill",type:"fill",source:"sel",filter:["==",["get","kind"],"lot"],paint:{"fill-color":acc,"fill-opacity":0.42}});
    map.addLayer({id:"sel-line",type:"line",source:"sel",filter:["==",["get","kind"],"lot"],paint:{"line-color":ink,"line-width":2.2}});
    map.addLayer({id:"sel-front",type:"line",source:"sel",filter:["==",["get","kind"],"front"],layout:{"line-cap":"round"},paint:{"line-color":ink,"line-width":5}});
    M.ready=true;drawSel();loadTiles();opts.onReady&&opts.onReady();
    if(pendingFit){const f=pendingFit;pendingFit=null;fitRing(f)}
  });
  map.on("moveend",refreshTiles);
  map.on("zoomend",stat);
  let hoverKey=null;
  const setHover=k=>{if(hoverKey===k)return;if(hoverKey!=null)map.setFeatureState({source:"lots",id:hoverKey},{hover:false});hoverKey=k;if(k!=null)map.setFeatureState({source:"lots",id:k},{hover:true})};
  map.on("mousemove",e=>{if(!M.ready)return;if(map.getZoom()<LOTZ){map.getCanvas().style.cursor="";setHover(null);return}
    const f=map.queryRenderedFeatures(e.point,{layers:["lots-fill"]})[0];setHover(f?f.id:null);map.getCanvas().style.cursor=f?"pointer":""});
  map.on("mouseout",()=>setHover(null));
  map.on("click",e=>{
    if(!M.ready)return;
    if(map.getZoom()<LOTZ){map.easeTo({center:e.lngLat,zoom:Math.min(17,Math.max(LOTZ+1.2,map.getZoom()+3)),duration:700});return}
    const p=parcelAt(toM(e.lngLat.lng,e.lngLat.lat));
    if(p&&!p.road){clearPin();select(p,null)}
  });
  return true;
}
let pendingFit=null;
function fitRing(ring){
  if(!M.map||!M.ready){pendingFit=ring;return}
  let w=999,s=999,e=-999,n=-999;for(const [x,y] of ring){w=Math.min(w,x);e=Math.max(e,x);s=Math.min(s,y);n=Math.max(n,y)}
  M.map.fitBounds([[w,s],[e,n]],{padding:panelPad(),maxZoom:18.2,duration:900});
}
function showSaved(rings){setGeo("saved",{type:"FeatureCollection",features:rings.map(r=>({type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[r.concat([r[0]])]}}))})}
/* jump to a ring and select the lot under its middle once lots load */
function goToRing(ring,addr){fitRing(ring);const r=ring.map(q=>toM(q[0],q[1]));const bb=bbox(r);pendingPick={x:(bb.x0+bb.x1)/2,y:(bb.y0+bb.y1)/2};pendingAddr=addr;if(M.ready)afterLoad()}

/* selection -> simplified ring, frontage and road names (same rules as the car park page) */
function dpSimplify(pts,tol){
  if(pts.length<3)return pts;const a=pts[0],b=pts.at(-1);let i=0,dm=-1;const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1e-9;
  for(let k=1;k<pts.length-1;k++){const d=Math.abs(dy*(pts[k].x-a.x)-dx*(pts[k].y-a.y))/L;if(d>dm){dm=d;i=k}}
  return dm>tol?dpSimplify(pts.slice(0,i+1),tol).slice(0,-1).concat(dpSimplify(pts.slice(i),tol)):[a,b];
}
function lotGeometry(p){
  let ri=0,ba=-1;p.rings.forEach((r,i)=>{const a=Math.abs(area(r));if(a>ba){ba=a;ri=i}});
  let pts=p.rings[ri].slice();if(pts.length>1&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<0.05)pts.pop();
  const clean=[pts[0]];for(const q of pts.slice(1))if(Math.hypot(q.x-clean.at(-1).x,q.y-clean.at(-1).y)>0.05)clean.push(q);
  let far=0,fd=-1;clean.forEach((q,i)=>{const d=Math.hypot(q.x-clean[0].x,q.y-clean[0].y);if(d>fd){fd=d;far=i}});
  const s=dpSimplify(clean.slice(0,far+1),0.3).slice(0,-1).concat(dpSimplify(clean.slice(far).concat([clean[0]]),0.3).slice(0,-1));
  const sg=Math.sign(area(s))||1,roadsNear=[...M.roads.values()].filter(r=>r.name&&!/TUNNEL|FREEWAY/.test(r.name+" "+r.type)&&r.bb.x1>p.bb.x0-40&&r.bb.x0<p.bb.x1+40&&r.bb.y1>p.bb.y0-40&&r.bb.y0<p.bb.y1+40);
  const reserves=[...M.parcels.values()].filter(q=>q.road&&q.bb.x1>p.bb.x0-5&&q.bb.x0<p.bb.x1+5&&q.bb.y1>p.bb.y0-5&&q.bb.y0<p.bb.y1+5);
  const edges=s.map((a,i)=>{
    const b=s[(i+1)%s.length],L=Math.hypot(b.x-a.x,b.y-a.y),m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},n=inward(s,i,sg),out={x:m.x-n.x*1.5,y:m.y-n.y*1.5};
    const onReserve=reserves.some(q=>q.rings.some(r=>pip(out,r)));
    let name=null,type="",bd=1e9;
    for(const rd of roadsNear)for(const ln of rd.lines)for(let j=0;j+1<ln.length;j++){
      const u=ln[j],v=ln[j+1],dx=v.x-u.x,dy=v.y-u.y,l2=dx*dx+dy*dy||1e-9,tt=Math.max(0,Math.min(1,((m.x-u.x)*dx+(m.y-u.y)*dy)/l2));
      const d=Math.hypot(m.x-u.x-tt*dx,m.y-u.y-tt*dy);
      let ang=Math.abs(Math.atan2((b.y-a.y)*dx-(b.x-a.x)*dy,(b.x-a.x)*dx+(b.y-a.y)*dy))/D2R;ang=Math.min(ang,180-ang);
      if(ang<30&&d<bd){bd=d;name=rd.name;type=rd.type}
    }
    const front=L>2&&(onReserve||bd<25);
    return {i,L,front,name:front&&bd<35?(name+(type?" "+type:"")):null};
  });
  const cands=edges.filter(e=>e.front);
  const fe=(cands.length?cands:edges).reduce((m,e)=>e.L>m.L?e:m);
  return {ring:s.map(q=>toLL(q.x,q.y).map(v=>+v.toFixed(7))),front:fe.i,roads:cands.filter(e=>e.name).map(e=>({edge:e.i,road:e.name})),area:Math.abs(area(s)),frontWorld:[s[fe.i],s[(fe.i+1)%s.length]],frontLen:fe.L};
}
function lookupAddress(p){
  if(M.addr.has(p.key))return Promise.resolve(M.addr.get(p.key));
  const b=p.ll.flat().reduce((m,c)=>[Math.min(m[0],c[0]),Math.min(m[1],c[1]),Math.max(m[2],c[0]),Math.max(m[3],c[1])],[999,999,-999,-999]);
  const pad=0.00015,bb=[b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad].map(v=>v.toFixed(6)).join(",");
  const url=`${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=open-data-platform:address&count=400&outputFormat=application/json&srsName=EPSG:4326&propertyName=ezi_address,is_primary,geom&bbox=${bb},EPSG:4326`;
  return wfs(url).then(fc=>{
    const pts=(fc.features||[]).filter(f=>f.geometry&&f.geometry.type==="Point").map(f=>({a:f.properties.ezi_address,prim:f.properties.is_primary==="Y",pt:toM(f.geometry.coordinates[0],f.geometry.coordinates[1])}));
    let inside=pts.filter(q=>p.rings.some(r=>pip(q.pt,r)));
    if(!inside.length){const cx=(p.bb.x0+p.bb.x1)/2,cy=(p.bb.y0+p.bb.y1)/2;const near=pts.map(q=>({...q,d:Math.hypot(q.pt.x-cx,q.pt.y-cy)})).sort((x,y)=>x.d-y.d);if(near[0]&&near[0].d<Math.max(20,Math.hypot(p.bb.x1-p.bb.x0,p.bb.y1-p.bb.y0)/2))inside=[near[0]]}
    const uniq=[...new Map(inside.map(q=>[q.a,q])).values()].sort((x,y)=>(y.prim-x.prim)||x.a.localeCompare(y.a,undefined,{numeric:true}));
    const res={main:uniq[0]?uniq[0].a:null,all:uniq.map(q=>q.a)};M.addr.set(p.key,res);return res;
  });
}
function select(p,addr){
  M.sel=p;const geo=lotGeometry(p);p.geo=geo;p.frontWorld=geo.frontWorld;if(addr)p.addr=addr;
  drawSel();
  M.opts.onSelect&&M.opts.onSelect(p,geo,lookupAddress(p));
}

/* address search: resolves to [{label, lon, lat}] */
const ABBR={ST:"STREET",RD:"ROAD",AVE:"AVENUE",AV:"AVENUE",DR:"DRIVE",CT:"COURT",PL:"PLACE",CRES:"CRESCENT",CR:"CRESCENT",HWY:"HIGHWAY",PDE:"PARADE",LA:"LANE",LN:"LANE",TCE:"TERRACE",GR:"GROVE",CL:"CLOSE",BVD:"BOULEVARD",BLVD:"BOULEVARD",SQ:"SQUARE",CCT:"CIRCUIT",HTS:"HEIGHTS",ESP:"ESPLANADE"};
function addrPattern(q){
  const t=q.toUpperCase().replace(/[,]/g," ").replace(/\bVIC(TORIA)?\b/g," ").split(/\s+/).filter(Boolean).map(x=>ABBR[x]||x).map(x=>x.replace(/'/g,"''"));
  return /^\d/.test(t[0]||"")&&t.length>1?t[0]+" "+t.slice(1).join("%"):t.join("%");
}
async function search(q){
  const pat=addrPattern(q);const num=/^\d/.test(pat);
  const cql=num?`ezi_address ILIKE '${pat}%' OR ezi_address ILIKE '%/${pat}%'`:`ezi_address ILIKE '%${pat}%'`;
  const url=`${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=open-data-platform:address&count=12&outputFormat=application/json&srsName=EPSG:4326&propertyName=ezi_address,geom&CQL_FILTER=${encodeURIComponent(cql)}`;
  const fc=await wfs(url);
  return (fc.features||[]).filter(f=>f.geometry).map(f=>({label:titleCase(f.properties.ezi_address),raw:f.properties.ezi_address,lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}));
}
function pickAddress(r){setPin(r.lon,r.lat);const pt=toM(r.lon,r.lat);pendingPick=pt;pendingAddr=r.raw;flyToLL(r.lon,r.lat,17.6);const h=parcelAt(pt);if(h){select(h,r.raw);pendingPick=null}}

/* Planning zones and overlays over a lot (Vicmap Planning plan_zone / plan_overlay).
   Returns [{code, desc, pct}] sorted by share of the lot covered. */
function pickField(props,res){for(const re of res){const k=Object.keys(props).find(k=>re.test(k));if(k&&props[k]!=null&&props[k]!=="")return String(props[k])}return ""}
async function planningLayer(ring,layer){
  const lot=[ring.map(q=>toM(q[0],q[1]))];if(area(lot[0])<0)lot[0].reverse();
  const lotA=shapeArea(lot);
  const b=ring.reduce((m,c)=>[Math.min(m[0],c[0]),Math.min(m[1],c[1]),Math.max(m[2],c[0]),Math.max(m[3],c[1])],[999,999,-999,-999]);
  const url=`${WFS}?service=WFS&version=1.1.0&request=GetFeature&typeName=open-data-platform:${layer}&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=300&bbox=${b.map(v=>v.toFixed(6)).join(",")},EPSG:4326`;
  const fc=await wfs(url);
  const acc=new Map();
  for(const f of fc.features||[]){
    const g=f.geometry,p=f.properties||{};if(!g)continue;
    const code=pickField(p,[/^zone_code$/i,/^overlay_code$/i,/code$/i]);if(!code)continue;
    const desc=pickField(p,[/^zone_description$/i,/description/i,/desc/i]);
    const lga=pickField(p,[/^lga$/i,/lga_name/i,/scheme/i]);
    const polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
    let a=0;
    for(const pg of polys){const rings=pg.map(r=>r.map(c=>toM(c[0],c[1])));const outer=rings[0];if(area(outer)<0)outer.reverse();const holes=rings.slice(1).map(h=>area(h)>0?h.slice().reverse():h);a+=shapeArea(inter(lot,[outer,...holes]))}
    if(a<0.5)continue;
    const o=acc.get(code)||{code,desc,lga,a:0};o.a+=a;acc.set(code,o);
  }
  return [...acc.values()].map(o=>({code:o.code,desc:o.desc?titleCase(o.desc):"",lga:o.lga?titleCase(o.lga):"",pct:Math.min(100,Math.round(o.a/lotA*1000)/10)})).sort((x,y)=>y.pct-x.pct);
}
async function planningAt(ring){
  const [zones,overlays]=await Promise.all([planningLayer(ring,"plan_zone"),planningLayer(ring,"plan_overlay").catch(()=>null)]);
  return {zones,overlays};
}

window.VM={init,search,pickAddress,goToRing,showSaved,planningAt,titleCase,get selected(){return M.sel}};
})();
