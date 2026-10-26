import asyncio,json,sys,time
from playwright.async_api import async_playwright
lots=json.load(open('/home/claude/bench/lots.json'))
page=sys.argv[1]; tag=sys.argv[2] if len(sys.argv)>2 else ''
base={"setF":0,"setO":0,"entryAuto":True,"entry":0.5,"std":"vic26","spineW":6.4,"drvW":6.1,"acc":0,"blind":True,"wall":True,"sweep":True,
 "specs":{"p90":{"on":True,"W":2.6,"L":4.9,"A":6.4},"p60":{"on":False,"W":2.6,"L":4.9,"A":4.9},"p45":{"on":False,"W":2.6,"L":4.9,"A":3.5},"par":{"on":False,"W":2.3,"L":6.7,"A":3.6}},
 "dims":{"rect":{"F":40,"D":55},"trap":{"F":42,"D":60,"R":30,"O":6},"splay":{"F":45,"D":50,"C":8},"L":{"F":48,"D":60,"NW":20,"ND":24}}}
JS="""()=>{const R=window.__bl?window.__bl.results:null;if(!R)return null;
 return R.slice(0,12).map(r=>({total:r.total,mode:r.mode,infill:r.infill?r.infill.bays:0,issues:r.issues||null,alpha:Math.round(r.alpha*180/Math.PI),entry:r.ctx?r.ctx.entry:null}))}"""
async def main():
    rows=[]
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':1400,'height':1000})
        await pg.goto('file://'+page)
        for i,l in enumerate(lots):
            st={**base,"shape":"custom","front":l["front"],"custom":[{"x":x,"y":y} for x,y in l["ring"]],"address":l["name"]+" "+l["spi"]}
            await pg.evaluate("s=>{localStorage.clear();localStorage.setItem('bayline-v1',JSON.stringify(s))}",st)
            await pg.reload();t0=time.time()
            await pg.wait_for_function("window.__blDone===true||(window.__blDone===undefined&&document.querySelector('#status').textContent.includes('tested'))",timeout=180000)
            dt=time.time()-t0
            res=await pg.evaluate(JS)
            if res is None:
                tot=await pg.eval_on_selector_all('.opt .meta b',"els=>els.slice(0,1).map(e=>parseInt(e.innerText))")
                res=[{"total":tot[0] if tot else 0}]
            best=res[0] if res else {"total":0}
            ideal=l["area"]/21.06
            rows.append({"i":i,"lot":f'{l["name"]} {l["spi"]}',"area":l["area"],"bays":best["total"],"m2":round(l["area"]/max(1,best["total"]),1),"pack":round(best["total"]/ideal,2),"t":round(dt,1),
                         "dropped":sum((r.get("issues") or {}).get("dropped",0) for r in res if r.get("issues")),"bestdrop":(best.get("issues") or {}).get("dropped"),"mode":best.get("mode"),"infill":best.get("infill")})
            if len(sys.argv)>3:
                el=await pg.query_selector('.sheet');await el.screenshot(path=f'/home/claude/bench/{tag}_{i:02d}.png')
        await b.close()
    json.dump(rows,open(f'/home/claude/bench/res_{tag}.json','w'))
    for r in rows:print(f'{r["i"]:2d} {r["lot"][:38]:38s} {r["area"]:5d}m² {r["bays"]:4d} bays {r["m2"]:5.1f}m²/bay pack {r["pack"]:.2f} drop {r["dropped"]} {r["t"]}s {r["mode"] or ""} +{r["infill"] or 0}')
    print("TOTAL bays",sum(r["bays"] for r in rows),"| mean pack %.3f"%(sum(r["pack"] for r in rows)/len(rows)),"| total time %.1fs"%sum(r["t"] for r in rows))
asyncio.run(main())
