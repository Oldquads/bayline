// Feasibility page check: every bench lot under three zones (envelope, stack, auto core), plus screenshots.
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
    let ms=0,gfa=0;const coreN={};
    for(const [i,l] of lots.entries()){
      const r=await pg.evaluate(([doc,code,desc,h])=>{
        const t0=performance.now();
        window.__fz.loadSite(doc,{planning:false});window.__fz.setPlanning({zones:[{code,desc,pct:100}],overlays:[]});
        if(h){window.__fz.set(P=>{P.ctl.height=h});window.__fz.fill()}
        const R=window.__fz.R,G=window.G,s=window.__fz.P.site.pts,site=[G.area(s)<0?s.slice().reverse():s];
        let out=0;for(const g of R.groups)out+=G.shapeArea(G.diff(g.fp,site));
        const P=window.__fz.P,cores=P.cores.map(c=>c.core+(c.variant?'+':'')).join(' ');
        return {ms:performance.now()-t0,gfa:R.gfa,st:R.storeys,far:R.far,out,cores,warn:R.checks.filter(c=>c[0]==='warn').map(c=>c[1]),fails:R.checks.filter(c=>c[0]==='bad').map(c=>c[1])};
      },[{id:`b${i}-${code}`,address:l.name,spi:l.spi,ring:toLL(l.ring),front:l.front,roads:[]},code,desc,h]);
      ms+=r.ms;gfa+=r.gfa;coreN[r.cores||'none']=(coreN[r.cores||'none']||0)+1;
      if(!r.cores){problems++;console.log(`  ${code} lot ${i} ${l.name}: no core fits`)}
      if(process.env.VERBOSE)console.log(`  ${code} ${i} ${l.name}: ${r.st} st, core ${r.cores}, ${Math.round(r.ms)} ms`,r.warn.filter(w=>!/^Grid/.test(w)).map(w=>w.slice(0,90)));
      if(r.out>0.1||r.fails.length){problems++;console.log(`  ${code} lot ${i} ${l.name}: outside site ${r.out.toFixed(2)} m², fails ${JSON.stringify(r.fails)}`)}
      if(i===19||i===3){await (await pg.$('.sheet')).screenshot({path:`${OUT}/${code}_${i}_plan.png`});await pg.click('#v3d');await (await pg.$('.sheet')).screenshot({path:`${OUT}/${code}_${i}_3d.png`});await pg.click('#vPlan')}
    }
    console.log(`${code}: ${lots.length} lots, total GFA ${Math.round(gfa).toLocaleString()} m², ${Math.round(ms/lots.length)} ms per lot, cores ${JSON.stringify(coreN)}`);
  }
  console.log(`problems: ${problems} | page errors: ${errs.length?errs.join('; '):'none'}`);
  await b.close();srv.close();process.exit(problems||errs.length?1:0);
})();
