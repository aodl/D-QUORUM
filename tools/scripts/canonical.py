#!/usr/bin/env python3
import subprocess,pathlib,hashlib,json,shutil
root=pathlib.Path.cwd();out=root/'dist';out.mkdir(exist_ok=True)
subprocess.run(['docker','version'],check=True)
# Refuse an unreviewable source tree. The evidence directory is ignored.
assert not subprocess.check_output(['git','status','--porcelain']).strip(),'commit source before canonical builds'
source_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
source_files=subprocess.check_output(['git','ls-files','-z']).decode().split('\0');source={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in source_files if f}
for n in (1,2):
    target=out/f'canonical-{n}'
    if target.exists():shutil.rmtree(target)
    subprocess.run(['docker','build','--no-cache','--platform','linux/amd64','--file','Dockerfile.repro','--output',str(target),'.'],check=True)
a=out/'canonical-1';b=out/'canonical-2';files=sorted(p.relative_to(a) for p in a.rglob('*') if p.is_file());assert files==sorted(p.relative_to(b) for p in b.rglob('*') if p.is_file())
for f in files:assert (a/f).read_bytes()==(b/f).read_bytes(),f
release=out/'release';release.mkdir(exist_ok=True)
for f in files:shutil.copyfile(a/f,release/f)
assert source_commit==subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip() and not subprocess.check_output(['git','status','--porcelain']).strip(),'source changed during canonical builds'
assert all(hashlib.sha256((root/f).read_bytes()).hexdigest()==h for f,h in source.items()),'source bytes changed during builds'
manifest={'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'image':'rust:1.94.1-slim-bookworm@sha256:cf9dd0ec73e75f827fe59123fff9dc65af1a1c8363c3c31ee8d7f8ad0b6a5fb2','platform':'linux/amd64','source_date_epoch':0,'source_files':source,'artifacts':{str(f):hashlib.sha256((release/f).read_bytes()).hexdigest() for f in files},'two_clean_builds_identical':True}
(release/'manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n');(release/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(release.iterdir()) if p.is_file() and p.name!='SHA256SUMS'))
subprocess.run(['python3','tools/scripts/verify_artifact.py',str(release/'d_quorum.wasm')],check=True)
print(json.dumps(manifest['artifacts'],indent=2))
