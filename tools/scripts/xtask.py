#!/usr/bin/env python3
"""Fail-closed suite execution. Validators never receive behavioural test counts."""
import sys,os,pathlib,subprocess,json,re,time,hashlib,gzip,urllib.request,tarfile,io
ROOT=pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
(ROOT/'.cache/tmp').mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(ROOT/'.cache/tmp')
os.environ['POCKET_IC_MUTE_SERVER']='1'
os.environ['DFX_IDENTITY']='codex_local'
os.environ['CARGO_INCREMENTAL']='0'
OUT=ROOT/'dist/evidence';OUT.mkdir(parents=True,exist_ok=True)
results=[]
SOURCE_COMMIT=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
SOURCE_DIRTY=bool(subprocess.check_output(['git','status','--porcelain']).strip())
FILES=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
SOURCE_FILES={f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest() for f in FILES if f and pathlib.Path(f).is_file()}
SOURCE_TREE_HASH=hashlib.sha256(json.dumps(SOURCE_FILES,sort_keys=True).encode()).hexdigest()
PREPARED_ARTIFACTS={}

def run(args,kind='validator',name=None,show=True):
    print('+ '+' '.join(map(str,args)),flush=True)
    process=subprocess.Popen(list(map(str,args)),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    lines=[]
    for line in process.stdout:
        lines.append(line)
        if show:print(line,end='',flush=True)
    process.wait()
    class Result:pass
    p=Result();p.returncode=process.returncode;p.stdout=''.join(lines)
    if not show and p.returncode:print(p.stdout,flush=True)
    record={'name':name or ' '.join(map(str,args)),'kind':kind,'exit_code':p.returncode}
    if kind=='behaviour':
        summaries=re.findall(r'test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored;',p.stdout)
        counts={k:sum(int(s[i]) for s in summaries) for i,k in [(1,'passed'),(2,'failed'),(3,'ignored')]}
        record.update(counts)
        if not summaries or counts['passed']==0 or counts['failed']!=0:
            record['exit_code']=1;record['error']='missing positive execution, failed tests, or invalid summaries'
    results.append(record);save()
    if record['exit_code']!=0: raise RuntimeError(f"required gate failed: {record['name']}")
    return p.stdout

def save():
    (OUT/(sys.argv[1]+'-run.json')).write_text(json.dumps({'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source':SOURCE_COMMIT,'source_dirty':SOURCE_DIRTY,'source_tree_sha256':SOURCE_TREE_HASH,'source_files':SOURCE_FILES,'prepared_artifacts':PREPARED_ARTIFACTS,'gates':results},indent=2)+'\n')

def prepare():
    run(['cargo','run','--locked','-p','d-quorum','--example','export'],name='Candid generation check',show=False)
    current=subprocess.check_output(['cargo','run','--locked','--quiet','-p','d-quorum','--example','export'])
    if current!=(ROOT/'candid/d_quorum.did').read_bytes():raise RuntimeError('committed Candid is stale')
    for dependency in ('governance','ledger'):
        current=subprocess.check_output(['cargo','run','--locked','--quiet','-p','quorum-ic-clients','--example',dependency+'_interface'])
        if current!=(ROOT/f'candid/{dependency}-client.did').read_bytes():raise RuntimeError(dependency+' client Candid is stale')

    run(['cargo','build','--locked','--release','--target','wasm32-unknown-unknown','-p','d-quorum','-p','quorum-mocks'],name='prepare Wasm before fixtures')
    for name in ('d_quorum','quorum_mocks'):
        path=ROOT/f'target/wasm32-unknown-unknown/release/{name}.wasm'
        PREPARED_ARTIFACTS[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    provision()

def provision():
    pins=json.loads((ROOT/'protocol-pins.json').read_text())
    for entry in pins['artifacts']:
        download(entry['url'],ROOT/'.cache/protocol'/entry['name'],entry['sha256'])
    p=ROOT/'.cache/tools/pocket-ic';entry=pins['pocketic']
    if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=entry['uncompressed_sha256']:
        b=gzip.decompress(urllib.request.urlopen(entry['url']).read())
        if hashlib.sha256(b).hexdigest()!=entry['uncompressed_sha256']:raise RuntimeError('PocketIC checksum')
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);p.chmod(0o755)
    run([p,'--version'],name='pinned PocketIC executable')
    didc=ROOT/'.cache/tools/didc';entry=pins['didc']
    if not didc.exists() or hashlib.sha256(didc.read_bytes()).hexdigest()!=entry['uncompressed_sha256']:
        archive=ROOT/'.cache/tools/didc.tar.xz';download(entry['url'],archive,entry['archive_sha256'])
        b=tarfile.open(archive,'r:xz').extractfile('didc-x86_64-unknown-linux-musl/didc').read()
        if hashlib.sha256(b).hexdigest()!=entry['uncompressed_sha256']:raise RuntimeError('didc executable checksum')
        didc.write_bytes(b);didc.chmod(0o755)
    run([didc,'--version'],name='pinned didc executable')
    run([didc,'check','candid/d_quorum.did'],name='public Candid typecheck')
    for dependency in ('governance','ledger'):
        run([didc,'check',f'candid/{dependency}.upstream.did',f'candid/{dependency}-client.did'],name=dependency+' interface compatibility')


def download(url,path,digest):
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()==digest:return
    path.parent.mkdir(parents=True,exist_ok=True);b=urllib.request.urlopen(url).read()
    if hashlib.sha256(b).hexdigest()!=digest:raise RuntimeError('artifact checksum: '+url)
    path.write_bytes(b)

def unit():
    # Workspace target discovery includes new test-bearing packages; no maintained package allowlist.
    meta=json.loads(subprocess.check_output(['cargo','metadata','--locked','--no-deps','--format-version','1']))
    selected=[p['name'] for p in meta['packages'] if p['id'] in meta['workspace_members'] and any(t['test'] for t in p['targets'])]
    if not selected:raise RuntimeError('no test-bearing packages discovered')
    listing=run(['cargo','test','--locked','--workspace','--lib','--bins','--','--list'],name='test discovery: '+', '.join(selected))
    discovered=sum(map(int,re.findall(r'(?m)^(\d+) tests?, \d+ benchmarks?$',listing)))
    output=run(['cargo','test','--locked','--workspace','--lib','--bins'],kind='behaviour',name='unit/property/upstream-parity')
    matches=re.findall(r'test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;',output)
    executed=sum(sum(map(int,m)) for m in matches)
    if executed!=discovered:raise RuntimeError(f'test discovery mismatch: {discovered} discovered; {executed} accounted')

def suite(target):
    prepare()
    if target=='protocol':
        listing=run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--list'],name='ignored protocol discovery')
        names=re.findall(r'(?m)^([A-Za-z0-9_]+): test$',listing)
        if not names:raise RuntimeError('required ignored protocol suite absent')
        for name in names:
            run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--exact',name,'--nocapture','--test-threads=1'],kind='behaviour',name=target+':'+name)
    else:
        run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--nocapture','--test-threads=1'],kind='behaviour',name=target)

def production():
    prepare();run(['python3','tools/scripts/verify_artifact.py','target/wasm32-unknown-unknown/release/d_quorum.wasm'],name='actual production exports and embedded Candid')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','mocked','--','--ignored','production_timers','--nocapture'],kind='behaviour',name='production natural timers and upgrade')

def canonical_artifact():
    prepare()
    artifact=ROOT/'dist/release/d_quorum.wasm'
    if not artifact.exists():raise RuntimeError('canonical candidate missing; run reproducible first')
    manifest=json.loads((ROOT/'dist/release/manifest.json').read_text())
    if hashlib.sha256(artifact.read_bytes()).hexdigest()!=manifest['artifacts']['d_quorum.wasm']:raise RuntimeError('canonical artifact checksum mismatch')
    for path,digest in manifest['source_files'].items():
        if path.startswith(('canisters/','crates/','vendor/','candid/')) or path in ('Cargo.toml','Cargo.lock','rust-toolchain.toml','Dockerfile.repro'):
            if hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=digest:raise RuntimeError('canonical source changed: '+path)
    os.environ['D_QUORUM_TEST_WASM']=str(artifact)
    PREPARED_ARTIFACTS['canonical']=hashlib.sha256(artifact.read_bytes()).hexdigest()
    run(['python3','tools/scripts/verify_artifact.py',artifact],name='canonical actual exports and embedded Candid')
    for target,name in [('mocked','production_timers_ignore_private_support_and_recover_upgrade_configuration'),('protocol','production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers')]:
        run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--exact',name,'--nocapture','--test-threads=1'],kind='behaviour',name='canonical:'+name)

def coverage():
    run(['cargo','llvm-cov','--version'])
    run(['cargo','llvm-cov','--locked','--workspace','--lib','--bins','--json','--output-path','dist/evidence/coverage.json'],kind='behaviour',name='instrumented unit/property coverage')
    data=json.loads((OUT/'coverage.json').read_text());(OUT/'coverage-totals.json').write_text(json.dumps(data['data'][0]['totals'],indent=2)+'\n')

def security():
    run(['cargo','audit','--version'])
    output=run(['cargo','audit','--json'],name='RustSec whole-workspace audit')
    (OUT/'security.json').write_text(output)
    run(['python3','tools/scripts/sbom.py'],name='locked dependency SBOM and production dependency isolation')

def full():
    run(['cargo','fmt','--all','--','--check'])
    run(['cargo','clippy','--locked','--workspace','--all-targets','--','-D','warnings'])
    unit();suite('mocked');suite('protocol');production();suite('scale');coverage();security();run(['python3','tools/scripts/canonical.py'],name='two clean canonical builds');canonical_artifact()
    # The required matrix is explicit and is not silently replaced by the suites currently implemented.
    matrix=json.loads((ROOT/'docs/acceptance-matrix.json').read_text())
    if any(x['status']!='executed' for x in matrix['requirements'] if x['suite']!='acceptance' and x.get('mandatory',True)):raise RuntimeError('mandatory behavioural matrix still contains unqualified requirements')

COMMANDS={'unit':unit,'mock':lambda:suite('mocked'),'protocol':lambda:suite('protocol'),'production':production,'canonical_artifact':canonical_artifact,'scale':lambda:suite('scale'),'coverage':coverage,'security':security,'acceptance':full,'reproducible':lambda:run(['python3','tools/scripts/canonical.py']),'prepare':prepare}
try:
    cmd=sys.argv[1] if len(sys.argv)>1 else 'help'
    if cmd not in COMMANDS:raise RuntimeError('commands: '+', '.join(COMMANDS))
    COMMANDS[cmd]()
except (RuntimeError,FileNotFoundError,subprocess.CalledProcessError) as e:
    print(str(e),file=sys.stderr);save();sys.exit(1)
