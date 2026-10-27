"""Compare two benchmark runs: python3 bench/compare.py <old_tag> <new_tag>
Exits 1 if any lot got worse or the rule checker removed bays in the new run."""
import json,os,sys
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'out')
a={r['lot']:r for r in json.load(open(os.path.join(OUT,f'res_{sys.argv[1]}.json')))}
b=json.load(open(os.path.join(OUT,f'res_{sys.argv[2]}.json')))
worse=[];same=[r for r in b if r['lot'] in a]
for r in b:
    o=a.get(r['lot'])
    if o is None:print(f"  new  {r['lot'][:44]:44s} {r['bays']}");continue
    d=r['bays']-o['bays']
    if d:print(f"  {'+' if d>0 else '-'}{abs(d):<3d} {r['lot'][:44]:44s} {o['bays']} -> {r['bays']}")
    if d<0:worse.append(r['lot'])
print(f"total (shared lots) {sum(a[r['lot']]['bays'] for r in same)} -> {sum(r['bays'] for r in same)}; time {sum(a[r['lot']]['t'] for r in same):.1f}s -> {sum(r['t'] for r in same):.1f}s")
drops=sum(r['dropped'] for r in b)
print("worse:",worse or "none","| bays removed by checker:",drops)
sys.exit(1 if worse or drops else 0)
