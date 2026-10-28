// Feasibility page check: every bench lot under three zones (envelope, stack, auto core, apartment layout, parking), plus screenshots.
// Needs Node Playwright and clipper-lib:  npm i --no-save clipper-lib@6.4.2
// Run from the repo root:  node bench/feas.js            (screenshots go to bench/out/feas/)
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),http=require('http');
const ROOT=path.join(__dirname,'..'),OUT=path.join(__dirname,'out','feas');fs.mkdirSync(OUT,{recursive:true});
const CLIPPER=require.resolve('clipper-lib/clipper.js',{paths:[ROOT,process.cwd()]});
const types={'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/\/$/,'/index.html'));
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});r.end(d)})}).listen(0);
const lots=JSON.parse(fs.readFileSync(path.join(__dirname,'lots.json')));
// bench lots are in local metres: place them near Cheltenham as lon/lat
const toLL=ring=>{const kx=111320*Math.cos(-37.97*Math.PI/180),ky=110574;return ring.map(([x,y])=>[145.04+x/kx,-37.97+y/ky])};
const ZONES=[['MUZ1','MIXED USE ZONE - SCHEDULE 1',40],['GRZ1','GENERAL RESIDENTIAL ZONE - SCHEDULE 1',null],['RGZ1','RESIDENTIAL GROWTH ZONE - SCHEDULE 1',null]];
(async()=>{
  const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1440,height:1000}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route(/clipper-lib/,r=>r.fulfill({path:CLIPPER,contentType:'text/javascript'}));
  await pg.route(/(unpkg|openfreemap|fonts\.g|opendata\.maps)/,r=>r.abort());   // map and Vicmap are not needed here
  await pg.goto(`http://localhost:${srv.address().port}/feasibility/`);await pg.waitForFunction('window.__fz&&window.__fz.R&&window.__fz.ready()');
  let problems=0;
  for(const [code,desc,h] of ZONES){
    let noPark=0,reqN=0,gotN=0,baseN=0,ms=0,gfa=0,aptN=0,typN=0,offN=0,effS=0,effN=0;const coreN={};
    for(const [i,l] of lots.entries()){
      await pg.evaluate(([doc,code,desc,h])=>{window.__fz.loadSite(doc,{planning:false});window.__fz.setPlanning({zones:[{code,desc,pct:100}],overlays:[]});
        if(h){window.__fz.set(P=>{P.ctl.height=h});window.__fz.fill()}},[{id:`b${i}-${code}`,address:l.name,spi:l.spi,ring:toLL(l.ring),front:l.front,roads:[]},code,desc,h]);
      const tp=Date.now();await pg.waitForFunction('window.__fz.parkDone()',null,{timeout:120000});const parkMs=Date.now()-tp;
      const r=await pg.evaluate(([doc,code,desc,h])=>{
        const t0=performance.now();
        const R=window.__fz.R,G=window.G,s=window.__fz.P.site.pts,site=[G.area(s)<0?s.slice().reverse():s];
        let out=0;for(const g of R.groups)out+=G.shapeArea(G.diff(g.fp,site));
        const P=window.__fz.P,cores=P.cores.map(c=>c.core+(c.variant?'+':'')).join(' ');
        const T=window.__fz.typ(),apt=T?{n:T.units.length,eff:T.eff,off:T.units.filter(u=>!u.ok).length,mix:window.__fz.apts.mixText(window.__fz.apts.counts(T.units),P.apt.types)}:null;
        const pk=window.__fz.park(),park=pk?{req:pk.req.total,got:pk.provided,nb:pk.nBase,per:pk.perBasement,clash:pk.levels.reduce((m,l)=>m+(l.layout?l.layout.bays.filter(b=>l.obstacles.some(o=>window.CARPARK.sat(b.pts,o))).length:0),0)}:null;
        return {park,ms:performance.now()-t0,gfa:R.gfa,st:R.storeys,far:R.far,out,cores,apt,apts:R.apts,warn:R.checks.filter(c=>c[0]==='warn').map(c=>c[1]),fails:R.checks.filter(c=>c[0]==='bad'&&!c.park).map(c=>c[1])};
      },[{id:`b${i}-${code}`,address:l.name,spi:l.spi,ring:toLL(l.ring),front:l.front,roads:[]},code,desc,h]);
      ms+=r.ms+parkMs;gfa+=r.gfa;if(r.park){reqN+=r.park.req;gotN+=r.park.got;baseN+=r.park.nb;if(r.park.req>0&&r.park.got===0){noPark++;if(process.env.VERBOSE)console.log(`  ${code} lot ${i} ${l.name}: no parking laid out (engine limit, reported on the page)`)}if(r.park.clash){problems++;console.log(`  ${code} lot ${i} ${l.name}: ${r.park.clash} bays on a column, core or ramp`)}}aptN+=r.apts||0;if(r.apt){typN+=r.apt.n;offN+=r.apt.off;effS+=r.apt.eff;effN++}
      if(!r.apt||!r.apt.n){problems++;console.log(`  ${code} lot ${i} ${l.name}: no apartments laid out`)}coreN[r.cores||'none']=(coreN[r.cores||'none']||0)+1;
      if(!r.cores){problems++;console.log(`  ${code} lot ${i} ${l.name}: no core fits`)}
      if(process.env.VERBOSE)console.log(`  ${code} ${i} ${l.name}: ${r.st} st, core ${r.cores}, typical ${r.apt?`${r.apt.n} apts (${r.apt.mix}) ${Math.round(r.apt.eff*100)}% off-brief ${r.apt.off}`:'-'}, parking ${r.park?`${r.park.got}/${r.park.req} in ${r.park.nb} basements of ${r.park.per}`:'-'}, ${Math.round(r.ms+parkMs)} ms`,r.warn.filter(w=>!/^Grid/.test(w)).map(w=>w.slice(0,90)));
      if(r.out>0.1||r.fails.length){problems++;console.log(`  ${code} lot ${i} ${l.name}: outside site ${r.out.toFixed(2)} m², fails ${JSON.stringify(r.fails)}`)}
      if(i===19||i===3){await (await pg.$('.sheet')).screenshot({path:`${OUT}/${code}_${i}_plan.png`});await pg.click('#v3d');await (await pg.$('.sheet')).screenshot({path:`${OUT}/${code}_${i}_3d.png`});await pg.click('#vPlan')}
    }
    console.log(`${code}: ${lots.length} lots, total GFA ${Math.round(gfa).toLocaleString()} m², ${Math.round(ms/lots.length)} ms per lot, ${aptN} apartments (typical floors ${typN}, off brief ${offN}, mean efficiency ${Math.round(effS/Math.max(1,effN)*100)}%), parking ${gotN} of ${reqN} required in ${baseN} basements (no layout on ${noPark} lots), cores ${Object.keys(coreN).length} patterns`);
  }
  console.log(`problems: ${problems} | page errors: ${errs.length?errs.join('; '):'none'}`);
  await b.close();srv.close();process.exit(problems||errs.length?1:0);
})();
