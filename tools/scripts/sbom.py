#!/usr/bin/env python3
import subprocess,json,pathlib,hashlib,tomllib
m=json.loads(subprocess.check_output(['cargo','metadata','--locked','--format-version','1']))
p=subprocess.check_output(['cargo','tree','--locked','-p','d-quorum','--target','wasm32-unknown-unknown','--edges','normal,build','--prefix','none'],text=True)
for forbidden in ['pocket-ic','proptest','quorum-mocks','quorum-pocketic','reqwest','xtask']:
    assert forbidden not in p,forbidden+' reached production'
out=pathlib.Path('dist/evidence');out.mkdir(parents=True,exist_ok=True)
components=[{'bom-ref':p['id'],'type':'library','name':p['name'],'version':p['version'],'licenses':[{'expression':p['license']}] if p['license'] else [],'purl':f"pkg:cargo/{p['name']}@{p['version']}",'properties':[{'name':'cargo:source','value':p['source'] or 'workspace'}]} for p in m['packages']]
sbom={'bomFormat':'CycloneDX','specVersion':'1.6','version':1,'metadata':{'component':{'type':'application','name':'D-QUORUM','version':'0.1.0'}},'components':components,'dependencies':[{'ref':n['id'],'dependsOn':[d['pkg'] for d in n['deps']]} for n in m['resolve']['nodes']]}
(out/'sbom.cdx.json').write_text(json.dumps(sbom,indent=2)+'\n');(out/'production-tree.txt').write_text(p)
print(f'{len(components)} locked components; production isolation passed; SBOM sha256='+hashlib.sha256((out/'sbom.cdx.json').read_bytes()).hexdigest())
