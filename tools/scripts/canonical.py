#!/usr/bin/env python3
import subprocess,pathlib,hashlib,json,shutil,time
root=pathlib.Path.cwd()
subprocess.run(['docker','version'],check=True)
# Refuse an unreviewable source tree. The evidence directory is ignored.
assert not subprocess.check_output(['git','status','--porcelain']).strip(),'commit source before canonical builds'
source_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
out=root/'dist/d-quorum-canonical'/source_commit
# Preserve prior operator releases. A source revision gets its own undeployed
# candidate; never replace dist/release or earlier canonical evidence.
out.mkdir(parents=True,exist_ok=True)
if (out/'release').exists():raise RuntimeError('canonical candidate already exists: '+str(out/'release'))
attempt=out/'attempts'/str(time.time_ns())
attempt.mkdir(parents=True,exist_ok=False)
source_files=subprocess.check_output(['git','ls-files','-z']).decode().split('\0');source={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in source_files if f}
context=attempt/'source.tar'
subprocess.run(['git','archive','--format=tar','--output',str(context),source_commit],check=True)
for n in (1,2):
    target=attempt/f'canonical-{n}'
    with context.open('rb') as stream:
        subprocess.run(['docker','build','--no-cache','--platform','linux/amd64','--file','Dockerfile.repro','--output',str(target),'-'],stdin=stream,check=True)
a=attempt/'canonical-1';b=attempt/'canonical-2';files=sorted(p.relative_to(a) for p in a.rglob('*') if p.is_file());assert files==sorted(p.relative_to(b) for p in b.rglob('*') if p.is_file())
for f in files:assert (a/f).read_bytes()==(b/f).read_bytes(),f
release=attempt/'release';release.mkdir(exist_ok=False)
for f in files:shutil.copyfile(a/f,release/f)
assert source_commit==subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip() and not subprocess.check_output(['git','status','--porcelain']).strip(),'source changed during canonical builds'
assert all(hashlib.sha256((root/f).read_bytes()).hexdigest()==h for f,h in source.items()),'source bytes changed during builds'
manifest={'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'image':'rust:1.94.1-slim-bookworm@sha256:cf9dd0ec73e75f827fe59123fff9dc65af1a1c8363c3c31ee8d7f8ad0b6a5fb2','platform':'linux/amd64','source_date_epoch':0,'source_files':source,'artifacts':{str(f):hashlib.sha256((release/f).read_bytes()).hexdigest() for f in files},'two_clean_builds_identical':True,'deployed':False,'canonical_builds':[str(a.relative_to(root)),str(b.relative_to(root))],'source_archive_sha256':hashlib.sha256(context.read_bytes()).hexdigest()}
(release/'manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n');(release/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(release.iterdir()) if p.is_file() and p.name!='SHA256SUMS'))
subprocess.run(['python3','tools/scripts/verify_artifact.py',str(release/'d_quorum.wasm')],check=True)
release.rename(out/'release')
print(json.dumps(manifest['artifacts'],indent=2))
