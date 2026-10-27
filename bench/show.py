"""Run one test lot and screenshot an option.
python3 bench/show.py <lot index> [option index, default 0] ['{"json":"settings overrides"}']
Prints every option and saves bench/out/lot<i>_opt<k>.png"""
import asyncio,json,os,sys
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__));OUT=os.path.join(HERE,'out');os.makedirs(OUT,exist_ok=True)
lots=json.load(open(os.path.join(HERE,'lots.json')))
src=open(os.path.join(HERE,'bench.py')).read()
base=json.loads(src.split("base=",1)[1].split("\nJS=")[0].replace("True","true").replace("False","false"))
i=int(sys.argv[1]);pick=int(sys.argv[2]) if len(sys.argv)>2 else 0;extra=json.loads(sys.argv[3]) if len(sys.argv)>3 else {}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1400,'height':1100})
        await pg.goto('file://'+os.path.abspath(os.path.join(HERE,'..','index.html')))
        l=lots[i];st={**base,"shape":"custom","front":l["front"],"custom":[{"x":x,"y":y} for x,y in l["ring"]],"address":l['spi'],**extra}
        await pg.evaluate("s=>{localStorage.clear();localStorage.setItem('bayline-v1',JSON.stringify(s))}",st)
        await pg.reload();await pg.wait_for_function("window.__blDone===true",timeout=180000)
        for t in await pg.eval_on_selector_all('.opt .meta',"els=>els.map(e=>e.innerText.replace(/\\n/g,' '))"):print(t)
        btns=await pg.query_selector_all('.opt')
        if pick<len(btns):await btns[pick].click();await pg.wait_for_timeout(400)
        path=os.path.join(OUT,f'lot{i:02d}_opt{pick}.png');await (await pg.query_selector('.sheet')).screenshot(path=path);print("saved",path)
        await b.close()
asyncio.run(main())
