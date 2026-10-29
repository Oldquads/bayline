/* Bayline Feasibility: site -> planning controls -> envelope -> level stack -> core -> grid -> apartments. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const {area,bbox,inward,shapeArea,projectRing}=window.G;
const R=window.RULES,E=window.ENV,C=window.CORES,GR=window.GRID,AP=window.APTS,PK=window.PARK;
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
  o.grid={sx:8.4,sy:8.4,angle:null,ox:0,oy:0,col:0.6,snap:true,centre:"auto",...(o.grid||{})};
  o.park={...PK.defaults(),...(o.park||{})};if(!o.park.rates||!o.park.rates.A)o.park.rates=PK.defaults().rates;
  o.coreRules={aptsPerLift:60,aptDepth:8,travel:6,exitsApart:45,fire:"fe",feTravel:25,...(o.coreRules||{})};
  o.mass={...window.MASS.defaults(),...(o.mass||{})};
  o.coreView={cat:"all",suit:true,...(o.coreView||{})};
  o.apt={...AP.defaults(),...(o.apt||{})};if(!o.apt._g2){o.apt.snap="prefer";o.apt.wall=0.2;o.apt._g2=1}if(!o.apt._m){o.apt.maxDepth=10;o.apt._m=1}for(const t of o.apt.types){if(t.beds==null)t.beds=PK.bedsOf(t);if(t.bays==null)t.bays=AP.baysOf(t)}if(o.coreRules.aptDepth&&!(o.apt&&o.apt._d)){o.apt.depth=o.coreRules.aptDepth;o.apt._d=1}
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
  P.site=siteFromDoc(doc);P.sel=null;P.apt.edits={};P.apt.typical=null;P.cores=[];P.coreSel=0;P.coreAuto=true;Object.assign(P.grid,gridOrigin(P.site),{angle:null});
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
  P.ctl=ctl;P.stack=defaultStack(key);P.apt.edits={};P.apt.typical=null;$("#maxMsg").textContent="";P.cores=[];P.coreSel=0;P.coreAuto=true;
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
  centreGrid();
  // suggested cores follow the building (re-suggested when the stack, massing or rules change); hand-placed cores stay put
  if(C.lib){const n=C.needs(P,RES),ck=JSON.stringify([n.stairs,n.lifts,RES.groups.map(g=>[g.floors,Math.round(g.fpArea)]),P.mass,P.coreRules,P.apt.depth,P.apt.maxDepth,P.apt.corridor,P.grid.sx,P.grid.sy,P.grid.angle,P.grid.snap]);
    if((P.coreAuto&&!P.cores.length)||(P.coresBy==="auto"&&ck!==P.coreKey)){const s=C.suggest(P,RES);P.coreAuto=false;P.coreKey=ck;if(s.length){P.cores=s;P.coresBy="auto";P.coreSel=0;renderCores()}}}
  RES.coreArea=P.cores.map(C.geom).filter(Boolean).reduce((m,g)=>m+g.area,0);
  layouts();
  if(C.lib)RES.checks.push(...C.checks(P,RES,P.cores));
  RES.checks.push(...aptChecks());
  parkSoon();
  RES.checks.push(...gridChecks());
  $("#massMsg").textContent=RES.mass?window.MASS.describe(P,RES.mass):"";
  renderSummary();renderStackOut();renderSched();renderCoreNeed();renderGridFit();renderAptOut();draw();save();
}
let rT=null;function schedule(){clearTimeout(rT);rT=setTimeout(recompute,60)}

function renderAll(){renderSite();renderPlanning();renderControls();renderStack();renderCores();renderGrid();renderBrief();renderPark();recompute()}

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
  $("#massMode").innerHTML=Object.entries(window.MASS.MODES).map(([k,v])=>`<option value="${k}"${P.mass.mode===k?" selected":""}>${esc(v)}</option>`).join("");$("#massGap").value=P.mass.gap;
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
      <dt>Apartments</dt><dd>${r.laid?"":"≈ "}${fmt(r.apts)}</dd>
      ${r.typ?`<dt>Typical floor</dt><dd>${r.typ.units.length} apts · ${fmt(r.typ.eff*100)}% eff.</dd>`:""}
      ${r.spaces?`<dt>Car spaces (podium)</dt><dd>≈ ${fmt(r.spaces)}</dd>`:""}
      <dt>Car spaces</dt><dd>${parkSummary()}</dd>
      <dt>Core per floor</dt><dd>${P.cores.length?`${fmt(r.coreArea)} m²`:"–"}</dd>
      <dt>Site coverage</dt><dd>${lim(fmt(r.coverage),c.coverage,"%")}${c.coverage?"":"%"}</dd>
      <dt>Open area</dt><dd>${fmt(r.garden)}%</dd>
    </dl>
    <ul class="checks">${r.checks.map(([k,t])=>`<li><span class="pill ${k}">${k==="ok"?"OK":k==="bad"?"Fail":k==="warn"?"Check":"Note"}</span><span>${esc(t)}</span></li>`).join("")}</ul>`;
}

/* area schedule */
function schedRows(){
  const rows=RES.groups.slice().reverse().filter(g=>g.floors).map(g=>({name:g.name,levels:lvl(g.storeyFrom)+(g.floors>1?"–"+lvl(g.storeyTo):""),floors:g.floors,ftf:g.ftf,top:g.z1,plate:g.fpArea,core:RES.coreArea||0,gfa:g.gfa,use:R.USES[g.use].label,nsa:g.nsa,count:g.layout?`${g.apts} apts (${g.layout.units.length}/floor)`:g.apts?`≈ ${g.apts} apts`:g.spaces?`≈ ${g.spaces} cars`:"",mix:g.layout?AP.mixText(AP.counts(g.layout.units),P.apt.types):""}));
  if(RES.park&&RES.park.nBase){const pk=RES.park;rows.push({name:"Basements",levels:`B1${pk.nBase>1?"–B"+pk.nBase:""}`,floors:pk.nBase,ftf:+P.park.bFtf,top:0,plate:pk.levels.find(l=>l.kind==="basement")?shapeArea(pk.levels.find(l=>l.kind==="basement").outline):0,core:RES.coreArea||0,gfa:0,use:"Car park (below ground)",nsa:0,count:`${pk.basements.reduce((m,l)=>m+l.bays,0)} cars`,mix:""})}
  for(const r of rows){const g=RES.groups.find(x=>x.name===r.name&&x.use==="carpark");if(g&&RES.park){const n=RES.park.podium.filter(l=>l.name.startsWith(g.name)).reduce((m,l)=>m+l.bays,0);r.count=`${n} cars`}}
  return rows;
}
function renderSched(){
  if(!RES)return;
  const rows=schedRows();
  $("#schedNote").textContent=`${RES.storeys} storeys · ${fmt(RES.height,1)} m`;
  $("#sched").innerHTML=`<thead><tr><th>Group</th><th>Levels</th><th>Floors</th><th>F–F m</th><th>Top m</th><th>Plate m²</th><th>Core m²</th><th>GFA m²</th><th>Use</th><th>NSA m²</th><th>Count</th><th>Mix per floor</th></tr></thead><tbody>`+
    rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.levels}</td><td>${r.floors}</td><td>${fmt(r.ftf,2)}</td><td>${fmt(r.top,1)}</td><td>${fmt(r.plate)}</td><td>${fmt(r.core)}</td><td>${fmt(r.gfa)}</td><td style="font-family:var(--f-body)">${r.use}</td><td>${fmt(r.nsa)}</td><td>${r.count}</td><td style="font-family:var(--f-body);text-align:left">${esc(r.mix)}</td></tr>`).join("")+
    `<tr class="tot"><td>Total</td><td></td><td>${RES.storeys}</td><td></td><td>${fmt(RES.height,1)}</td><td></td><td></td><td>${fmt(RES.gfa)}</td><td></td><td>${fmt(RES.nsa)}</td><td>${RES.apts?`${RES.laid?"":"≈ "}${RES.apts} apts`:""}</td><td style="font-family:var(--f-body);text-align:left">${esc(totalMix())}</td></tr></tbody>`;
}
function saveCSV(){
  const rows=schedRows();const q=v=>`"${String(v).replace(/"/g,'""')}"`;
  const lines=[["Site",P.site.address],["Zone",P.zone.code||P.zone.key],["Site area m2",Math.round(RES.siteArea)],["Cores",P.cores.map(c=>c.core+(c.variant?" ("+c.variant+")":"")).join(" + ")||"none"],["Grid m",`${P.grid.sx} x ${P.grid.sy}`],[],["Group","Levels","Floors","Floor to floor m","Top m","Floorplate m2","Core m2 per floor","GFA m2","Use","NSA m2","Count","Mix per floor"],
    ...rows.map(r=>[r.name,r.levels,r.floors,r.ftf,r.top.toFixed(1),Math.round(r.plate),Math.round(r.core),Math.round(r.gfa),r.use,Math.round(r.nsa),r.count,r.mix]),
    ["Total","",RES.storeys,"",RES.height.toFixed(1),"","",Math.round(RES.gfa),"",Math.round(RES.nsa),RES.apts,totalMix()]];
  const blob=new Blob([lines.map(l=>l.map(q).join(",")).join("\n")],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`feasibility-${(P.site.address||"site").replace(/[^A-Za-z0-9]+/g,"-").toLowerCase()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

/* ---------- Drawing ---------- */
const cv=$("#view");
function canvasSize(){const r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;const W=Math.max(10,r.width),H=Math.max(10,r.height);if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}return {W,H,dpr}}
function hexA(col,a){const m=/^#?([0-9a-f]{6})$/i.exec(col);if(!m)return col;const n=parseInt(m[1],16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`}
function draw(){if(!RES)return;P.view==="3d"?draw3d():P.view==="park"?drawPark():drawPlan();renderLegend()}
function renderLegend(){
  if(P.view==="park"){$("#legend").innerHTML=`<span><i style="background:var(--surface)"></i>Car bay</span><span><i style="background:var(--aisle);border-color:var(--aisle)"></i>Aisle / accessway</span><span><i style="background:#1E292D"></i>Column</span><span><i style="background:#8E959A"></i>Core</span><span><i style="background:repeating-linear-gradient(135deg,var(--accent) 0 3px,transparent 3px 6px)"></i>Ramp</span>`;return}
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
  const pts=P.site.pts,bb=bbox(pts),pad=Math.max(56,Math.min(W,H)*0.1);
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
  drawUnits(g,T,c);
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
  drawHandles(g,T,c);
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
  const bb=bbox(all),pad=Math.max(48,Math.min(W,H)*0.1),k=Math.min((W-2*pad)/Math.max(1,bb.x1-bb.x0),(H-2*pad)/Math.max(1,bb.y1-bb.y0));
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
      if(a||e.target.closest("[data-v]"))P.coresBy="hand";
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
/* grid centred on the typical tower floor unless set by hand */
function centreGrid(){
  if(P.grid.centre==="manual")return;
  const gs=RES.groups.filter(g=>g.floors&&g.fp.length);if(!gs.length)return;
  const t=typicalGroup()||gs.filter(g=>g.type==="tower").pop()||gs[gs.length-1];
  const o=GR.centreOn(P,t.fp);if(o){P.grid.ox=o.ox;P.grid.oy=o.oy}
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
  P.coresBy="hand";
  renderCores();recompute();
}

/* ---------- Grid ---------- */
function renderGrid(){
  const g=P.grid,pk=P.park;
  $("#gSx").value=g.sx;$("#gSy").value=g.sy;$("#gCol").value=g.col;$("#gSnap").checked=!!g.snap;$("#gCentre").value=g.centre||"auto";
  $("#gAng").value=g.angle==null?"":g.angle;$("#gAng").placeholder=fmt(((GR.angle(P)*180/Math.PI)%180+180)%180,1)+" ("+GR.autoAngle(P).by+")";
  $("#pW").value=pk.W;$("#pL").value=pk.L;$("#pA").value=pk.A;
  $("#perLift").value=P.coreRules.aptsPerLift;$("#travelLim").value=P.coreRules.travel;$("#feLim").value=P.coreRules.feTravel;$("#fireMode").value=P.coreRules.fire;
  $("#feLimF").hidden=P.coreRules.fire!=="fe";$("#travelLimF").hidden=P.coreRules.fire==="fe";
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
  // no columns drawn on the floor plan: party walls on the grid carry the floors (columns only in the parking view)
}
let planT=null;

/* ---------- Apartments ---------- */
const TYPE_COLS=["#E9D8A6","#CFE3C1","#BCD6EA","#E5C6D3","#D9CBE8","#F2D3B0","#C9E4E0"];
const typeCol=name=>{const i=P.apt.types.findIndex(t=>t.name===name);return i<0?"#E9A99E":TYPE_COLS[i%TYPE_COLS.length]};
let layoutCache=new Map(),wallDrag=null,handles=[];
function typicalGroup(){
  const gs=RES?RES.groups.filter(g=>g.floors&&g.use==="apartments"&&g.fp.length):[];if(!gs.length)return null;
  return gs.find(g=>g.id===P.apt.typical)||gs.reduce((m,g)=>g.floors>m.floors||(g.floors===m.floors&&g.z0>m.z0)?g:m,gs[0]);
}
const typLayout=()=>{const g=typicalGroup();return g&&g.layout};
/* lay out every apartment floor (cached by plate, cores, brief, grid and hand edits) */
function layouts(){
  const geos=P.cores.map(C.geom).filter(Boolean);
  const keyBase=JSON.stringify([P.cores,P.apt.depth,P.apt.maxDepth,P.apt.corridor,P.apt.wall,P.apt.snap,P.apt.types,P.grid]);
  const next=new Map();let apts=0,nsa=0,laid=false;
  for(const g of RES.groups){
    if(!(g.floors&&g.use==="apartments"&&g.fp.length)){continue}
    const ed=P.apt.edits[g.id];
    const key=keyBase+JSON.stringify(g.fp.map(r=>r.map(p=>[+p.x.toFixed(2),+p.y.toFixed(2)])))+JSON.stringify(ed||null);
    let L=layoutCache.get(key);
    if(!L){L=AP.layoutPlate(P,g.fp,geos,ed&&ed.cuts);
      // hand edits made on a different floorplate no longer line up: drop them
      if(ed&&(ed.perims||[]).some((pp,i)=>!L.loops[i]||Math.abs(L.loops[i].perim-pp)>0.5)){delete P.apt.edits[g.id];L=AP.layoutPlate(P,g.fp,geos,null)}}
    next.set(key,L);g.layout=L;laid=true;
    g.apts=L.units.length*g.floors;g.nsa=L.nsa*g.floors;
  }
  layoutCache=next;
  if(laid){RES.apts=RES.groups.reduce((m,g)=>m+g.apts,0);RES.nsa=RES.groups.reduce((m,g)=>m+g.nsa,0);RES.laid=true;const t=typicalGroup();RES.typ=t&&t.layout}
}
function totalMix(){const c={};for(const g of RES.groups)if(g.layout)for(const [k,v] of Object.entries(AP.counts(g.layout.units)))c[k]=(c[k]||0)+v*g.floors;return AP.mixText(c,P.apt.types)}
function editCuts(fn){
  const g=typicalGroup();if(!g||!g.layout)return;
  const L=g.layout,cuts=L.cuts.map(c=>({...c}));fn(cuts);
  P.apt.edits[g.id]={cuts,perims:L.loops.map(l=>l.perim)};recompute();
}
function aptChecks(){
  const out=[],g=typicalGroup();if(!g||!g.layout)return out;
  const L=g.layout,types=P.apt.types,c=AP.counts(L.units),n=L.units.length||1,tot=types.reduce((m,t)=>m+(+t.mix||0),0)||1;
  out.push(["info",`${g.name}: ${L.units.length} apartments a floor (${AP.mixText(c,types)||"none"}), ${fmt(L.nsa)} m² net, ${fmt(L.eff*100)}% of the ${fmt(L.plate)} m² plate.`]);
  const off=types.filter(t=>t.mix>0||c[t.name]).map(t=>({t,got:(c[t.name]||0)/n*100,want:(+t.mix||0)/tot*100})).filter(x=>Math.abs(x.got-x.want)>10);
  if(off.length)out.push(["warn",`Mix is off the brief: ${off.map(x=>`${x.t.name} ${fmt(x.got)}% vs ${fmt(x.want)}%`).join(", ")}. Floor shape and frontage limit it; adjust the brief, the depth or the walls.`]);
  else if(L.units.length)out.push(["ok","Unit mix is within 10 points of the brief for every type."]);
  const offb=L.units.filter(u=>!u.ok&&u.type!=="Oversize");
  if(offb.length)out.push(["warn",`${offb.length} apartment${offb.length>1?"s fall":" falls"} between the brief's size ranges (${offb.map(u=>`${u.type} ${fmt(u.area)} m²`).slice(0,4).join(", ")}). Move a wall or widen the ranges.`]);
  if(c.Oversize)out.push(["warn",`${c.Oversize} apartment${c.Oversize>1?"s are":" is"} bigger than any type in the brief (corner or leftover strip). Split ${c.Oversize>1?"them":"it"} or add a bigger type.`]);
  if(L.left.length)out.push(["info",`${L.left.length} piece${L.left.length>1?"s":""} of facade strip (${fmt(L.left.reduce((m,u)=>m+u.area,0))} m²) too small for an apartment: storage, services or balcony.`]);
  if(L.deep)out.push(["info",`${g.name}: apartments deepened to ${fmt(L.d,1)} m so the corridor stays ${fmt(P.apt.corridor,1)} m.`]);
  if(L.narrow)out.push(["warn",`The ${g.name} plate is narrower than two apartments and a corridor: apartments cut to ${fmt(L.d,1)} m deep.`]);
  if(L.d>9.05)out.push(["warn",`Apartments ${fmt(L.d,1)} m deep: Clause 58 Standard D27 limits single-aspect habitable rooms to 9 m from a window (open-plan, 2.7 m ceiling).`]);
  P.cores.forEach((inst,i)=>{const geo=C.geom(inst);if(geo&&L.corridor.length&&window.G.shapeArea(window.G.inter([window.G.offsetShape([geo.outline],0.3)[0]||geo.outline],L.corridor))<0.3)out.push(["warn",`Core C${i+1} doesn't reach the ${fmt(P.apt.corridor,1)} m corridor on ${g.name}. Move it next to the corridor.`])});
  const commonPct=L.common/L.plate*100;
  if(commonPct>28)out.push(["warn",`Corridors, cores and the middle of the plate take ${fmt(commonPct)}% of the ${g.name} floor. A deep plate wastes its middle: consider a courtyard, a slimmer tower or deeper apartments.`]);
  return out;
}
function renderAptOut(){
  const box=$("#aptOut");if(!box)return;const g=typicalGroup();
  if(!g||!g.layout){box.innerHTML=`<p class="hint">No apartment floors. Set a level group's use to Apartments.</p>`;$("#aptState").textContent="";return}
  const L=g.layout,c=AP.counts(L.units),n=L.units.length||1,types=P.apt.types,tot=types.reduce((m,t)=>m+(+t.mix||0),0)||1;
  $("#aptState").textContent=`${L.units.length} / floor · ${fmt(L.eff*100)}% eff.`;
  box.innerHTML=`<div class="aptsum">${esc(g.name)} · ${fmt(L.nsa)} m² net of ${fmt(L.plate)} m²${P.apt.edits[g.id]?" · walls edited by hand":""}</div>`+
    types.filter(t=>t.mix>0||c[t.name]).map(t=>{const got=(c[t.name]||0)/n*100,want=(+t.mix||0)/tot*100;
      return `<div class="mixrow"><b>${esc(t.name)}</b><div class="mixbar" title="target ${fmt(want)}%"><i style="width:${Math.min(100,got)}%;background:${typeCol(t.name)}"></i><u style="left:calc(${Math.min(100,want)}% - 1px)"></u></div><span>${c[t.name]||0} · ${fmt(got)}% / ${fmt(want)}%</span></div>`}).join("")+
    (c.Oversize?`<div class="mixrow"><b>Over</b><div class="mixbar"><i style="width:${c.Oversize/n*100}%;background:${typeCol("Oversize")}"></i></div><span>${c.Oversize}</span></div>`:"");
  const sel=$("#aTyp"),gs=RES.groups.filter(x=>x.floors&&x.use==="apartments"&&x.fp.length);
  sel.innerHTML=gs.map(x=>`<option value="${x.id}"${x.id===g.id?" selected":""}>${esc(x.name)} (${x.floors} floor${x.floors>1?"s":""})</option>`).join("");
}
function renderBrief(){
  const tb=$("#briefTable tbody");if(!tb)return;tb.innerHTML="";
  P.apt.types.forEach((t,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><input type="text" data-k="name" value="${esc(t.name)}" aria-label="Type ${i+1} name" style="border-left:6px solid ${typeCol(t.name)}"></td>`+
      ["beds","bays","mix"].map(k=>`<td><input type="number" data-k="${k}" step="${k==="bays"?0.5:1}" min="0" value="${k==="bays"?AP.baysOf(t):t[k]}" aria-label="${esc(t.name)} ${k}"></td>`).join("")+
      `<td>${P.apt.types.length>1?`<button class="x" type="button" aria-label="Remove ${esc(t.name)}">×</button>`:""}</td>`;
    tr.querySelectorAll("input").forEach(inp=>inp.addEventListener("input",()=>{const k=inp.dataset.k;t[k]=k==="name"?inp.value:Math.max(0,parseFloat(inp.value)||0);schedule()}));
    const x=tr.querySelector(".x");if(x)x.addEventListener("click",()=>{P.apt.types.splice(i,1);renderBrief();schedule()});
    tb.appendChild(tr);
  });
  $("#aDepth").value=P.apt.depth;$("#aCorr").value=P.apt.corridor;
}
function bindApts(){
  $("#addType").addEventListener("click",()=>{const last=P.apt.types[P.apt.types.length-1]||{beds:2,bays:1.5};
    P.apt.types.push({name:`Type ${P.apt.types.length+1}`,beds:Math.min(4,(+last.beds||2)+1),bays:AP.baysOf(last)+0.5,mix:0});renderBrief();schedule()});
  $("#aReset").addEventListener("click",()=>{const g=typicalGroup();if(g)delete P.apt.edits[g.id];recompute()});
  const an=(id,k,min)=>$(id).addEventListener("input",e=>{const v=parseFloat(e.target.value);if(isFinite(v)&&v>=min){P.apt[k]=v;P.apt.edits={};schedule()}});
  an("#aDepth","depth",4);an("#aCorr","corridor",1);
  $("#aTyp").addEventListener("change",e=>{P.apt.typical=e.target.value;recompute()});
}
function drawUnits(g,T,c){
  const gr=typicalGroup();if(!gr||!gr.layout)return;const L=gr.layout;
  // common area (corridors and the middle of the plate) under the apartments
  for(const r of L.inner){path(g,T,r);g.fillStyle=hexA("#8E959A",0.12);g.fill()}
  g.beginPath();for(const r of L.corridor)r.forEach((p,i)=>{const q=T(p);i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)}),g.closePath();g.fillStyle=hexA("#E2B007",0.18);g.fill("evenodd");
  g.font=`600 11px "Barlow",sans-serif`;g.textAlign="center";g.textBaseline="middle";
  const rpath=rs=>{g.beginPath();for(const r of rs)r.forEach((p,i)=>{const q=T(p);i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)}),g.closePath()};
  for(const u of L.units){rpath(u.rings);g.fillStyle=typeCol(u.type);g.fill("evenodd");g.lineWidth=1;g.strokeStyle=c.ink;g.stroke()}
  for(const u of L.left){rpath(u.rings);g.fillStyle=hexA("#8E959A",0.35);g.fill("evenodd")}
  for(const u of L.units){const q=T(window.G.centroid(u.poly));if(planT.k*Math.sqrt(u.area)<34)continue;g.fillStyle="#1E292D";g.fillText(u.type+(u.ok||u.type==="Oversize"?"":"*"),q.x,q.y-6);g.font=`500 10px "IBM Plex Mono",monospace`;g.fillText(fmt(u.area),q.x,q.y+7);g.font=`600 11px "Barlow",sans-serif`}
  for(const u of L.units){const q=T(u.door);g.beginPath();g.arc(q.x,q.y,2.2,0,Math.PI*2);g.fillStyle=c.ink;g.fill()}
}
function drawHandles(g,T,c){
  handles=[];const gr=typicalGroup();if(!gr||!gr.layout)return;const L=gr.layout;
  L.cuts.forEach((ct,idx)=>{const lp=L.loops[ct.ring];if(!lp)return;const s=wallDrag&&wallDrag.idx===idx?wallDrag.s:ct.s;const {p,n}=AP.pointAt(lp,s),q=T(p),q2=T({x:p.x+n.x*L.d,y:p.y+n.y*L.d});
    if(wallDrag&&wallDrag.idx===idx){g.beginPath();g.moveTo(q.x,q.y);g.lineTo(q2.x,q2.y);g.lineWidth=2.5;g.strokeStyle=c.accent;g.stroke()}
    g.beginPath();g.arc(q.x,q.y,4.5,0,Math.PI*2);g.fillStyle=c.bg;g.fill();g.lineWidth=1.5;g.strokeStyle=c.ink;g.stroke();
    handles.push({idx,ring:ct.ring,s:ct.s,x:q.x,y:q.y})});
}
function handleAt(x,y){let best=null;for(const h of handles){const d=Math.hypot(h.x-x,h.y-y);if(d<=8&&(!best||d<best.d))best={...h,d}}return best}

/* ---------- Parking ---------- */
let parkT=null,parkGen=0,parkDone=false,parkLevel=0;
function parkSoon(){parkDone=false;const my=++parkGen;$("#parkState").textContent="laying out…";clearTimeout(parkT);
  // first the levels, then (a moment later) what columns, cores and ramp cost
  const show=()=>{RES.checks=RES.checks.filter(c=>!c.park);RES.checks.push(...parkChecks());renderSummary();renderSched();renderParkOut();draw()};
  parkT=setTimeout(()=>{if(my!==parkGen||!RES)return;
    const geos=P.cores.map(C.geom).filter(Boolean);
    try{RES.park=PK.plan(P,RES,geos)}catch(e){console.error(e);RES.park=null}
    if(my!==parkGen)return;
    if(RES.park&&parkLevel>=RES.park.levels.length)parkLevel=0;
    show();
    const wantB=RES.park&&(RES.park.nBase||(P.park.basements!==0&&RES.park.req.total>RES.park.provided));
    if(!wantB){parkDone=true;return}
    setTimeout(()=>{if(my!==parkGen||!RES||!RES.park)return;
      try{RES.park.cost=PK.costs(P,RES,geos,RES.park.perBasement)}catch(e){console.error(e)}
      if(my!==parkGen)return;parkDone=true;show()},30);
  },250)}
function parkSummary(){const pk=RES.park;if(!pk)return parkDone?"–":"…";return `${pk.provided} / ${pk.req.total}`}
function parkChecks(){
  const pk=RES.park,out=[];if(!pk)return out;const r=pk.req,col=P.park.col,mark=c=>(c.park=true,c);
  out.push(mark(pk.provided>=r.total?["ok",`${pk.provided} car spaces for ${r.total} required (Clause 52.06-5 Column ${col}).`]:["bad",`${pk.provided} car spaces for ${r.total} required: ${r.total-pk.provided} short (Clause 52.06-5 Column ${col}).`]));
  out.push(mark(["info",`Required: ${r.res} resident (${r.one} one/two-bed, ${r.three} three-bed)${r.vis?`, ${r.vis} visitor`:""}${r.ret?`, ${r.ret} retail on ${fmt(r.retailNLA)} m²`:""}. Rounded down.`]));
  if(pk.nBase)out.push(mark(["info",`${pk.nBase} basement${pk.nBase>1?"s":""} of ${pk.perBasement} spaces${P.park.basements==="auto"?" (as many as the requirement needs)":""}.`]));
  if(P.park.basements==="auto"&&pk.provided<r.total&&pk.nBase>=(+P.park.maxBase||6))out.push(mark(["warn",`Even ${pk.nBase} basements fall short. Reduce the apartment count, use Column B if the site is in the PPTN area, or seek a reduction under Clause 52.06-7.`]));
  if(!pk.ramp&&(P.park.basements!=="0"))out.push(mark(["warn","No room for a ramp along the street edge: check the basement setback and the cores near the street."]));
  const co=pk.cost;
  if(co&&!pk.perBasement&&pk.ramp)out.push(mark(["warn",`No basement layout fits around the cores and columns from this ramp. Without the columns a basement takes ${co.noCols}, without the cores ${co.noCores}, open with a street crossover ${co.open}. Move or merge the cores, change the grid, or widen the basement.`]));
  if(co&&pk.perBasement){const parts=[];
    if(co.noCols>pk.perBasement)parts.push(`the ${P.grid.sx} × ${P.grid.sy} m columns ${co.noCols-pk.perBasement}`);
    if(co.noCores>pk.perBasement)parts.push(`the core${P.cores.length>1?"s":""} ${co.noCores-pk.perBasement}`);
    if(co.open>pk.perBasement)parts.push(`all of that plus the ramp ${co.open-pk.perBasement} (an open level with a street crossover takes ${co.open})`);
    if(parts.length)out.push(mark(["info",`A basement holds ${pk.perBasement} spaces. Spaces lost to ${parts.join("; to ")}. Grid spacings that suit the bays: Step 5; cores near the edge cost less than cores in the middle.`]))}
  return out;
}
function parkLevelName(){const pk=RES&&RES.park;if(!pk||!pk.levels.length)return "no car park levels";return (pk.levels[Math.min(parkLevel,pk.levels.length-1)]||{}).name||""}
function renderPark(){
  const pk=P.park;$("#pCol").value=pk.col;$("#pBase").value=String(pk.basements);$("#pBSet").value=pk.bSet;$("#pBFtf").value=pk.bFtf;$("#pRampW").value=pk.rampW;$("#pGrade").value=pk.rampGrade;
  const tb=$("#rateTable tbody");tb.innerHTML="";
  const r=pk.rates[pk.col],tr=document.createElement("tr");
  tr.innerHTML=`<td class="num">Column ${pk.col}</td>`+["one","three","visitor","retail"].map(k=>`<td><input type="number" step="0.1" min="0" data-k="${k}" value="${r[k]}" aria-label="${k} rate"></td>`).join("");
  tr.querySelectorAll("input").forEach(inp=>inp.addEventListener("input",()=>{const v=parseFloat(inp.value);if(isFinite(v)&&v>=0){r[inp.dataset.k]=v;schedule()}}));
  tb.appendChild(tr);
}
function renderParkOut(){
  const box=$("#parkOut"),pk=RES&&RES.park;if(!box)return;
  if(!pk){box.innerHTML=`<p class="hint">${parkDone?"No parking laid out.":"Laying out the car park levels…"}</p>`;$("#parkState").textContent="";return}
  $("#parkState").textContent=`${pk.provided} / ${pk.req.total} spaces`;
  box.innerHTML=`<div class="parkbig"><b>${pk.provided}</b><span>provided · ${pk.req.total} required${pk.provided>=pk.req.total?"":` · ${pk.req.total-pk.provided} short`}</span></div>`+
    pk.levels.map((l,i)=>`<button type="button" class="lvl${i===parkLevel?" sel":""}" data-i="${i}"><b>${esc(l.name)}</b><em>${l.bays}</em></button>`).join("")||`<p class="hint">No car park levels: set basements, or a level group's use to Car park.</p>`;
  box.querySelectorAll(".lvl").forEach(b=>b.addEventListener("click",()=>{parkLevel=+b.dataset.i;renderParkOut();window.__setView("park")}));
}
function bindPark(){
  $("#pCol").addEventListener("change",e=>{P.park.col=e.target.value;renderPark();schedule()});
  $("#pBase").addEventListener("change",e=>{P.park.basements=e.target.value==="auto"?"auto":+e.target.value;schedule()});
  const pn=(id,k,min)=>$(id).addEventListener("input",e=>{const v=parseFloat(e.target.value);if(isFinite(v)&&v>=min){P.park[k]=v;schedule()}});
  pn("#pBSet","bSet",0);pn("#pBFtf","bFtf",2.4);pn("#pRampW","rampW",3);pn("#pGrade","rampGrade",4);
}
function drawPark(){
  const {W,H,dpr}=canvasSize(),g=cv.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);
  const c={bg:css("--surface"),ink:css("--ink"),muted:css("--muted"),site:css("--site"),sunk:css("--sunk"),accent:css("--accent"),aisle:"#C3CCC6"};
  g.fillStyle=c.sunk;g.fillRect(0,0,W,H);
  const pts=P.site.pts,bb=bbox(pts),pad=Math.max(56,Math.min(W,H)*0.1),k=Math.min((W-2*pad)/Math.max(1,bb.x1-bb.x0),(H-2*pad)/Math.max(1,bb.y1-bb.y0));
  const ox=(W-(bb.x1-bb.x0)*k)/2-bb.x0*k,oy=(H+(bb.y1-bb.y0)*k)/2+bb.y0*k,T=p=>({x:ox+p.x*k,y:oy-p.y*k});
  planT=null;
  path(g,T,pts);g.lineWidth=1.5;g.strokeStyle=c.site;g.stroke();
  const pk=RES.park;
  g.font=`500 12px "IBM Plex Mono",monospace`;g.fillStyle=c.muted;g.textAlign="left";g.textBaseline="alphabetic";
  if(!pk||!pk.levels.length){g.fillText(parkDone?"No car park levels. Set basements or a car park level group under Step 7.":"Laying out the car park levels…",16,H-16);return}
  const L=pk.levels[Math.min(parkLevel,pk.levels.length-1)];
  for(const r of L.outline){path(g,T,r);g.fillStyle=c.bg;g.fill();g.lineWidth=1.2;g.strokeStyle=c.ink;g.stroke()}
  const lay=L.layout;
  if(lay){g.fillStyle=c.aisle;for(const a of lay.aisles){path(g,T,a.pts);g.fill()}for(const s of lay.spines){path(g,T,s);g.fill()}path(g,T,lay.stub);g.fill();
    let n=0;g.font=`500 ${Math.max(7,Math.min(10,k*0.8))}px "IBM Plex Mono",monospace`;g.textAlign="center";g.textBaseline="middle";
    for(const b of lay.bays){path(g,T,b.pts);g.fillStyle=b.kind==="acc"?css("--access"):c.bg;g.fill();g.lineWidth=0.8;g.strokeStyle=c.ink;g.stroke();if(b.kind!=="shared"&&k>5){n++;const q=T(window.G.centroid(b.pts));g.fillStyle=c.muted;g.fillText(n,q.x,q.y)}}}
  for(const o of L.obstacles){const big=Math.abs(area(o))>2;path(g,T,o);g.fillStyle=big?"#8E959A":"#1E292D";g.fill()}
  if(L.ramp){path(g,T,L.ramp.poly);g.fillStyle=hexA("#E2B007",0.35);g.fill();g.lineWidth=1.5;g.strokeStyle=c.ink;g.stroke();
    const q=T(window.G.centroid(L.ramp.poly));g.font=`600 11px "Barlow",sans-serif`;g.fillStyle=c.ink;g.textAlign="center";g.fillText(L.kind==="basement"?"RAMP":"RAMP",q.x,q.y)}
  g.font=`500 12px "IBM Plex Mono",monospace`;g.fillStyle=c.ink;g.textAlign="left";g.textBaseline="alphabetic";
  g.fillText(`${L.name}: ${L.bays} spaces · ${pk.provided} provided / ${pk.req.total} required`,16,H-16);
}

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
/* Side panels fold: opening one folds the others. The open one is remembered. */
const OPEN_KEY="bayline-feas-open";
function foldPanels(){
  const panels=[...document.querySelectorAll("aside .panel")];
  let open=null;try{open=localStorage.getItem(OPEN_KEY)}catch(e){}
  if(!panels.some(p=>p.getAttribute("aria-labelledby")===open))open=panels[0]&&panels[0].getAttribute("aria-labelledby");
  const set=id=>{for(const p of panels){const on=p.getAttribute("aria-labelledby")===id;p.classList.toggle("open",on);p.querySelector("h2").setAttribute("aria-expanded",on)}
    try{localStorage.setItem(OPEN_KEY,id||"")}catch(e){}
    // canvases inside a panel that was folded need a redraw once visible
    requestAnimationFrame(()=>{renderCoreLib&&(libKey="",renderCoreLib())})};
  for(const p of panels){
    const h=p.querySelector("h2"),body=document.createElement("div");body.className="pbody";
    while(h.nextSibling)body.appendChild(h.nextSibling);p.appendChild(body);
    h.tabIndex=0;h.setAttribute("role","button");
    const id=p.getAttribute("aria-labelledby");
    const go=()=>set(p.classList.contains("open")?null:id);
    h.addEventListener("click",e=>{if(e.target.closest("input,select,button,a"))return;go()});
    h.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}});
  }
  set(open);
}
function bind(){
  foldPanels();
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
  const setView=v=>{P.view=v;for(const [id,k] of [["#vPlan","plan"],["#vPark","park"],["#v3d","3d"]]){$(id).classList.toggle("on",v===k);$(id).setAttribute("aria-pressed",v===k)}
    $("#rot").hidden=v!=="3d";$("#viewTitle").textContent=v==="3d"?"Massing":v==="park"?`Parking · ${parkLevelName()}`:"Plan";draw();save()};
  window.__setView=setView;
  $("#vPlan").addEventListener("click",()=>setView("plan"));$("#v3d").addEventListener("click",()=>setView("3d"));$("#vPark").addEventListener("click",()=>setView("park"));
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
  $("#coreSuggest").addEventListener("click",()=>{const s=C.suggest(P,RES);if(!s.length){$("#coreNeed").textContent="no library core fits this floorplate";return}P.cores=s;P.coresBy="auto";P.coreKey=null;P.coreSel=0;renderCores();recompute()});
  $("#coreAdd").addEventListener("click",()=>{const base=P.cores[P.coreSel]||C.suggest(P,RES,1)[0];if(!base)return;
    const p=C.place(P,RES,{...base,id:nid()},P.cores);if(!p){$("#coreNeed").textContent="no room for another core of that type";return}P.cores.push(p);P.coresBy="hand";P.coreSel=P.cores.length-1;renderCores();recompute()});
  $("#coreCat").innerHTML=`<option value="all">All cores</option>`+Object.entries(C.CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");
  $("#coreCat").value=P.coreView.cat;$("#coreSuit").checked=P.coreView.suit;
  $("#coreCat").addEventListener("change",e=>{P.coreView.cat=e.target.value;renderCoreLib();save()});
  $("#coreSuit").addEventListener("change",e=>{P.coreView.suit=e.target.checked;renderCoreLib();save()});
  $("#perLift").addEventListener("input",e=>{P.coreRules.aptsPerLift=Math.max(10,parseFloat(e.target.value)||60);schedule()});
  $("#travelLim").addEventListener("input",e=>{P.coreRules.travel=Math.max(1,parseFloat(e.target.value)||6);schedule()});
  $("#feLim").addEventListener("input",e=>{P.coreRules.feTravel=Math.max(6,parseFloat(e.target.value)||25);schedule()});
  $("#fireMode").addEventListener("change",e=>{P.coreRules.fire=e.target.value;P.cores=[];P.coreAuto=true;renderGrid();schedule()});
  $("#massMode").addEventListener("change",e=>{P.mass.mode=e.target.value;P.cores=[];P.coreAuto=true;P.apt.edits={};schedule()});
  $("#massGap").addEventListener("input",e=>{P.mass.gap=Math.max(3,parseFloat(e.target.value)||9);P.cores=[];P.coreAuto=true;P.apt.edits={};schedule()});
  bindApts();bindPark();
  const gnum=(id,obj,k,min)=>$(id).addEventListener("input",e=>{const v=parseFloat(e.target.value);if(isFinite(v)&&v>=min){obj()[k]=v;schedule()}});
  gnum("#gSx",()=>P.grid,"sx",3);gnum("#gSy",()=>P.grid,"sy",3);gnum("#gCol",()=>P.grid,"col",0.2);
  gnum("#pW",()=>P.park,"W",2);gnum("#pL",()=>P.park,"L",4);gnum("#pA",()=>P.park,"A",3);
  $("#gAng").addEventListener("input",e=>{const v=parseFloat(e.target.value);P.grid.angle=isFinite(v)?v:null;schedule()});
  $("#gSnap").addEventListener("change",e=>{P.grid.snap=e.target.checked;if(P.grid.snap)P.cores.forEach(snapInst);schedule()});
  $("#gCentre").addEventListener("change",e=>{P.grid.centre=e.target.value;centreGrid();P.cores.forEach(snapInst);recompute()});
  $("#gAlign").addEventListener("click",()=>{const inst=P.cores[P.coreSel];if(!inst)return;const geo=C.geom(inst),F=GR.frame(P);P.grid.centre="manual";$("#gCentre").value="manual";
    const us=geo.outline.map(p=>F.toG(p));const o=F.toW(Math.min(...us.map(q=>q.u)),Math.min(...us.map(q=>q.v)));P.grid.ox=o.x;P.grid.oy=o.y;
    const t=GR.angle(P)*180/Math.PI;P.cores.forEach(c=>{if(Math.abs(((c.rot-t)%90+90)%90)>0.5&&Math.abs(((c.rot-t)%90+90)%90-90)>0.5)c.rot=t});
    renderGrid();recompute()});
  // drag cores on the plan
  let drag=null;
  const at=e=>{const r=cv.getBoundingClientRect();return planT.inv(e.clientX-r.left,e.clientY-r.top)};
  const hit=w=>{for(let i=P.cores.length-1;i>=0;i--){const geo=C.geom(P.cores[i]);if(geo&&window.G.pip(w,geo.outline))return i}return -1};
  cv.addEventListener("pointerdown",e=>{if(P.view!=="plan"||!planT)return;
    const r0=cv.getBoundingClientRect(),hd=handleAt(e.clientX-r0.left,e.clientY-r0.top);
    if(hd){wallDrag={...hd};cv.setPointerCapture(e.pointerId);cv.classList.add("drag");e.preventDefault();return}
    const w=at(e),i=hit(w);if(i<0)return;
    const inst=P.cores[i];drag={i,dx:inst.x-w.x,dy:inst.y-w.y};P.coreSel=i;cv.setPointerCapture(e.pointerId);cv.classList.add("drag");renderCores();e.preventDefault()});
  cv.addEventListener("pointermove",e=>{if(P.view!=="plan"||!planT)return;const w=at(e);
    if(wallDrag){const L=typLayout();if(!L)return;const pr=AP.project(L.loops[wallDrag.ring],w);wallDrag.s=pr.s;wallDrag.moved=true;drawPlan();return}
    if(!drag){const r0=cv.getBoundingClientRect();cv.classList.toggle("over",hit(w)>=0||!!handleAt(e.clientX-r0.left,e.clientY-r0.top));return}
    const inst=P.cores[drag.i];inst.x=w.x+drag.dx;inst.y=w.y+drag.dy;snapInst(inst);P.coresBy="hand";drawPlan()});
  const end=()=>{if(wallDrag){const wd=wallDrag;wallDrag=null;cv.classList.remove("drag");if(wd.moved){const L=typLayout();editCuts(cs=>{cs[wd.idx]={ring:wd.ring,s:AP.clampCut(L.loops[wd.ring],wd.s,L.ban||L.d)}})}return}
    if(!drag)return;drag=null;cv.classList.remove("drag");recompute()};
  cv.addEventListener("dblclick",e=>{if(P.view!=="plan"||!planT)return;const r0=cv.getBoundingClientRect(),hd=handleAt(e.clientX-r0.left,e.clientY-r0.top);
    if(hd){editCuts(cs=>{cs.splice(hd.idx,1)});return}
    const L=typLayout();if(!L)return;const w=at(e);
    if(!L.units.some(u=>window.G.pip(w,u.poly)))return;
    let best=null;L.loops.forEach((lp,ri)=>{const pr=AP.project(lp,w);if(!best||pr.d<best.d)best={...pr,ring:ri}});
    const s2=AP.splitAt(L,best.ring,best.s),P0=L.loops[best.ring].perim;
    if(L.cuts.some(c=>c.ring===best.ring&&Math.min(Math.abs(c.s-s2),P0-Math.abs(c.s-s2))<2)){$("#aptState").textContent="corner apartments can't split: walls stay one apartment depth from a corner";return}
    editCuts(cs=>{cs.push({ring:best.ring,s:s2})})});
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
window.__fz={get P(){return P},get R(){return RES},get max(){return MAX},loadSite,setPlanning:r=>{setPlanning(r);renderPlanning()},recompute,fill:()=>{fillToLimits(false);renderStack();recompute()},set:(fn)=>{fn(P);renderAll()},park:()=>RES&&RES.park,parkDone:()=>parkDone,cores:C,grid:GR,apts:AP,typ:()=>typLayout(),editCuts,ready:()=>coresReady};
})();
