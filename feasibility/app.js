/* Bayline Feasibility: site -> planning controls -> envelope -> level stack. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const {area,bbox,inward,shapeArea,projectRing}=window.G;
const R=window.RULES,E=window.ENV;
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
  return {v:1,site:exampleSite(),zone:{key:"",code:"",desc:"",sched:"",auto:false},overlays:[],planning:"none",ctl,stack:defaultStack("MUZ"),aptSize:68,effApt:78,spaceArea:30,view:"plan",rot:0,sel:null};
}
function load(){try{const o=JSON.parse(localStorage.getItem(KEY)||"null");if(o&&o.v===1&&o.site&&o.site.pts&&o.stack)return o}catch(e){}return null}
const saved=load();let P=saved||defaultProject();
let saveT=null;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}},200)}

function applyEff(){for(const g of P.stack)g.eff=g.use==="apartments"?P.effApt/100:undefined}

/* ---------- Site loading ---------- */
function siteFromDoc(doc){
  const pr=projectRing(doc.ring);const pts=pr.pts;
  const front=Math.min(doc.front||0,pts.length-1);
  return {id:doc.id||"site",address:doc.address||"",spi:doc.spi||"",ring:doc.ring,pts,front,roads:doc.roads||[],edges:E.classifyEdges(pts,front,doc.roads||[])};
}
function loadSite(doc,opts={}){
  P.site=siteFromDoc(doc);P.sel=null;
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
  P.ctl=ctl;P.stack=defaultStack(key);$("#maxMsg").textContent="";
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
  renderSummary();renderStackOut();renderSched();draw();save();
}
let rT=null;function schedule(){clearTimeout(rT);rT=setTimeout(recompute,60)}

function renderAll(){renderSite();renderPlanning();renderControls();renderStack();recompute()}

/* site + edges */
const EDGE_LABEL={street:"Street",side:"Side",rear:"Rear",lane:"Lane"};
let hlEdge=-1;
function renderSite(){
  const s=P.site,n=s.pts.length,A=Math.abs(area(s.pts));
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
      return d>0?`Room for ${d} more ${g.name} floor${d>1?"s":""} before the ${w} limit.`:d===0?`${w[0].toUpperCase()+w.slice(1)} governs: the stack is at the limit.`:`Over the limit: remove ${-d} ${g.name} floor${d<-1?"s":""} (${w}).`})()):"";
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
      <dt>Site coverage</dt><dd>${lim(fmt(r.coverage),c.coverage,"%")}${c.coverage?"":"%"}</dd>
      <dt>Open area</dt><dd>${fmt(r.garden)}%</dd>
    </dl>
    <ul class="checks">${r.checks.map(([k,t])=>`<li><span class="pill ${k}">${k==="ok"?"OK":k==="bad"?"Fail":k==="warn"?"Check":"Note"}</span><span>${esc(t)}</span></li>`).join("")}</ul>`;
}

/* area schedule */
function schedRows(){
  const rows=RES.groups.slice().reverse().filter(g=>g.floors).map(g=>({name:g.name,levels:lvl(g.storeyFrom)+(g.floors>1?"–"+lvl(g.storeyTo):""),floors:g.floors,ftf:g.ftf,top:g.z1,plate:g.fpArea,gfa:g.gfa,use:R.USES[g.use].label,nsa:g.nsa,count:g.apts?`≈ ${g.apts} apts`:g.spaces?`≈ ${g.spaces} cars`:""}));
  return rows;
}
function renderSched(){
  if(!RES)return;
  const rows=schedRows();
  $("#schedNote").textContent=`${RES.storeys} storeys · ${fmt(RES.height,1)} m`;
  $("#sched").innerHTML=`<thead><tr><th>Group</th><th>Levels</th><th>Floors</th><th>F–F m</th><th>Top m</th><th>Plate m²</th><th>GFA m²</th><th>Use</th><th>NSA m²</th><th>Count</th></tr></thead><tbody>`+
    rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.levels}</td><td>${r.floors}</td><td>${fmt(r.ftf,2)}</td><td>${fmt(r.top,1)}</td><td>${fmt(r.plate)}</td><td>${fmt(r.gfa)}</td><td style="font-family:var(--f-body)">${r.use}</td><td>${fmt(r.nsa)}</td><td>${r.count}</td></tr>`).join("")+
    `<tr class="tot"><td>Total</td><td></td><td>${RES.storeys}</td><td></td><td>${fmt(RES.height,1)}</td><td></td><td>${fmt(RES.gfa)}</td><td></td><td>${fmt(RES.nsa)}</td><td>${RES.apts?`≈ ${RES.apts} apts`:""}</td></tr></tbody>`;
}
function saveCSV(){
  const rows=schedRows();const q=v=>`"${String(v).replace(/"/g,'""')}"`;
  const lines=[["Site",P.site.address],["Zone",P.zone.code||P.zone.key],["Site area m2",Math.round(RES.siteArea)],[],["Group","Levels","Floors","Floor to floor m","Top m","Floorplate m2","GFA m2","Use","NSA m2","Count"],
    ...rows.map(r=>[r.name,r.levels,r.floors,r.ftf,r.top.toFixed(1),Math.round(r.plate),Math.round(r.gfa),r.use,Math.round(r.nsa),r.count]),
    ["Total","",RES.storeys,"",RES.height.toFixed(1),"",Math.round(RES.gfa),"",Math.round(RES.nsa),RES.apts]];
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
  // boundary, edges by type
  const n=pts.length,sg=Math.sign(area(pts))||1;
  g.font=`500 11px "IBM Plex Mono",monospace`;g.textAlign="center";g.textBaseline="middle";
  for(let i=0;i<n;i++){
    const a=pts[i],b=pts[(i+1)%n],t=P.site.edges[i];
    const A=T(a),B=T(b);g.beginPath();g.moveTo(A.x,A.y);g.lineTo(B.x,B.y);
    g.lineWidth=i===hlEdge?6:t==="street"?4.5:2;g.strokeStyle=i===hlEdge?c.accent:t==="street"?c.ink:c.site;g.stroke();
    const L=Math.hypot(b.x-a.x,b.y-a.y);if(L<4&&i!==hlEdge)continue;
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
  g.font=`500 11px "IBM Plex Mono",monospace`;g.fillStyle=c.muted;g.textAlign="left";g.textBaseline="alphabetic";
  g.fillText(`${fmt(RES.height,1)} m · ${RES.storeys} storeys${P.ctl.height?` · limit ${fmt(P.ctl.height,1)} m`:""}`,14,H-14);
}
function shadeCol(hex,f,sel){const m=/^#?([0-9a-f]{6})$/i.exec(hex);const n=parseInt(m[1],16);const ch=v=>Math.max(0,Math.min(255,Math.round(v*f)));return `rgba(${ch(n>>16&255)},${ch(n>>8&255)},${ch(n&255)},${sel?1:0.94})`}

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
  let rz=null;new ResizeObserver(()=>{clearTimeout(rz);rz=setTimeout(draw,60)}).observe(cv);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change",draw);
}

/* ---------- Boot ---------- */
bind();if(!saved)fillToLimits(true);renderAll();
const mapOK=VM.init({container:"map",stat:$("#mapStat"),accent:css("--accent"),onSelect,onFail:m=>{const el=$("#mapMsg");el.hidden=false;el.innerHTML=`<b>Map unavailable</b><span>${esc(m)}</span>`}});
if(mapOK&&P.site.ring)VM.goToRing(P.site.ring,P.site.address);
renderSites();

/* test hook */
window.__fz={get P(){return P},get R(){return RES},get max(){return MAX},loadSite,setPlanning:r=>{setPlanning(r);renderPlanning()},recompute,fill:()=>{fillToLimits(false);renderStack();recompute()},set:(fn)=>{fn(P);renderAll()}};
})();
