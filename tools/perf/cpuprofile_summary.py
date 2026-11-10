import json,glob,collections,sys
f=sorted(glob.glob((sys.argv[1] if len(sys.argv) > 1 else '.') + '/*.cpuprofile'))[-1]
p=json.load(open(f))
nodes={n['id']:n for n in p['nodes']}
parent={}
for n in p['nodes']:
    for c in n.get('children',[]): parent[c]=n['id']
self=collections.Counter(); incl=collections.Counter()
dt=p['timeDeltas']
for i,s in enumerate(p['samples']):
    n=nodes[s]['callFrame']; self[(n['functionName'],n['url'].split('/')[-1],n['lineNumber'])]+=dt[i]
    seen=set(); cur=s
    while cur is not None:
        cf=nodes[cur]['callFrame']; k=(cf['functionName'],cf['url'].split('/')[-1],cf['lineNumber'])
        if k not in seen: incl[k]+=dt[i]; seen.add(k)
        cur=parent.get(cur)
tot=sum(self.values())
print("self:"); [print(f"  {v/1000:.0f}ms {100*v/tot:.0f}% {k}") for k,v in self.most_common(9)]
print("inclusive:"); [print(f"  {v/1000:.0f}ms {k}") for k,v in incl.most_common(40) if k[1].endswith(('.ts','.mjs')) and k[0]][:16]
