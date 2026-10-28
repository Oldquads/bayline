/* Bayline Feasibility: site -> planning controls -> envelope -> level stack -> core -> grid. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const {area,bbox,inward,shapeArea,projectRing}=window.G;
const R=window.RULES,E=window.ENV,C=window.CORES,GR=window.GRID;
const fmt=(v,d=0)=>(v==null||!isFinite(v))?"–":(+v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- State ---------- */
const KEY="bayline-feas-v1",SITES_KEY="bayline-sites";
let uid=1;const nid=()=>"g"+Date.now().toString(36)+(uid++);
const clone=o=>JSON.parse(JSON.stringify(o));
function exampleSite(){const pts=[{x:0,y:0},{x:32,y:0},{x:32,y:48},{x:0,y:48}];return {id:"example",address:"Example site 32 × 48 m",spi:"",ring:null,pts,front:0,roads:[],edges:E.classifyEdges(pts,0,[])}}
function defaultStack(key,ctl){
  const z=R.ZONES[key];
  if(z&&z.preset==="rescode")return [{id:nid(),type:"ground",name:"Ground",floors:1,ftf:3.2,use:"apartments"},{id:nid(),type:"tower",name:"Upper levels",floors:Math.max(0,(z.storeys||3)-1),ftf:3.1,use:"apartments"}];
  return [{id:nid(),type:"ground",name:"Ground",floors:1,ftf:4.2,use:"retail"},{id:nid(),type:"podium",name:"Podium",floors:2,ftf:3.2,use:"apartments"},{id:nid(),type:"tower",name:"Tower typical A",floors:4,ftf:3.1,use:"apartments"}];
}
function ctlFromPreset(ctl,key){const p=R.PRESETS[key];ctl.preset=key;ctl.bands=clone(p.bands);ctl.rescode=p.rescode;return ctl}
function defaultProject(){
  const ctl=ctlFromPreset({height:22,storeys:null,far:null,coverage:null,garden:null,roof:1,excludeCarpark:true},"podiumTower");
  return ensure({v:1,site:exampleSite(),zone:{key:"",code:"",desc:"",sched:"",auto:false},overlays:[],planning:"none",ctl,stack:defaultStack("MUZ"),aptSize:68,effApt:78,spaceArea:30,view:"plan",rot:0,sel:null});
}
/* fields added after phase 1; fills them in on older saved projects */
function ensure(o){
  o.cores=o.cores||[];if(o.coreAuto==null)o.coreAuto=true;o.coreSel=o.coreSel||0;
  o.grid={sx:8.4,sy:8.4,angle:null,ox:0,oy:0,col:0.6,snap:true,...(o.grid||{})};
  o.park={W:2.6,L:4.9,A:6.4,...(o.park||{})};
  o.coreRules={aptsPerLift:60,aptDepth:9,travel:6,exitsApart:45,...(o.coreRules||{})};
  o.coreView={cat:"all",suit:true,...(o.coreView||{})};
  return o;
}
function gridOrigin(site){const a=site.pts[Math.min(site.front||0,site.pts.length-1)];return {ox:a.x,oy:a.y}}
function load(){try{const o=JSON.parse(localStorage.getItem(KEY)||"null");if(o&&o.v===1&&o.site&&o.site.pts&&o.stack)return o}catch(e){}return null}
const saved=load();let P=saved?ensure(saved):defaultProject();
let saveT=null;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}},200)}

function applyEff(){for(const g of P.stack)g.eff=g.use==="apartments"?P.effApt/100:undefined}

/* ---------- Site loading ---------- */
function siteFromDoc(doc){
  const pr=projectRing(doc.ring);const pts=pr.pts;
  const front=Math.min(doc.front||0,pts.length-1);
  return {id:doc.id||"site",address:doc.address||"",spi:doc.spi||"",ring:doc.ring,pts,front,roads:doc.roads||[],edges:E.classifyEdges(pts,front,doc.roads||[])};
}
function loadSite(doc,opts={}){
  P.site=siteFromDoc(doc);P.sel=null;P.cores=[];P.coreSel=0;P.coreAuto=true;Object.assign(P.grid,gridOrigin(P.site),{angle:null});
  P.zone={key:"",code:"",desc:"",sched:"",auto:false};P.overlays=[];
  renderAll();
  if(opts.planning!==false)lookupPlanning();
}
function lookupPlanning(){
  const ring=P.site.ring;if(!ring){P.planning="none";renderPlanning();return}
  P.planning="loading";renderPlanning();
  const id=P.site.id;
  VM.planningAt(ring).then(res=>{if(P.site.id!==id)return;setPlanning(res)}).catch(()=>{if(P.site.id!==id)return;P.planning="failed";
    if(!P.zone.key)resetForZone("");renderPlanning()});
}
/* planning lookup result -> zone defaults, default stack, then fill to the limits */
function setPlanning(res){
  const z=res.zones&&res.zones[0];
  P.zones=res.zones||[];P.overlays=res.overlays||[];P.planning=res.overlays?"ok":"partial";
  if(z){const key=R.zoneKey(z.code)||"";P.zone={key,code:z.code,desc:z.desc,sched:(String(z.code).match(/(\d+)$/)||["",""])[1],auto:true,lga:z.lga}}
  resetForZone(P.zone.key);
}
function resetForZone(key){
  const z=R.ZONES[key];const siteArea=Math.abs(area(P.site.pts));
  const ctl=ctlFromPreset({height:z?z.height:null,storeys:z?z.storeys:null,far:null,coverage:z&&z.preset==="rescode"?60:null,garden:z&&z.garden?(R.gardenMin(siteArea)||null):null,roof:P.ctl.roof!=null?P.ctl.roof:1,excludeCarpark:P.ctl.excludeCarpark!==false},z?z.preset:"podiumTower");
  if(!z&&P.ctl.height)ctl.height=P.ctl.height;
  P.ctl=ctl;P.stack=defaultStack(key);$("#maxMsg").textContent="";P.cores=[];P.coreSel=0;P.coreAuto=true;
  fillToLimits(true);renderAll();
}
function fillToLimits(quiet){
  applyEff();const m=E.maxOut(P);if(!m)return;
  if(m.capped&&!P.ctl.height&&!P.ctl.storeys&&!P.ctl.far){if(!quiet)$("#maxMsg").textContent="Set a height, storey or FAR limit first: with no limit the tower could keep going.";return}
  P.stack[m.group].floors=m.floors;
  if(!quiet)$("#maxMsg").textContent=`${P.stack[m.group].name} set to ${m.floors} floor${m.floors===1?"":"s"}. One more would break: ${m.governs.join(", ")}.`;
}

/* ---------- Compute + render ---------- */
let RES=null,MAX=null;
function recompute(){
  applyEff();
  if(!window.ClipperLib){$("#summary").innerHTML=`<p class="hint">The geometry library didn't load. Check your connection and reload.</p>`;return}
  RES=E.compute(P);MAX=E.maxOut(P);
  if(P.coreAuto&&!P.cores.length&&C.lib){const s=C.suggest(P,RES);P.coreAuto=false;if(s.length){P.cores=s;P.coreSel=0;renderCores()}}
  RES.coreArea=P.cores.map(C.geom).filter(Boolean).reduce((m,g)=>m+g.area,0);
  if(C.lib)RES.checks.push(...C.checks(P,RES,P.cores));
  RES.checks.push(...gridChecks());
  renderSummary();renderStackOut();renderSched();renderCoreNeed();renderGridFit();draw();save();
}
let rT=null;function schedule(){clearTimeout(rT);rT=setTimeout(recompute,60)}

function renderAll(){renderSite();renderPlanning();renderControls();renderStack();renderCores();renderGrid();recompute()}

/* site + edges */
const EDGE_LABEL={street:"Street",side:"Side",rear:"Rear",lane:"Lane"};
let hlEdge=-1;
function renderSite(){
  const s=P.site,n=s.pts.length,A=Math.abs(area(s.pts));s.perim=s.pts.reduce((m,p,i)=>m+Math.hypot(s.pts[(i+1)%n].x-p.x,s.pts[(i+1)%n].y-p.y),0);
  const nm=s.address||"Unnamed site";$("#siteName").textContent=nm===nm.toUpperCase()?VM.titleCase(nm):nm;
  $("#siteMeta").textContent=`${fmt(A)} m²${s.spi?" · "+s.spi:""}`;
  const tb=$("#edgeTable tbody");tb.innerHTML="";
  for(let i=0;i<n;i++){
    const a=s.pts[i],b=s.pts[(i+1)%n],L=Math.hypot(b.x-a.x,b.y-a.y);
    const road=(s.roads.find(r=>r.edge===i)||{}).road||"";
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="num">${i+1}</td><td class="num">${L.toFixed(1)} m</td><td><select aria-label="Edge ${i+1} type">${R.EDGE_TYPES.map(t=>`<option value="${t}"${s.edges[i]===t?" selected":""}>${EDGE_LABEL[t]}</option>`).join("")}</select></td><td class="road" title="${esc(VM.titleCase(road))}">${esc(VM.titleCase(road))||"–"}</td>`;
    tr.querySelector("select").addEventListener("change",e=>{s.edges[i]=e.target.value;schedule()});
    tr.addEventListener("mouseenter",()=>{hlEdge=i;draw()});tr.addEventListener("mouseleave",()=>{hlEdge=-1;draw()});
    tb.appendChild(tr);
  }
  renderSites();
}

/* planning */
function renderPlanning(){
  const st={none:P.site.ring?"":"example site",loading:"looking up Vicmap…",failed:"lookup failed",ok:"from Vicmap",partial:"zone from Vicmap"}[P.planning]||"";
  $("#planState").textContent=st;
  const sel=$("#zone");
  sel.innerHTML=`<option value="">Not set</option>`+Object.entries(R.ZONES).map(([k,z])=>`<option value="${k}"${P.zone.key===k?" selected":""}>${k} · ${z.name}</option>`).join("");
  $("#zoneSched").value=P.zone.sched||"";
  const z=R.ZONES[P.zone.key];
  const others=(P.zones||[]).slice(1).filter(x=>x.pct>=1);
  let html="";
  if(P.zone.code)html+=`<b>${esc(P.zone.code)}</b> ${esc(P.zone.desc||"")}${P.zone.lga?` · ${esc(P.zone.lga)}`:""}${(P.zones&&P.zones[0]&&P.zones[0].pct<99)?` · ${P.zones[0].pct}% of lot`:""}<br>`;
  if(others.length)html+=`Also zoned ${others.map(o=>`${esc(o.code)} (${o.pct}%)`).join(", ")}.<br>`;
  if(z)html+=esc(z.note)+" Check the planning scheme.";
  else if(P.planning==="failed")html+="Vicmap Planning didn't answer. Pick the zone and enter the controls.";
  else if(!P.site.ring)html+="Pick a lot on the map to look up its zone and overlays, or choose a zone.";
  $("#zoneInfo").innerHTML=html;
  const ov=$("#overlays");ov.innerHTML="";
  if(P.planning==="ok"&&!P.overlays.length)ov.innerHTML=`<p class="hint">No overlays on this lot.</p>`;
  for(const o of P.overlays){
    const d=document.createElement("div");d.className="ov";
    d.innerHTML=`<b>${esc(o.code)}</b><span>${o.pct<99?o.pct+"% of lot · ":""}${esc(R.overlayNote(o.code))}</span>`;
    ov.appendChild(d);
  }
}
function numOrNull(v){const n=parseFloat(v);return isFinite(n)&&n>0?n:null}
function renderControls(){
  const c=P.ctl;
  $("#cHeight").value=c.height??"";$("#cStoreys").value=c.storeys??"";$("#cFar").value=c.far??"";
  $("#cCov").value=c.coverage??"";$("#cGarden").value=c.garden??"";$("#cRoof").value=c.roof??0;
  $("#rescode").checked=!!c.rescode;$("#exclCar").checked=c.excludeCarpark!==false;
  $("#preset").innerHTML=Object.entries(R.PRESETS).map(([k,p])=>`<option value="${k}"${c.preset===k?" selected":""}>${p.label}</option>`).join("")+`<option value="custom"${c.preset==="custom"?" selected":""}>Custom</option>`;
  $("#aptSize").value=P.aptSize;$("#effApt").value=P.effApt;
  renderBands();
}
function renderBands(){
  const tb=$("#bandTable tbody");tb.innerHTML="";
  P.ctl.bands.forEach((b,i)=>{
    const last=i===P.ctl.bands.length-1;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><input type="number" step="0.5" min="0" data-k="upTo" value="${b.upTo??""}" placeholder="${last?"top":""}" aria-label="Band ${i+1} up to height"></td>`+
      R.EDGE_TYPES.map(t=>`<td><input type="number" step="0.5" min="0" data-k="${t}" value="${b[t]}" aria-label="Band ${i+1} ${t} setback"></td>`).join("")+
      `<td>${P.ctl.bands.length>1?`<button class="x" type="button" aria-label="Remove band ${i+1}">×</button>`:""}</td>`;
    tr.querySelectorAll("input").forEach(inp=>inp.addEventListener("input",()=>{
      const k=inp.dataset.k,v=parseFloat(inp.value);
      b[k]=k==="upTo"?(isFinite(v)&&v>0?v:null):(isFinite(v)?Math.max(0,v):0);
      P.ctl.preset="custom";$("#preset").value="custom";schedule();
    }));
    const x=tr.querySelector(".x");if(x)x.addEventListener("click",()=>{P.ctl.bands.splice(i,1);P.ctl.preset="custom";renderControls();schedule()});
    tb.appendChild(tr);
  });
}

/* level stack */
const TOWER_COLS=["#3D7FA6","#5E9CC0","#86B6D1","#2B5F80","#A7C9DC"];
function groupColor(g){
  if(g.type==="ground")return "#B49A6A";
  if(g.type==="podium")return "#6F9B8E";
  const towers=P.stack.filter(x=>x.type==="tower");return TOWER_COLS[Math.max(0,towers.indexOf(g))%TOWER_COLS.length];
}
function renderStack(){
  const box=$("#stack");box.innerHTML="";
  P.stack.forEach((g,i)=>{
    const d=document.createElement("div");d.className="grp"+(P.sel===g.id?" sel":"");d.dataset.id=g.id;
    d.innerHTML=`<div class="sw" style="background:${groupColor(g)}"></div><div class="body">
      <div class="head"><input type="text" value="${esc(g.name)}" aria-label="Group name"><small>${R.LEVEL_TYPES[g.type]}</small>${P.stack.length>1?`<button class="x" type="button" aria-label="Remove ${esc(g.name)}">×</button>`:""}</div>
      <div class="vals">
        <div class="fld"><label class="cap">Floors</label><input type="number" min="0" step="1" data-k="floors" value="${g.floors}"></div>
        <div class="fld"><label class="cap">Floor to floor</label><input type="number" min="2.4" step="0.05" data-k="ftf" value="${g.ftf}"></div>
        <div class="fld"><label class="cap">Use</label><select data-k="use">${Object.entries(R.USES).map(([k,u])=>`<option value="${k}"${g.use===k?" selected":""}>${u.label}</option>`).join("")}</select></div>
      </div>
      <div class="out" data-out></div></div>`;
    d.querySelector(".head input").addEventListener("input",e=>{g.name=e.target.value;renderSched();save()});
    d.querySelectorAll("[data-k]").forEach(inp=>inp.addEventListener(inp.tagName==="SELECT"?"change":"input",()=>{
      const k=inp.dataset.k;g[k]=k==="use"?inp.value:(parseFloat(inp.value)||0);schedule()}));
    const x=d.querySelector(".x");if(x)x.addEventListener("click",e=>{e.stopPropagation();P.stack.splice(i,1);renderStack();schedule()});
    d.addEventListener("click",e=>{if(e.target.closest("input,select,button"))return;P.sel=P.sel===g.id?null:g.id;box.querySelectorAll(".grp").forEach(el=>el.classList.toggle("sel",el.dataset.id===P.sel));draw();save()});
    box.appendChild(d);
  });
}
function lvl(s){return s===1?"G":"L"+(s-1)}
function renderStackOut(){
  if(!RES)return;
  for(const g of RES.groups){
    const el=document.querySelector(`.grp[data-id="${g.id}"] [data-out]`);if(!el)continue;
    if(!g.floors){el.textContent="No floors";continue}
    el.innerHTML=`<span>${lvl(g.storeyFrom)}${g.floors>1?"–"+lvl(g.storeyTo):""}</span><span>${fmt(g.z0,1)}–${fmt(g.z1,1)} m</span><span>${fmt(g.fpArea)} m² plate</span>${g.apts?`<span>≈ ${g.apts} apts</span>`:""}${g.spaces?`<span>≈ ${g.spaces} cars</span>`:""}`;
  }
}

/* summary */
function renderSummary(){
  const r=RES,c=P.ctl;
  const gov=MAX?(MAX.capped?"No height, storey or FAR limit stops the tower.":
    (()=>{const g=P.stack[MAX.group],d=MAX.floors-g.floors;const w=MAX.governs.map(x=>({height:"height",storeys:"storey limit",FAR:"floor area ratio",setbacks:"setbacks"}[x]||x)).join(" and ");
      return d>0?`Room for ${d} more ${g.name} floor${d>1?"s":""} before the ${w} limit.`:d===0?`${w[0].toUpperCase()+w.slice(1)} ${MAX.governs.length>1?"govern":"governs"}: the stack is at the limit.`:`Over the limit: remove ${-d} ${g.name} floor${d<-1?"s":""} (${w}).`})()):"";
  const lim=(v,l,u="")=>l?`${v} <span style="color:var(--muted)">/ ${l}${u}</span>`:v;
  $("#summary").innerHTML=`
    <div><div class="cap">Gross floor area</div><div class="big"><b>${fmt(r.gfa)}</b><span>m²</span></div></div>
    ${gov?`<div class="gov">${esc(gov)}</div>`:""}
    <dl class="kv">
      <dt>Site area</dt><dd>${fmt(r.siteArea)} m²</dd>
      <dt>Height</dt><dd>${lim(fmt(r.height,1),c.height&&fmt(c.height,1)," m")}${c.height?"":" m"}</dd>
      <dt>Storeys</dt><dd>${lim(r.storeys,c.storeys)}</dd>
      <dt>Floor area ratio</dt><dd>${lim(r.far.toFixed(2),c.far&&(+c.far).toFixed(2))}:1</dd>
      <dt>Net saleable area</dt><dd>${fmt(r.nsa)} m²</dd>
      <dt>Apartments</dt><dd>≈ ${fmt(r.apts)}</dd>
      ${r.spaces?`<dt>Car spaces (podium)</dt><dd>≈ ${fmt(r.spaces)}</dd>`:""}
      <dt>Core per floor</dt><dd>${P.cores.length?`${fmt(r.coreArea)} m²`:"–"}</dd>
      <dt>Site coverage</dt><dd>${lim(fmt(r.coverage),c.coverage,"%")}${c.coverage?"":"%"}</dd>
      <dt>Open area</dt><dd>${fmt(r.garden)}%</dd>
    </dl>
    <ul class="checks">${r.checks.map(([k,t])=>`<li><span class="pill ${k}">${k==="ok"?"OK":k==="bad"?"Fail":k==="warn"?"Check":"Note"}</span><span>${esc(t)}</span></li>`).join("")}</ul>`;
}

/* area schedule */
function schedRows(){
  const rows=RES.groups.slice().reverse().filter(g=>g.floors).map(g=>({name:g.name,levels:lvl(g.storeyFrom)+(g.floors>1?"–"+lvl(g.storeyTo):""),floors:g.floors,ftf:g.ftf,top:g.z1,plate:g.fpArea,core:RES.coreArea||0,gfa:g.gfa,use:R.USES[g.use].label,nsa:g.nsa,count:g.apts?`≈ ${g.apts} apts`:g.spaces?`≈ ${g.spaces} cars`:""}));
  return rows;
}
function renderSched(){
  if(!RES)return;
  const rows=schedRows();
  $("#schedNote").textContent=`${RES.storeys} storeys · ${fmt(RES.height,1)} m`;
  $("#sched").innerHTML=`<thead><tr><th>Group</th><th>Levels</th><th>Floors</th><th>F–F m</th><th>Top m</th><th>Plate m²</th><th>Core m²</th><th>GFA m²</th><th>Use</th><th>NSA m²</th><th>Count</th></tr></thead><tbody>`+
    rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.levels}</td><td>${r.floors}</td><td>${fmt(r.ftf,2)}</td><td>${fmt(r.top,1)}</td><td>${fmt(r.plate)}</td><td>${fmt(r.core)}</td><td>${fmt(r.gfa)}</td><td style="font-family:var(--f-body)">${r.use}</td><td>${fmt(r.nsa)}</td><td>${r.count}</td></tr>`).join("")+
    `<tr class="tot"><td>Total</td><td></td><td>${RES.storeys}</td><td></td><td>${fmt(RES.height,1)}</td><td></td><td></td><td>${fmt(RES.gfa)}</td><td></td><td>${fmt(RES.nsa)}</td><td>${RES.apts?`≈ ${RES.apts} apts`:""}</td></tr></tbody>`;
}
function saveCSV(){
  const rows=schedRows();const q=v=>`"${String(v).replace(/"/g,'""')}"`;
  const lines=[["Site",P.site.address],["Zone",P.zone.code||P.zone.key],["Site area m2",Math.round(RES.siteArea)],["Cores",P.cores.map(c=>c.core+(c.variant?" ("+c.variant+")":"")).join(" + ")||"none"],["Grid m",`${P.grid.sx} x ${P.grid.sy}`],[],["Group","Levels","Floors","Floor to floor m","Top m","Floorplate m2","Core m2 per floor","GFA m2","Use","NSA m2","Count"],
    ...rows.map(r=>[r.name,r.levels,r.floors,r.ftf,r.top.toFixed(1),Math.round(r.plate),Math.round(r.core),Math.round(r.gfa),r.use,Math.round(r.nsa),r.count]),
    ["Total","",RES.storeys,"",RES.height.toFixed(1),"","",Math.round(RES.gfa),"",Math.round(RES.nsa),RES.apts]];
  const blob=new Blob([lines.map(l=>l.map(q).join(",")).join("\n")],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`feasibility-${(P.site.address||"site").replace(/[^A-Za-z0-9]+/g,"-").toLowerCase()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

/* ---------- Drawing ---------- */
const cv=$("#view");
function canvasSize(){const r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;const W=Math.max(10,r.width),H=Math.max(10,r.height);if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}return {W,H,dpr}}
function hexA(col,a){const m=/^#?([0-9a-f]{6})$/i.exec(col);if(!m)return col;const n=parseInt(m[1],16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`}
function draw(){if(!RES)return;P.view==="3d"?draw3d():drawPlan();renderLegend()}
function renderLegend(){
  $("#legend").innerHTML=RES.groups.filter(g=>g.floors).map(g=>`<span><i style="background:${hexA(groupColor(g),0.45)};border-color:${groupColor(g)}"></i>${esc(g.name)}</span>`).join("")+
    `<span><i style="border:1.5px dashed var(--accent);background:transparent"></i>Envelope at ${P.ctl.height?"height limit":"top of building"}</span>`;
}
function envelopeTop(){return P.ctl.height||Math.max(RES.height,3)}
let slicesKey="",slicesCache=[];
function slices(){const top=envelopeTop();const k=JSON.stringify([P.site.pts,P.site.edges,P.ctl.bands,P.ctl.rescode,top]);if(k!==slicesKey){slicesKey=k;slicesCache=E.envelopeSlices(P,top)}return slicesCache}
function path(g,T,ring){g.beginPath();ring.forEach((p,i)=>{const q=T(p);i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)});g.closePath()}
function drawPlan(){
  const {W,H,dpr}=canvasSize(),g=cv.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);
  const c={bg:css("--surface"),ink:css("--ink"),muted:css("--muted"),site:css("--site"),sunk:css("--sunk"),accent:css("--accent"),rule:css("--rule")};
  g.fillStyle=c.bg;g.fillRect(0,0,W,H);
  const pts=P.site.pts,bb=bbox(pts),pad=56;
  const k=Math.min((W-2*pad)/Math.max(1,bb.x1-bb.x0),(H-2*pad)/Math.max(1,bb.y1-bb.y0));
  const ox=(W-(bb.x1-bb.x0)*k)/2-bb.x0*k,oy=(H+(bb.y1-bb.y0)*k)/2+bb.y0*k;
  const T=p=>({x:ox+p.x*k,y:oy-p.y*k});
  planT={inv:(x,y)=>({x:(x-ox)/k,y:(oy-y)/k}),k};
  path(g,T,pts);g.fillStyle=c.sunk;g.fill();
  // envelope slices (dashed)
  g.save();g.setLineDash([6,5]);g.lineWidth=1.2;g.strokeStyle=c.accent;
  for(const s of slices())for(const r of s.shape){path(g,T,r);g.stroke()}
  g.restore();
  // floorplates, bottom to top
  for(const gr of RES.groups){
    if(!gr.floors)continue;const col=groupColor(gr),sel=P.sel===gr.id;
    for(const r of gr.fp){path(g,T,r);g.fillStyle=hexA(col,sel?0.5:0.16);g.fill();g.lineWidth=sel?2.4:1.4;g.strokeStyle=col;g.stroke()}
  }
  drawGrid(g,T,c);
  const ccol={...c,lift:css("--rule"),stair:c.bg,riser:hexA("#8E959A",0.55),lobby:c.sunk};
  P.cores.forEach((inst,i)=>{const geo=C.geom(inst);if(geo)C.draw(g,T,geo,ccol,i,i===P.coreSel)});
  // boundary, edges by type
  const n=pts.length,sg=Math.sign(area(pts))||1;
  g.font=`500 11px "IBM Plex Mono",monospace`;g.textAlign="center";g.textBaseline="middle";
  for(let i=0;i<n;i++){
    const a=pts[i],b=pts[(i+1)%n],t=P.site.edges[i];
    const A=T(a),B=T(b);g.beginPath();g.moveTo(A.x,A.y);g.lineTo(B.x,B.y);
    g.lineWidth=i===hlEdge?6:t==="street"?4.5:2;g.strokeStyle=i===hlEdge?c.accent:t==="street"?c.ink:c.site;g.stroke();
    const L=Math.hypot(b.x-a.x,b.y-a.y);if(i!==hlEdge&&(L<4||(n>8&&L<Math.max(10,P.site.perim/n*1.2)&&t!=="street")))continue;
    const nw=inward(pts,i,sg),m={x:(a.x+b.x)/2-nw.x*16/k,y:(a.y+b.y)/2-nw.y*16/k},q=T(m);
    const sb=E.setbackAt(P.ctl,t,0.1);
    const txt=`${i+1} ${EDGE_LABEL[t].toUpperCase()} · ${L.toFixed(1)} m${sb?` · ${sb.toFixed(1)} m setback`:""}`;
    const w=g.measureText(txt).width+8;q.x=Math.min(W-w/2-2,Math.max(w/2+2,q.x));g.fillStyle=c.bg;g.fillRect(q.x-w/2,q.y-8,w,16);g.fillStyle=t==="street"?c.ink:c.muted;g.fillText(txt,q.x,q.y);
  }
  // north arrow + scale bar
  g.fillStyle=c.ink;g.beginPath();g.moveTo(W-28,18);g.lineTo(W-35,38);g.lineTo(W-28,33);g.lineTo(W-21,38);g.closePath();g.fill();
  g.font=`600 11px "Barlow",sans-serif`;g.fillText("N",W-28,48);
  const step=[5,10,20,50,100].find(v=>v*k>70)||100,px=step*k,x0=16,y0=H-18;
  g.fillRect(x0,y0,px/2,4);g.strokeStyle=c.ink;g.lineWidth=1;g.strokeRect(x0+0.5,y0+0.5,px,4);
  g.font=`500 10px "IBM Plex Mono",monospace`;g.textAlign="left";g.fillText("0",x0-2,y0-8);g.textAlign="right";g.fillText(`${step} m`,x0+px+4,y0-8);
}
function draw3d(){
  const {W,H,dpr}=canvasSize(),g=cv.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);
  const c={bg:css("--surface"),ink:css("--ink"),muted:css("--muted"),site:css("--site"),sunk:css("--sunk"),accent:css("--accent")};
  g.fillStyle=c.bg;g.fillRect(0,0,W,H);
  const az=(45+90*(P.rot||0))*Math.PI/180,el=32*Math.PI/180,se=Math.sin(el),ce=Math.cos(el);
  const ca=Math.cos(az),sa=Math.sin(az);
  const U=p=>p.x*ca-p.y*sa,V=p=>p.x*sa+p.y*ca;
  const raw=(p,z)=>({x:U(p),y:-(V(p)*se+z*ce)});
  const top=Math.max(envelopeTop(),RES.height);
  const all=[];for(const p of P.site.pts){all.push(raw(p,0),raw(p,top))}
  const bb=bbox(all),pad=40,k=Math.min((W-2*pad)/Math.max(1,bb.x1-bb.x0),(H-2*pad)/Math.max(1,bb.y1-bb.y0));
  const ox=(W-(bb.x1-bb.x0)*k)/2-bb.x0*k,oy=(H-(bb.y1-bb.y0)*k)/2-bb.y0*k;
  const T=(p,z)=>{const q=raw(p,z);return {x:ox+q.x*k,y:oy+q.y*k}};
  const poly=(ring,z)=>{g.beginPath();ring.forEach((p,i)=>{const q=T(p,z);i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)});g.closePath()};
  poly(P.site.pts,0);g.fillStyle=c.sunk;g.fill();g.lineWidth=1.5;g.strokeStyle=c.site;g.stroke();
  // envelope wireframe
  g.save();g.setLineDash([5,4]);g.lineWidth=1;g.strokeStyle=hexA(c.accent.startsWith("#")?c.accent:"#E2B007",0.9);
  for(const s of slices())for(const r of s.shape){poly(r,s.z1);g.stroke();for(const p of r){if(r.length>40)break;const a=T(p,s.z0),b=T(p,s.z1);g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke()}}
  g.restore();
  // groups as prisms, bottom to top; walls facing the viewer, far ones first
  for(const gr of RES.groups){
    if(!gr.floors)continue;const col=groupColor(gr),sel=P.sel===gr.id;
    const rings=gr.fp.filter(r=>area(r)>0);
    const walls=[];
    for(const r of rings)for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length],ex=b.x-a.x,ey=b.y-a.y,L=Math.hypot(ex,ey);if(L<1e-6)continue;
      const nx=ey/L,ny=-ex/L; // outward for CCW rings
      const nv=nx*sa+ny*ca;if(nv>=-1e-6)continue; // faces away
      const nu=nx*ca-ny*sa;walls.push({a,b,d:(V(a)+V(b))/2,shade:0.55+0.35*Math.max(0,-nu*0.6-nv*0.4)});
    }
    walls.sort((p,q)=>q.d-p.d);
    for(const w of walls){
      const A0=T(w.a,gr.z0),B0=T(w.b,gr.z0),B1=T(w.b,gr.z1),A1=T(w.a,gr.z1);
      g.beginPath();g.moveTo(A0.x,A0.y);g.lineTo(B0.x,B0.y);g.lineTo(B1.x,B1.y);g.lineTo(A1.x,A1.y);g.closePath();
      g.fillStyle=shadeCol(col,w.shade,sel);g.fill();g.lineWidth=0.8;g.strokeStyle=hexA("#1E292D",0.55);g.stroke();
      g.lineWidth=0.5;g.strokeStyle=hexA("#1E292D",0.25);
      for(let f=1;f<gr.floors;f++){const z=gr.z0+f*gr.ftf,a=T(w.a,z),b=T(w.b,z);g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke()}
    }
    for(const r of rings){poly(r,gr.z1);g.fillStyle=shadeCol(col,1.08,sel);g.fill();g.lineWidth=1;g.strokeStyle=hexA("#1E292D",0.6);g.stroke()}
  }
  // cores show as plant/lift-overrun boxes on the roof
  const roofZ=Math.max(0,...RES.groups.filter(x=>x.floors).map(x=>x.z1));
  const coreGeos=P.cores.map(C.geom).filter(Boolean).sort((a,b)=>V(window.G.centroid(b.outline))-V(window.G.centroid(a.outline)));
  for(const geo of coreGeos){const r=geo.outline,z0=roofZ,z1=roofZ+3;
    const ws=[];for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(b.x-a.x,b.y-a.y),nx=(b.y-a.y)/L,ny=-(b.x-a.x)/L;if(nx*sa+ny*ca<0)ws.push({a,b,d:(V(a)+V(b))/2})}
    ws.sort((p,q)=>q.d-p.d);
    for(const w of ws){const A0=T(w.a,z0),B0=T(w.b,z0),B1=T(w.b,z1),A1=T(w.a,z1);g.beginPath();g.moveTo(A0.x,A0.y);g.lineTo(B0.x,B0.y);g.lineTo(B1.x,B1.y);g.lineTo(A1.x,A1.y);g.closePath();g.fillStyle="#5F676B";g.fill();g.lineWidth=0.8;g.strokeStyle="#1E292D";g.stroke()}
    poly(r,z1);g.fillStyle="#7D868A";g.fill();g.strokeStyle="#1E292D";g.stroke()}
  g.font=`500 11px "IBM Plex Mono",monospace`;g.fillStyle=c.muted;g.textAlign="left";g.textBaseline="alphabetic";
  g.fillText(`${fmt(RES.height,1)} m · ${RES.storeys} storeys${P.ctl.height?` · limit ${fmt(P.ctl.height,1)} m`:""}`,14,H-14);
}
function shadeCol(hex,f,sel){const m=/^#?([0-9a-f]{6})$/i.exec(hex);const n=parseInt(m[1],16);const ch=v=>Math.max(0,Math.min(255,Math.round(v*f)));return `rgba(${ch(n>>16&255)},${ch(n>>8&255)},${ch(n&255)},${sel?1:0.94})`}

/* ---------- Cores ---------- */
let coresReady=false;
function renderCoreNeed(){
  if(!RES)return;const n=C.needs(P,RES);
  $("#coreNeed").textContent=`needs ${n.stairs} exit${n.stairs>1?"s":""}, ${n.lifts} lift${n.lifts===1?"":"s"} · ${fmt(n.eh,1)} m eff. height`;
  renderCoreLib();
}
function coreDesc(c){return `${c.lifts} lift${c.lifts===1?"":"s"} · ${c.stairs===2?(c.stair==="scissor"?"scissor stair":"2 stairs"):c.stairs?"1 stair":"no stair"} · ${(c.w/1000).toFixed(2)} × ${(c.d/1000).toFixed(2)} m`}
function renderCores(){
  const box=$("#placed");box.innerHTML="";
  if(!C.lib){box.innerHTML=`<p class="hint">Loading core library…</p>`;return}
  if(!P.cores.length)box.innerHTML=`<p class="hint">No core placed. Use "Suggest a core" or pick one from the library.</p>`;
  P.cores.forEach((inst,i)=>{
    const c=C.spec(inst);if(!c)return;const base=C.byId(inst.core);
    const d=document.createElement("div");d.className="slot"+(i===P.coreSel?" sel":"");
    d.innerHTML=`<b>C${i+1} · ${esc(inst.core)} ${esc(C.label(c))}</b><small>${coreDesc(c)}</small>
      <div class="tools"><button type="button" data-a="rot" title="Rotate 90°" aria-label="Rotate core ${i+1}">⟳</button><button type="button" data-a="fx" title="Flip left–right" aria-label="Flip core ${i+1} left to right">⇋</button><button type="button" data-a="fy" title="Flip front–back" aria-label="Flip core ${i+1} front to back">⇅</button><button type="button" data-a="del" title="Remove" aria-label="Remove core ${i+1}">×</button>
      ${base.variants?Object.keys(base.variants).map(v=>`<label><input type="checkbox" data-v="${esc(v)}"${inst.variant===v?" checked":""}>${esc(v.replace(/ on$/,""))}</label>`).join(""):""}</div>`;
    d.addEventListener("click",e=>{
      const a=e.target.closest("[data-a]");P.coreSel=i;
      if(a){const k=a.dataset.a;
        if(k==="del"){P.cores.splice(i,1);P.coreSel=Math.max(0,Math.min(P.coreSel,P.cores.length-1))}
        else if(k==="rot"){inst.rot=((inst.rot||0)+90)%360;snapInst(inst)}
        else inst[k]=!inst[k];
      }
      const v=e.target.closest("[data-v]");if(v){inst.variant=v.checked?v.dataset.v:null;snapInst(inst)}
      renderCores();recompute();
    });
    box.appendChild(d);
  });
}
function snapInst(inst){if(!P.grid.snap)return;const s=GR.snap(P,inst,C.geom(inst));inst.x=s.x;inst.y=s.y}
let libKey="";
function renderCoreLib(){
  if(!C.lib||!RES)return;
  const n=C.needs(P,RES),cat=P.coreView.cat,suit=P.coreView.suit;
  const key=JSON.stringify([n,cat,suit,P.cores.map(c=>c.core+c.variant),P.coreSel]);if(key===libKey)return;libKey=key;
  const box=$("#coreLib");box.innerHTML="";
  const sel=P.cores[P.coreSel];
  // with several cores each one only needs its share: 1 stair, and the lifts split between them
  const k=Math.max(1,P.cores.length),ok=c=>c.stairs>=(k>1?1:n.stairs)&&c.lifts>=Math.min(3,Math.ceil(n.lifts/k));
  const order=["linear","deep","kit","lift","stair"];
  for(const k of order){
    if(cat!=="all"&&cat!==k)continue;
    const list=C.lib.cores.filter(c=>c.cat===k&&(!suit||k==="lift"||k==="stair"||ok(c)||Object.values(c.variants||{}).some(v=>ok({...c,...v}))));
    if(!list.length)continue;
    const h=document.createElement("div");h.className="ccat";h.textContent=C.CATS[k];box.appendChild(h);
    for(const c of list){
      const b=document.createElement("button");b.type="button";b.setAttribute("role","listitem");
      b.className="ccard"+(sel&&sel.core===c.id?" on":"")+(k!=="lift"&&k!=="stair"&&!ok(c)?" no":"");
      b.title=c.family;
      b.innerHTML=`<canvas></canvas><span><b>${c.id}</b><small>${esc(C.label(c))}<br>${coreDesc(c)}</small></span>`;
      b.addEventListener("click",()=>useCore(c.id));
      box.appendChild(b);
      requestAnimationFrame(()=>thumb(b.querySelector("canvas"),c));
    }
  }
  if(!box.children.length)box.innerHTML=`<p class="hint">No library core meets ${n.stairs} exits and ${n.lifts} lifts on its own. Untick the filter and combine lift and stair blocks, or add a second core.</p>`;
}
function thumb(cv2,c){
  const r=cv2.getBoundingClientRect(),dpr=window.devicePixelRatio||1;if(!r.width)return;
  cv2.width=Math.round(r.width*dpr);cv2.height=Math.round(r.height*dpr);
  const g=cv2.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);
  const k=Math.min((r.width-12)/20.5,(r.height-10)/8.2); // same scale for every core so sizes compare
  const geo=C.geom({core:c.id,x:0,y:0,rot:0});
  const T=p=>({x:r.width/2+p.x*k,y:r.height/2-p.y*k});
  const col={bg:css("--surface"),ink:css("--ink"),muted:css("--muted"),accent:css("--accent"),lift:css("--rule"),stair:css("--surface"),riser:hexA("#8E959A",0.55),lobby:css("--sunk")};
  C.draw(g,T,geo,col,null,false);
}
function useCore(id){
  const cur=P.cores[P.coreSel];
  let inst=cur?{...cur,core:id,variant:null}:{id:nid(),core:id,variant:null,x:0,y:0,rot:GR.angle(P)*180/Math.PI,fx:false,fy:false};
  if(!cur||!C.fits(inst,RES)){const others=P.cores.filter((_,i)=>i!==P.coreSel);const p=C.place(P,RES,inst,others);if(p)inst=p;else if(!cur){const o=window.G.centroid(P.site.pts);inst.x=o.x;inst.y=o.y}}
  else snapInst(inst);
  if(cur)P.cores[P.coreSel]=inst;else{P.cores.push(inst);P.coreSel=P.cores.length-1}
  renderCores();recompute();
}

/* ---------- Grid ---------- */
function renderGrid(){
  const g=P.grid,pk=P.park;
  $("#gSx").value=g.sx;$("#gSy").value=g.sy;$("#gCol").value=g.col;$("#gSnap").checked=!!g.snap;
  $("#gAng").value=g.angle==null?"":g.angle;$("#gAng").placeholder=fmt(((GR.angle(P)*180/Math.PI)%180+180)%180,1)+" (street)";
  $("#pW").value=pk.W;$("#pL").value=pk.L;$("#pA").value=pk.A;
  $("#perLift").value=P.coreRules.aptsPerLift;$("#aptDepth").value=P.coreRules.aptDepth;
}
function gridSpan(){const gs=RES.groups.filter(g=>g.floors&&g.fp.length);if(!gs.length)return 30;const b=bbox(gs.flatMap(g=>g.fp.flat()));return Math.hypot(b.x1-b.x0,b.y1-b.y0)}
function goodAlong(c,span){const out=[];for(let s=6;s<=12.001;s+=0.1){const S=+s.toFixed(1);let ok=false;const M=2*c.L+c.A,n=Math.max(2,Math.floor(span/S)+1);for(let o=0;o<M&&!ok;o+=0.05){let h=0;for(let k=0;k<n;k++){const x=((o+k*S)%M+M)%M;if(x>c.L+0.05&&x<c.L+c.A-0.05){h++;break}}if(!h)ok=true}if(ok)out.push(S)}return out}
function gridFit(){
  const span=gridSpan(),f=GR.carpark(P,span),b=f.best,c=f.c;
  const dirName=b.dir==="x"?"along the street":"across the site";const other=b.dir==="x"?"across the site":"along the street";
  const goodAc=[2,3,4].map(n=>+(n*c.W+c.col).toFixed(2));
  const al=goodAlong(c,span),near=al.sort((x,y)=>Math.abs(x-b.al.S)-Math.abs(y-b.al.S)).slice(0,4).sort((x,y)=>x-y);
  return {b,c,lines:[
    [b.ac.ok?"ok":b.ac.meh?"warn":"bad",`Bays run ${dirName}: ${fmt(b.ac.S,2)} m bay = ${b.ac.n} bay${b.ac.n===1?"":"s"} of ${c.W} m + ${c.col} m column, ${b.ac.spare.toFixed(2)} m spare.${b.ac.ok?"":` Spacings that fit whole bays: ${goodAc.join(", ")} m.`}`],
    [b.al.ok?"ok":"warn",b.al.ok?`Spacing ${other} (${fmt(b.al.S,2)} m) keeps every column line out of the ${c.A} m aisles (bay + aisle + bay = ${fmt(b.al.M,1)} m).`:`Spacing ${other} (${fmt(b.al.S,2)} m): ${b.al.hits} of ${b.al.lines} column lines land in an aisle against the ${fmt(b.al.M,1)} m bay + aisle + bay module.${near.length?` Spacings that miss the aisles: ${near.join(", ")} m.`:""}`]]};
}
function gridChecks(){try{return gridFit().lines.map(([k,t])=>[k==="bad"?"warn":k,"Grid: "+t])}catch(e){return []}}
function renderGridFit(){
  let f;try{f=gridFit()}catch(e){return}
  $("#gridFit").innerHTML=f.lines.map(([k,t])=>`<p><span class="pill ${k}">${k==="ok"?"OK":"Check"}</span><span>${esc(t)}</span></p>`).join("");
}
function drawGrid(g,T,c){
  const gs=RES.groups.filter(x=>x.floors&&x.fp.length);if(!gs.length)return;
  const base=P.sel?(gs.find(x=>x.id===P.sel)||gs[0]):gs.reduce((m,x)=>x.fpArea>m.fpArea?x:m,gs[0]);
  const L=GR.lines(P,P.site.pts);
  g.save();path(g,T,P.site.pts);g.clip();
  g.lineWidth=0.7;g.strokeStyle=hexA("#5A676B",0.45);g.setLineDash([10,3,2,3]);
  const ext=4;
  for(const u of L.U){const a=T(L.F.toW(u,L.bb.v0-ext)),b=T(L.F.toW(u,L.bb.v1+ext));g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke()}
  for(const v of L.V){const a=T(L.F.toW(L.bb.u0-ext,v)),b=T(L.F.toW(L.bb.u1+ext,v));g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke()}
  g.restore();
  const geos=P.cores.map(C.geom).filter(Boolean);
  const cols=GR.columns(P,base.fp,geos),s=Math.max(3,(+P.grid.col||0.6)*planT.k);
  g.fillStyle=c.ink;for(const p of cols){const q=T(p);g.fillRect(q.x-s/2,q.y-s/2,s,s)}
}
let planT=null;

/* ---------- Map + saved lots ---------- */
function readSites(){try{return JSON.parse(localStorage.getItem(SITES_KEY)||"[]")}catch(e){return []}}
function saveSiteDoc(doc){const all=readSites().filter(d=>d.id!==doc.id);all.push(doc);try{localStorage.setItem(SITES_KEY,JSON.stringify(all.slice(-60)))}catch(e){}}
function renderSites(){
  const sites=readSites().filter(d=>d.ring).sort((a,b)=>String(b.fetched).localeCompare(String(a.fetched)));
  const box=$("#sites");box.innerHTML="";$("#sitesHint").hidden=sites.length>0;$("#savedN").textContent=sites.length?`(${sites.length})`:"";
  for(const d of sites.slice(0,12)){
    const b=document.createElement("button");b.type="button";b.className="site"+(P.site.id===d.id?" sel":"");
    b.innerHTML=`<b></b><small></small><em>${fmt(d.areaM2||0)} m²</em>`;
    b.querySelector("b").textContent=VM.titleCase(d.address||d.id);
    b.querySelector("small").textContent=`Lot ${d.spi||"–"}`;
    b.addEventListener("click",()=>{loadSite(d);VM.goToRing(d.ring,d.address);scrollToWork()});
    box.appendChild(b);
  }
  VM.showSaved(sites.map(d=>d.ring));
}
function scrollToWork(){document.querySelector(".grid").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})}
function onSelect(p,geo,addrP){
  const body=$("#lotBody");
  const streets=[...new Set(geo.roads.map(r=>VM.titleCase(r.road)))];
  body.innerHTML=`<div><div class="lotaddr-main"></div><div class="lotspi-sm"></div></div>
    <dl class="kv"><dt>Lot area</dt><dd>${fmt(geo.area)} m²</dd><dt>Street frontage</dt><dd>${geo.frontLen.toFixed(1)} m</dd><dt>Fronts</dt><dd style="font-family:var(--f-body)"></dd></dl>
    <button class="btn go" id="useLot" type="button">Run feasibility on this lot</button>`;
  const main=body.querySelector(".lotaddr-main");
  body.querySelector(".lotspi-sm").textContent=`Lot ${p.spi||"–"} · Vicmap Property`;
  body.querySelectorAll("dd")[2].textContent=streets.join(", ")||"Not detected";
  main.textContent=p.addr?VM.titleCase(p.addr):"Finding address…";
  addrP.then(r=>{if(VM.selected!==p)return;if(r&&r.main){p.addr=p.addr||r.main;main.textContent=VM.titleCase(p.addr)}else if(!p.addr)main.textContent="No street address recorded"}).catch(()=>{if(!p.addr)main.textContent="Address lookup failed"});
  $("#useLot").addEventListener("click",()=>{
    const id=(p.spi||"lot").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"")||"lot";
    const doc={id,address:p.addr||`Lot ${p.spi}`,spi:p.spi,source:"Vicmap Property (v_parcel_mp) + Vicmap Transport (tr_road), GDA2020",ring:geo.ring,front:geo.front,roads:geo.roads,areaM2:Math.round(geo.area*10)/10,fetched:new Date().toISOString()};
    saveSiteDoc(doc);loadSite(doc);scrollToWork();
  });
}
function parsePaste(txt){
  txt=txt.trim();if(!txt)return null;
  if(txt[0]==="{"||txt[0]==="["){
    try{let g=JSON.parse(txt);
      if(Array.isArray(g)&&typeof g[0]?.[0]==="number")return g;
      if(g.type==="FeatureCollection")g=g.features[0];if(g.type==="Feature")g=g.geometry;
      if(g.type==="Polygon")return g.coordinates[0];
      if(g.type==="MultiPolygon"){let best=null,ba=-1;for(const pg of g.coordinates){const a=Math.abs(area(pg[0].map(p=>({x:p[0],y:p[1]}))));if(a>ba){ba=a;best=pg[0]}}return best}
    }catch(e){return null}
    return null;
  }
  const pts=txt.split(/\n/).map(l=>l.split(/[,\s]+/).filter(Boolean).map(Number)).filter(a=>a.length>=2&&a.every(isFinite)).map(a=>[a[0],a[1]]);
  return pts.length>=3?pts:null;
}

/* ---------- Events ---------- */
function bind(){
  $("#zone").addEventListener("change",e=>{P.zone={...P.zone,key:e.target.value,auto:false};resetForZone(e.target.value);$("#maxMsg").textContent=""});
  $("#zoneSched").addEventListener("input",e=>{P.zone.sched=e.target.value;save()});
  const num=(id,k)=>$(id).addEventListener("input",e=>{P.ctl[k]=numOrNull(e.target.value);schedule()});
  num("#cHeight","height");num("#cStoreys","storeys");num("#cFar","far");num("#cCov","coverage");num("#cGarden","garden");
  $("#cRoof").addEventListener("input",e=>{P.ctl.roof=Math.max(0,parseFloat(e.target.value)||0);schedule()});
  $("#rescode").addEventListener("change",e=>{P.ctl.rescode=e.target.checked;schedule()});
  $("#exclCar").addEventListener("change",e=>{P.ctl.excludeCarpark=e.target.checked;schedule()});
  $("#preset").addEventListener("change",e=>{if(e.target.value==="custom")return;ctlFromPreset(P.ctl,e.target.value);renderControls();schedule()});
  $("#addBand").addEventListener("click",()=>{const bs=P.ctl.bands,last=bs[bs.length-1],prev=bs.length>1?bs[bs.length-2].upTo||0:0;
    bs.splice(bs.length-1,0,{...clone(last),upTo:prev+10});P.ctl.preset="custom";renderControls();schedule()});
  $("#aptSize").addEventListener("input",e=>{P.aptSize=Math.max(30,parseFloat(e.target.value)||68);schedule()});
  $("#effApt").addEventListener("input",e=>{P.effApt=Math.min(100,Math.max(40,parseFloat(e.target.value)||78));schedule()});
  $("#addPodium").addEventListener("click",()=>{let at=0;P.stack.forEach((g,i)=>{if(g.type!=="tower")at=i+1});
    P.stack.splice(at,0,{id:nid(),type:"podium",name:`Podium ${P.stack.filter(g=>g.type==="podium").length+1}`,floors:1,ftf:3.2,use:"apartments"});renderStack();schedule()});
  $("#addTower").addEventListener("click",()=>{const n=P.stack.filter(g=>g.type==="tower").length;
    P.stack.push({id:nid(),type:"tower",name:`Tower typical ${String.fromCharCode(65+n)}`,floors:1,ftf:3.1,use:"apartments"});renderStack();schedule()});
  $("#maxOut").addEventListener("click",()=>{fillToLimits(false);renderStack();recompute()});
  const setView=v=>{P.view=v;$("#vPlan").classList.toggle("on",v==="plan");$("#v3d").classList.toggle("on",v==="3d");$("#vPlan").setAttribute("aria-pressed",v==="plan");$("#v3d").setAttribute("aria-pressed",v==="3d");$("#rot").hidden=v!=="3d";$("#viewTitle").textContent=v==="3d"?"Massing":"Plan";draw();save()};
  $("#vPlan").addEventListener("click",()=>setView("plan"));$("#v3d").addEventListener("click",()=>setView("3d"));
  $("#rot").addEventListener("click",()=>{P.rot=((P.rot||0)+1)%4;draw();save()});
  setView(P.view||"plan");
  $("#csvBtn").addEventListener("click",saveCSV);
  $("#searchForm").addEventListener("submit",async e=>{
    e.preventDefault();const q=$("#address").value.trim(),ul=$("#results");ul.hidden=false;
    if(q.length<4){ul.innerHTML=`<li class="msg">Type a street address, e.g. 1267 Nepean Highway Cheltenham.</li>`;return}
    ul.innerHTML=`<li class="msg">Searching Vicmap…</li>`;
    try{const rs=await VM.search(q);
      if(!rs.length){ul.innerHTML=`<li class="msg">No Vicmap address matches. Try number, street and suburb.</li>`;return}
      ul.innerHTML="";for(const r of rs){const li=document.createElement("li"),b=document.createElement("button");b.type="button";b.textContent=r.label;
        b.addEventListener("click",()=>{ul.hidden=true;$("#address").value=r.label;VM.pickAddress(r)});li.appendChild(b);ul.appendChild(li)}
    }catch(err){ul.innerHTML=`<li class="msg">Vicmap didn't answer. Try again in a moment.</li>`}
  });
  document.addEventListener("click",e=>{if(!e.target.closest(".search"))$("#results").hidden=true});
  $("#pasteBtn").addEventListener("click",()=>{
    let r=parsePaste($("#pasteBox").value);const msg=$("#pasteMsg");
    if(!r){msg.textContent="Couldn't read that. Paste a GeoJSON polygon, or at least three lon, lat lines.";return}
    if(Math.abs(r[0][0])<90&&Math.abs(r[0][1])>90)r=r.map(p=>[p[1],p[0]]);
    if(Math.abs(r[0][0])>180){msg.textContent="Coordinates look projected (metres). Paste longitude/latitude degrees.";return}
    loadSite({id:"pasted-"+Date.now().toString(36),ring:r,front:0,address:"Pasted boundary",spi:"",roads:[]});
    msg.textContent=`Loaded ${P.site.pts.length} corners. Set the edge types under Site.`;scrollToWork();
  });
  $("#coreSuggest").addEventListener("click",()=>{const s=C.suggest(P,RES);if(!s.length){$("#coreNeed").textContent="no library core fits this floorplate";return}P.cores=s;P.coreSel=0;renderCores();recompute()});
  $("#coreAdd").addEventListener("click",()=>{const base=P.cores[P.coreSel]||C.suggest(P,RES,1)[0];if(!base)return;
    const p=C.place(P,RES,{...base,id:nid()},P.cores);if(!p){$("#coreNeed").textContent="no room for another core of that type";return}P.cores.push(p);P.coreSel=P.cores.length-1;renderCores();recompute()});
  $("#coreCat").innerHTML=`<option value="all">All cores</option>`+Object.entries(C.CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");
  $("#coreCat").value=P.coreView.cat;$("#coreSuit").checked=P.coreView.suit;
  $("#coreCat").addEventListener("change",e=>{P.coreView.cat=e.target.value;renderCoreLib();save()});
  $("#coreSuit").addEventListener("change",e=>{P.coreView.suit=e.target.checked;renderCoreLib();save()});
  $("#perLift").addEventListener("input",e=>{P.coreRules.aptsPerLift=Math.max(10,parseFloat(e.target.value)||60);schedule()});
  $("#aptDepth").addEventListener("input",e=>{P.coreRules.aptDepth=Math.max(4,parseFloat(e.target.value)||9);schedule()});
  const gnum=(id,obj,k,min)=>$(id).addEventListener("input",e=>{const v=parseFloat(e.target.value);if(isFinite(v)&&v>=min){obj()[k]=v;schedule()}});
  gnum("#gSx",()=>P.grid,"sx",3);gnum("#gSy",()=>P.grid,"sy",3);gnum("#gCol",()=>P.grid,"col",0.2);
  gnum("#pW",()=>P.park,"W",2);gnum("#pL",()=>P.park,"L",4);gnum("#pA",()=>P.park,"A",3);
  $("#gAng").addEventListener("input",e=>{const v=parseFloat(e.target.value);P.grid.angle=isFinite(v)?v:null;schedule()});
  $("#gSnap").addEventListener("change",e=>{P.grid.snap=e.target.checked;if(P.grid.snap)P.cores.forEach(snapInst);schedule()});
  $("#gAlign").addEventListener("click",()=>{const inst=P.cores[P.coreSel];if(!inst)return;const geo=C.geom(inst),F=GR.frame(P);
    const us=geo.outline.map(p=>F.toG(p));const o=F.toW(Math.min(...us.map(q=>q.u)),Math.min(...us.map(q=>q.v)));P.grid.ox=o.x;P.grid.oy=o.y;
    const t=GR.angle(P)*180/Math.PI;P.cores.forEach(c=>{if(Math.abs(((c.rot-t)%90+90)%90)>0.5&&Math.abs(((c.rot-t)%90+90)%90-90)>0.5)c.rot=t});
    renderGrid();recompute()});
  // drag cores on the plan
  let drag=null;
  const at=e=>{const r=cv.getBoundingClientRect();return planT.inv(e.clientX-r.left,e.clientY-r.top)};
  const hit=w=>{for(let i=P.cores.length-1;i>=0;i--){const geo=C.geom(P.cores[i]);if(geo&&window.G.pip(w,geo.outline))return i}return -1};
  cv.addEventListener("pointerdown",e=>{if(P.view!=="plan"||!planT)return;const w=at(e),i=hit(w);if(i<0)return;
    const inst=P.cores[i];drag={i,dx:inst.x-w.x,dy:inst.y-w.y};P.coreSel=i;cv.setPointerCapture(e.pointerId);cv.classList.add("drag");renderCores();e.preventDefault()});
  cv.addEventListener("pointermove",e=>{if(P.view!=="plan"||!planT)return;const w=at(e);
    if(!drag){cv.classList.toggle("over",hit(w)>=0);return}
    const inst=P.cores[drag.i];inst.x=w.x+drag.dx;inst.y=w.y+drag.dy;snapInst(inst);drawPlan()});
  const end=()=>{if(!drag)return;drag=null;cv.classList.remove("drag");recompute()};
  cv.addEventListener("pointerup",end);cv.addEventListener("pointercancel",end);
  let rz=null;new ResizeObserver(()=>{clearTimeout(rz);rz=setTimeout(draw,60)}).observe(cv);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change",draw);
}

/* ---------- Boot ---------- */
bind();if(!saved)fillToLimits(true);renderAll();
C.load("../data/cores.json").then(()=>{coresReady=true;renderCores();libKey="";recompute()}).catch(()=>{$("#placed").innerHTML=`<p class="hint">The core library didn't load. Reload the page.</p>`});
const mapOK=VM.init({container:"map",stat:$("#mapStat"),accent:css("--accent"),onSelect,onFail:m=>{const el=$("#mapMsg");el.hidden=false;el.innerHTML=`<b>Map unavailable</b><span>${esc(m)}</span>`}});
if(mapOK&&P.site.ring)VM.goToRing(P.site.ring,P.site.address);
renderSites();

/* test hook */
window.__fz={get P(){return P},get R(){return RES},get max(){return MAX},loadSite,setPlanning:r=>{setPlanning(r);renderPlanning()},recompute,fill:()=>{fillToLimits(false);renderStack();recompute()},set:(fn)=>{fn(P);renderAll()},cores:C,grid:GR,ready:()=>coresReady};
})();
