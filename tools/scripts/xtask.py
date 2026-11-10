#!/usr/bin/env python3
"""Fail-closed suite execution. Validators never receive behavioural test counts."""
import sys,os,pathlib,subprocess,json,re,time,hashlib,gzip,urllib.request,tarfile,io,atexit,shutil,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
os.chdir(ROOT)
(ROOT/'.cache/tmp').mkdir(parents=True,exist_ok=True)
os.environ['TMPDIR']=str(ROOT/'.cache/tmp')
os.environ['POCKET_IC_MUTE_SERVER']='1'
os.environ['DFX_IDENTITY']='codex_local'
os.environ['CARGO_INCREMENTAL']='0'
OUT=ROOT/'dist/evidence';OUT.mkdir(parents=True,exist_ok=True)
RUN_LABEL=re.sub(r'[^a-zA-Z0-9_.-]+','_',sys.argv[1] if len(sys.argv)>1 else 'help')
ATTEMPT=OUT/'attempts'/f'{RUN_LABEL}-{time.time_ns()}-{os.getpid()}'
ATTEMPT.mkdir(parents=True,exist_ok=False)
results=[]
completed_suites=set()
RUN_STATUS="running"
SOURCE_COMMIT=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
DQ_CANONICAL=ROOT/'dist/d-quorum-canonical'/SOURCE_COMMIT
SOURCE_DIRTY=bool(subprocess.check_output(['git','status','--porcelain']).strip())
FILES=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
SOURCE_FILES={f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest() for f in FILES if f and pathlib.Path(f).is_file()}
SOURCE_TREE_HASH=hashlib.sha256(json.dumps(SOURCE_FILES,sort_keys=True).encode()).hexdigest()
PREPARED_ARTIFACTS={}

FIXTURE_SERVER=None
FIXTURE_LOG=None
FIXTURE_PORT=None
FIXTURE_GENERATION=0

def stop_fixture_server():
    global FIXTURE_SERVER,FIXTURE_LOG,FIXTURE_PORT
    server,log,port=FIXTURE_SERVER,FIXTURE_LOG,FIXTURE_PORT
    FIXTURE_SERVER=FIXTURE_LOG=FIXTURE_PORT=None
    try:
        if server is not None:
            os.environ.pop('D_QUORUM_POCKET_IC_URL',None)
            if server.poll() is None:
                server.terminate()
                try:server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill();server.wait()
            print(f'Closed owned PocketIC fixture server (exit status {server.returncode}).',flush=True)
    finally:
        if log is not None:log.close()
        if port is not None:port.unlink(missing_ok=True)

atexit.register(stop_fixture_server)

def fixture_server():
    global FIXTURE_SERVER,FIXTURE_LOG,FIXTURE_PORT,FIXTURE_GENERATION
    if FIXTURE_SERVER is not None:
        code=FIXTURE_SERVER.poll()
        if code is not None:raise RuntimeError(f'managed PocketIC server exited during suite (exit status {code})')
        return
    # A lane owns its server. Never restart within a test or join test worlds.
    # Fresh top-level lanes match the isolation of the existing hosted jobs.
    FIXTURE_GENERATION+=1
    port=ROOT/f'.cache/tmp/pocketic-runner-{os.getpid()}-{FIXTURE_GENERATION}.port'
    port.unlink(missing_ok=True)
    log=(OUT/f'pocketic-server-{os.getpid()}-{FIXTURE_GENERATION}.log').open('w')
    FIXTURE_PORT,FIXTURE_LOG=port,log
    # Keep server/sandbox teardown signals out of the qualification launcher's group.
    FIXTURE_SERVER=subprocess.Popen([str(ROOT/'.cache/tools/pocket-ic'),'--ttl','43200','--hard-ttl','43200','--port-file',str(port)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    print(f'Owned PocketIC fixture server {FIXTURE_GENERATION}: pid {FIXTURE_SERVER.pid}, log {log.name}.',flush=True)
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        code=FIXTURE_SERVER.poll()
        if code is not None:raise RuntimeError(f'managed PocketIC startup failed (exit status {code})')
        if port.exists() and port.read_text().endswith('\n'):
            number=int(port.read_text().strip())
            if not 0<number<65536:raise RuntimeError('invalid PocketIC port')
            os.environ['D_QUORUM_POCKET_IC_URL']=f'http://127.0.0.1:{number}/'
            return
        time.sleep(0.02)
    raise RuntimeError('managed PocketIC startup timeout')

def run(args,kind='validator',name=None,show=True):
    if kind=='behaviour' and '--test' in args:fixture_server()
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
    record={'name':name or ' '.join(map(str,args)),'kind':kind,'exit_code':p.returncode,'command_exit_code':p.returncode}
    log_name=str(ATTEMPT.relative_to(OUT)/f"{len(results)+1:03}-")+re.sub(r'[^a-zA-Z0-9_.-]+','-',record['name'])[:100]+'.log'
    (OUT/log_name).write_text(p.stdout)
    record['log']=log_name
    record['log_sha256']=hashlib.sha256(p.stdout.encode()).hexdigest()
    if kind=='behaviour':
        summaries=re.findall(r'test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored;',p.stdout)
        counts={k:sum(int(s[i]) for s in summaries) for i,k in [(1,'passed'),(2,'failed'),(3,'ignored')]}
        node_passed=re.findall(r'(?m)^[ℹ#] (?:pass|passed) (\d+)\s*$',p.stdout)
        node_failed=re.findall(r'(?m)^[ℹ#] (?:fail|failed) (\d+)\s*$',p.stdout)
        node_skipped=re.findall(r'(?m)^[ℹ#] skipped (\d+)\s*$',p.stdout)
        counts['passed']+=sum(map(int,node_passed));counts['failed']+=sum(map(int,node_failed));counts['ignored']+=sum(map(int,node_skipped))
        record.update(counts)
        record['executed_tests']=re.findall(r'(?m)^test (.+?) \.\.\.',p.stdout)+re.findall(r'(?m)^[ \t]*✔ (.+?) \([0-9.]+m?s\)$',p.stdout)
        python_tests=re.findall(r'(?m)^(test_\w+) \([^\n]+\) \.\.\. ok$',p.stdout)
        if python_tests:
            counts['passed']+=len(python_tests);record.update(counts);record['executed_tests']+=python_tests
        if (not summaries and not node_passed and not python_tests) or counts['passed']==0 or counts['failed']!=0 or counts['ignored']!=0 or len(record['executed_tests'])!=counts['passed']:
            record['exit_code']=1;record['error']='missing positive execution, failed tests, or invalid summaries'
    results.append(record);save()
    if record['exit_code']!=0: raise RuntimeError(f"required gate failed: {record['name']}")
    return p.stdout

def save():
    content=json.dumps({'status':RUN_STATUS,'completed_suites':sorted(completed_suites),'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source':SOURCE_COMMIT,'source_dirty':SOURCE_DIRTY,'source_tree_sha256':SOURCE_TREE_HASH,'source_files':SOURCE_FILES,'prepared_artifacts':PREPARED_ARTIFACTS,'gates':results},indent=2)+'\n'
    (OUT/(RUN_LABEL+'-run.json')).write_text(content)
    (ATTEMPT/'run.json').write_text(content)

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
    run(['cargo','build','--locked','--release','--target','wasm32-unknown-unknown','--manifest-path','dendrite/Cargo.toml','-p','dendrite'],name='prepare independent Dendrite Wasm')
    provision()

def prepare_bootstrap():
    run(['sh','-c','cd dendrite && node canisters/dendrite/web/build-bootstrap.mjs'],name='build bootstrap before certified frontend assets')
    release=pathlib.Path(os.environ.get('DENDRITE_BOOTSTRAP_RELEASE_DIR',str(ROOT/'dendrite/target/bootstrap-release')))
    manifest=json.loads((release/'manifest.json').read_text())
    PREPARED_ARTIFACTS['dendrite_bootstrap']=manifest

def creation_pure():
    run(['node','--test','tests/browser/creation-virtual-clock.test.mjs','tests/browser/pocketic-wall-clock.test.mjs'],kind='behaviour',name='coordinated browser clock harness invariants; no replica permission claim')
    run(['sh','-c','cd dendrite && node --test canisters/dendrite/web/test/creation.test.js canisters/dendrite/web/test/creation-view.test.js canisters/dendrite/web/test/creation-rehearsal.test.js canisters/dendrite/web/test/creation-compatibility.test.js canisters/dendrite/web/test/creation-default-icp.test.js canisters/dendrite/web/test/creation-financial-attempt.test.js canisters/dendrite/web/test/sdk-heartbeat-policy.test.js'],kind='behaviour',name='creation plan account receipt and UI guardrail properties')
    completed_suites.add('creation_pure')

def creation_recording():
    run(['cargo','test','--locked','--manifest-path','dendrite/Cargo.toml','-p','dendrite-bootstrap','--lib'],kind='behaviour',name='bootstrap recording faults checkpoints and operation generations')
    run(['sh','-c','cd dendrite && node --test canisters/dendrite/web/test/creation-controller.test.js canisters/dendrite/web/test/creation-protocol.test.js canisters/dendrite/web/test/creation-team-vote.test.js'],kind='behaviour',name='browser financial recording faults and cancellation ownership')
    completed_suites.add('creation_recording')

def creation_protocol():
    run(['sh','-c','cd dendrite && node --test canisters/dendrite/web/test/creation-historical-proof.test.js'],kind='behaviour',name='genuine archived certificate verification: historical provenance, not live permissions')
    prepare_bootstrap();suite('creation_protocol')

def creation_browser():
    prepare_bootstrap();prepare()
    for case in ['real_ii_recoverable_creation_and_ledger_recovery','real_ii_production_creation_finalisation_and_subsequent_management']:
        run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact',case,'--nocapture'],kind='behaviour',name='creation signed browser:'+case)
    completed_suites.add('creation_browser')

def creation_canonical():
    if not source_is_stable():raise RuntimeError('commit unchanged source before canonical creation qualification')
    directory=ROOT/'dist/dendrite-canonical'/SOURCE_COMMIT/'canonical-a'
    release=directory/'bootstrap'
    manifest=json.loads((release/'manifest.json').read_text())
    wasm=release/'bootstrap.wasm'
    if hashlib.sha256(wasm.read_bytes()).hexdigest()!=manifest['sha256']:raise RuntimeError('canonical bootstrap digest mismatch')
    frontend=json.loads((directory/'asset-manifest.json').read_text())
    embedded=directory/'frontend'/frontend['bootstrap.wasm'].removeprefix('/')
    if embedded.read_bytes()!=wasm.read_bytes():raise RuntimeError('canonical certified bootstrap bytes differ')
    run(['python3','tools/scripts/verify_artifact.py',str(wasm),'bootstrap'],name='canonical bootstrap exact production exports')
    candid=run(['candid-extractor',str(wasm)],name='canonical bootstrap runtime Candid extraction')
    runtime=OUT/'canonical-bootstrap.did';runtime.write_text(candid)
    run([ROOT/'.cache/tools/didc','check','--strict',runtime,ROOT/'dendrite/canisters/bootstrap/bootstrap.did'],name='canonical bootstrap exact Candid compatibility')
    previous={key:os.environ.get(key) for key in ('DENDRITE_BOOTSTRAP_RELEASE_DIR','DENDRITE_BOOTSTRAP_TEST_WASM','DENDRITE_TEST_WASM')}
    try:
        os.environ.update(DENDRITE_BOOTSTRAP_RELEASE_DIR=str(release),DENDRITE_BOOTSTRAP_TEST_WASM=str(wasm),DENDRITE_TEST_WASM=str(directory/'dendrite.wasm'))
        prepare_bootstrap();provision()
        run(['cargo','test','--locked','-p','quorum-pocketic','--test','creation_protocol','--','--ignored','--exact','real_production_creation_registration_rehearsal_teardown_and_post_final_management','--nocapture'],kind='behaviour',name='canonical bootstrap real production creation')
        run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact','real_ii_production_creation_finalisation_and_subsequent_management','--nocapture'],kind='behaviour',name='canonical bootstrap full signed creation and interrupted finalisation')
    finally:
        for key,value in previous.items():
            if value is None:os.environ.pop(key,None)
            else:os.environ[key]=value
    if not source_is_stable():raise RuntimeError('source changed during canonical creation')
    (OUT/'tested-creation-manifest.json').write_text(json.dumps({'source':SOURCE_COMMIT,'source_tree_sha256':SOURCE_TREE_HASH,'bootstrap':manifest,'canonical_service_sha256':hashlib.sha256((directory/'dendrite.wasm').read_bytes()).hexdigest(),'browser_classification':'compiled local-origin UI with recorded test-only SDK transport/window lifetime for native Chrome passkeys; independent fresh genuine II delegations; exact canonical bootstrap bytes and replica checks','gates':[g for g in results if g['name'].startswith('canonical bootstrap')]},sort_keys=True,indent=2)+'\n')
    completed_suites.add('creation_canonical')

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
    public_compatibility()
    for dependency in ('governance','ledger'):
        run([didc,'check',f'candid/{dependency}.upstream.did',f'candid/{dependency}-client.did'],name=dependency+' interface compatibility')


def public_compatibility():
    old=ROOT/'tests/pocketic/fixtures/rc2-interface.did'
    new=ROOT/'candid/d_quorum.did'
    if hashlib.sha256(old.read_bytes()).hexdigest()!='6a06f8c56ed0b856f8e834be15518953d318910c238326653dc4ac391d0ccebb':
        raise RuntimeError('historical RC2 interface checksum')
    def methods(path):
        return dict(re.findall(r'^  (\w+) : (.*);$',path.read_text().split('service :',1)[1],re.M))
    def types(path):
        return dict(re.findall(r'^type (\w+) = (.*?);\n(?=type |service )',path.read_text(),re.M|re.S))
    before,after=methods(old),methods(new)
    # Signatures refer to the same named responses; input tuples/modes/methods stay exact.
    if before!=after:raise RuntimeError('public method or request signature changed')
    b,a=types(old),types(new)
    changed=sorted(k for k in set(b)|set(a) if b.get(k)!=a.get(k))
    expected=['Health','ProposalJob','ProposalPhase','RefreshState','TransferStatus']
    if changed!=expected:raise RuntimeError('unexpected public type changes: '+str(changed))
    p=subprocess.run([ROOT/'.cache/tools/didc','check',new,old],capture_output=True,text=True)
    if p.returncode==0:raise RuntimeError('expected explicit response-variant compatibility boundary absent')
    report={'unchanged_methods_requests_and_modes':sorted(before),'changed_response_types':changed,
            'old_response_decoders_require_update':True,'subtyping_diagnostic':p.stdout+p.stderr,
            'historical_interface_sha256':hashlib.sha256(old.read_bytes()).hexdigest()}
    (OUT/'interface-compatibility.json').write_text(json.dumps(report,indent=2)+'\n')
    log_name=str(ATTEMPT.relative_to(OUT)/'interface-compatibility.log')
    log=json.dumps(report,indent=2)+'\n';(OUT/log_name).write_text(log)
    results.append({'name':'public request compatibility and explicit response extension boundary','kind':'validator','exit_code':0,'evidence':'interface-compatibility.json','log':log_name,'log_sha256':hashlib.sha256(log.encode()).hexdigest()})
    save()

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
    completed_suites.add('unit')

def suite(target):
    prepare()
    if target in ('protocol','capacity','creation_protocol'):
        listing=run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--list'],name='ignored '+target+' discovery')
        names=re.findall(r'(?m)^([A-Za-z0-9_]+): test$',listing)
        if not names:raise RuntimeError('required ignored protocol suite absent')
        for name in names:
            run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--exact',name,'--nocapture','--test-threads=1'],kind='behaviour',name=target+':'+name)
    else:
        run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--nocapture','--test-threads=1'],kind='behaviour',name=target)
    if target in ('capacity','protocol'):
        # Canonical repeats use the same fixture output names. Retain both measurements.
        pattern='capacity-*.json' if target=='capacity' else 'lifecycle-real-*.json'
        for path in OUT.glob(pattern):
            shutil.copyfile(path,path.with_name('prepared-'+path.name))
    completed_suites.add({'mocked':'mock'}.get(target,target))

def production():
    prepare();run(['python3','tools/scripts/verify_artifact.py','target/wasm32-unknown-unknown/release/d_quorum.wasm'],name='actual production exports and embedded Candid')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','mocked','--','--ignored','production_timers','--nocapture'],kind='behaviour',name='production natural timers and upgrade')
    completed_suites.add('production')

def canonical_artifact():
    prepare()
    artifact=DQ_CANONICAL/'release/d_quorum.wasm'
    if not artifact.exists():raise RuntimeError('canonical candidate missing; run reproducible first')
    manifest=json.loads((DQ_CANONICAL/'release/manifest.json').read_text())
    if hashlib.sha256(artifact.read_bytes()).hexdigest()!=manifest['artifacts']['d_quorum.wasm']:raise RuntimeError('canonical artifact checksum mismatch')
    for path,digest in manifest['source_files'].items():
        if path.startswith(('canisters/','crates/','vendor/','candid/')) or path in ('Cargo.toml','Cargo.lock','rust-toolchain.toml','Dockerfile.repro'):
            if hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=digest:raise RuntimeError('canonical source changed: '+path)
    previous_wasm=os.environ.get('D_QUORUM_TEST_WASM')
    os.environ['D_QUORUM_TEST_WASM']=str(artifact)
    PREPARED_ARTIFACTS['canonical']=hashlib.sha256(artifact.read_bytes()).hexdigest()
    try:
        run(['python3','tools/scripts/verify_artifact.py',artifact],name='canonical actual exports and embedded Candid')
        for target,name in [('mocked','production_timers_ignore_private_support_and_recover_upgrade_configuration'),('protocol','production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers'),('hardening','reviewed_v1_snapshot_upgrades_to_v2_and_survives_a_second_upgrade'),('hardening','setter_during_paused_sent_intent_readback_never_retries_obsolete_revision'),('hardening','expired_a_is_confirmed_from_history_then_never_sent_b_c_get_fresh_attempts_and_fees'),('hardening','reviewed_v2_financial_snapshot_migrates_without_duplicate_payment_or_proposal'),('protocol','financially_settled_real_payments_allow_later_roster_despite_unrefreshable_stake'),('protocol','missed_entire_maturity_window_recovers_across_real_upgrade'),('protocol','lost_real_maturity_creation_reply_recovers_exact_history_and_missed_window'),('hardening','maintenance_last_attempt_lost_during_upgrade_remains_bounded_and_never_resends_payment'),('protocol','repeated_real_ledger_refusals_recover_after_durable_cooldown'),('hardening','maturity_barrier_adapter_decodes_typed_results_without_relaxing_ordinary_refresh'),('hardening','executed_maturity_typed_insufficient_funds_barrier_recovers_but_uncertain_barriers_do_not'),('protocol','missed_real_maturity_window_accepts_only_typed_post_lock_insufficient_funds_barrier'),('capacity','two_hundred_forty_recipients_fifteen_seats')]:
            run(['cargo','test','--locked','-p','quorum-pocketic','--test',target,'--','--ignored','--exact',name,'--nocapture','--test-threads=1'],kind='behaviour',name='canonical:'+name)
    finally:
        if previous_wasm is None:os.environ.pop('D_QUORUM_TEST_WASM',None)
        else:os.environ['D_QUORUM_TEST_WASM']=previous_wasm
    completed_suites.add('canonical_artifact')

def coverage():
    run(['cargo','llvm-cov','--version'])
    run(['cargo','llvm-cov','--locked','--workspace','--lib','--bins','--json','--output-path','dist/evidence/coverage.json'],kind='behaviour',name='instrumented unit/property coverage')
    data=json.loads((OUT/'coverage.json').read_text());(OUT/'coverage-totals.json').write_text(json.dumps(data['data'][0]['totals'],indent=2)+'\n')
    scopes={}
    for name,prefix in [('policy','crates/policy/'),('accounting','crates/accounting/'),('clients','crates/ic_clients/'),('transitions','canisters/d_quorum/'),('payout_lifecycle','canisters/d_quorum/src/payout.rs'),('maturity_lifecycle','canisters/d_quorum/src/proposal.rs'),('stable_migration','canisters/d_quorum/src/state.rs'),('unchanged_evaluator','vendor/dendrite/')]:
        files=[f for f in data['data'][0]['files'] if '/'+prefix in f['filename']]
        scopes[name]={'files':[f['filename'].replace(str(ROOT)+'/', '') for f in files]}
        for metric in ('lines','regions','functions'):
            count=sum(f['summary'][metric]['count'] for f in files)
            covered=sum(f['summary'][metric]['covered'] for f in files)
            scopes[name][metric]={'count':count,'covered':covered,'percent':100*covered/count if count else 0}
    scopes['scope']='Native only. Wasm timer/await/client paths are exercised in integration suites; those executions do not increase these native counters.'
    (OUT/'coverage-scopes.json').write_text(json.dumps(scopes,indent=2)+'\n')
    completed_suites.add('coverage')

def security():
    run(['cargo','audit','--version'])
    output=run(['cargo','audit','--json'],name='RustSec whole-workspace audit')
    (OUT/'security.json').write_text(output)
    run(['python3','tools/scripts/sbom.py'],name='locked dependency SBOM and production dependency isolation')
    completed_suites.add('security')

def full():
    (OUT/'acceptance-matrix.json').unlink(missing_ok=True)
    if SOURCE_DIRTY:raise RuntimeError('commit source before full acceptance and canonical builds')
    run(['cargo','fmt','--all','--','--check'])
    run(['cargo','clippy','--locked','--workspace','--all-targets','--','-D','warnings'])
    unit();suite('mocked');suite('hardening');suite('protocol');production();suite('scale');suite('capacity');coverage();security()
    if subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()!=SOURCE_COMMIT or subprocess.check_output(['git','status','--porcelain']).strip():raise RuntimeError('source changed during acceptance; rerun from one clean commit')
    run(['python3','tools/scripts/canonical.py'],name='two clean canonical builds');completed_suites.add('reproducible');canonical_artifact()
    if subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()!=SOURCE_COMMIT or subprocess.check_output(['git','status','--porcelain']).strip():raise RuntimeError('source changed during canonical qualification; rerun from one clean commit')
    for path,digest in SOURCE_FILES.items():
        if not pathlib.Path(path).is_file() or hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()!=digest:raise RuntimeError('source bytes changed during acceptance: '+path)
    # Source matrix describes coverage, not stale assertions that tests ran.
    # Execution evidence is generated only after every required suite actually succeeds.
    matrix=json.loads((ROOT/'docs/acceptance-matrix.json').read_text())
    for requirement in matrix['requirements']:
        if requirement['suite']=='acceptance':
            requirement['status']='executed'
            continue
        if requirement.get('mandatory',True) and (requirement['status']!='implemented' or requirement['suite'] not in completed_suites):raise RuntimeError('mandatory behavioural matrix still contains unqualified requirements')
        executions=[g for g in results if g['kind']=='behaviour' and (requirement['suite']!='canonical_artifact' or g['name'].startswith('canonical:'))]
        seen={name for gate in executions for name in gate.get('executed_tests',[])}
        if any(name not in seen for name in requirement.get('tests',[])):
            raise RuntimeError('mandatory behavioural case absent from execution: '+requirement['requirement'])
        requirement['status']='executed' if requirement['suite'] in completed_suites else 'unrun'
    matrix['local_gates_passed']=True
    matrix['qualified']=True
    matrix['qualification_scope']='D-QUORUM component only; excludes integrated Dendrite/browser qualification; local undeployed source, no hosted CI or mainnet compatibility assertion'
    matrix['source_commit']=SOURCE_COMMIT
    matrix['remote_ci']='awaits separately authorized push'
    (OUT/'acceptance-matrix.json').write_text(json.dumps(matrix,indent=2)+'\n')
    completed_suites.add('acceptance')

def evaluator_consistency():
    pairs=[('LICENSE','LICENSE'),('crates/dendrite-types/Cargo.toml','crates/dendrite-types/Cargo.toml'),('canisters/dendrite/web/test/fixtures/evaluator.json','canisters/dendrite/web/test/fixtures/evaluator.json')]
    pairs += [(str(p.relative_to(ROOT/'vendor/dendrite')),str(p.relative_to(ROOT/'vendor/dendrite'))) for p in (ROOT/'vendor/dendrite/crates/dendrite-types/src').glob('*.rs')]
    for vendored, imported in pairs:
        if (ROOT/'vendor/dendrite'/vendored).read_bytes() != (ROOT/'dendrite'/imported).read_bytes():raise RuntimeError('evaluator divergence: '+vendored)
    print('Evaluator sources, manifest and fixtures byte-identical',flush=True)
    completed_suites.add('evaluator_consistency')

def integration_negative_controls():
    directory=OUT/'negative-controls';directory.mkdir(exist_ok=True)
    historical='52b546f93734f51d5719a7527b7e4aa4da5e1024'
    cases=[('manager-metadata','transaction.js','const listKnownCandidates =','export function preparePrimaryFollow','export function preparePrimaryFollow','manager-metadata.test.js','replicated manager preparation uses scalar registration'),('ii-parent-scope','auth.js','export function validateGovernanceDelegation','export function createBrowserAuthSession','export async function deriveGovernanceSession','auth.test.js','genuine SDK child preserves root principal signatures scope and parent expiry')]
    cases.append(('creation-unscoped-signer','auth.js','export function validateProvisioningDelegation','export async function deriveProvisioningSession','export async function deriveProvisioningSession','auth.test.js','named provisioning children retain P and exact limited destinations without changing management login'))
    receipts=[]
    for name,module,start,old_end,new_end,test,pattern in cases:
        with tempfile.TemporaryDirectory(dir=ROOT/'.cache/tmp') as temporary:
            isolated=pathlib.Path(temporary)/'dendrite'
            paths=list((ROOT/'dendrite/canisters/dendrite/web/src').glob('*.js'))+list((ROOT/'dendrite/src/declarations').rglob('*.js'))+[ROOT/'dendrite/package.json',ROOT/'dendrite/canisters/dendrite/web/test'/test]
            for source in paths:
                destination=isolated/source.relative_to(ROOT/'dendrite');destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination)
            (isolated/'node_modules').symlink_to(ROOT/'dendrite/node_modules',target_is_directory=True)
            target=isolated/'canisters/dendrite/web/src'/module
            command=['node','--test','--test-name-pattern',pattern,str(isolated/'canisters/dendrite/web/test'/test)]
            positive=subprocess.run(command,capture_output=True,text=True)
            positive_log=positive.stdout+positive.stderr
            positive_name=name+'-positive.log';(directory/positive_name).write_text(positive_log)
            if positive.returncode!=0 or not re.search(r'(?m)^[ℹ#] pass 1$',positive_log) or pattern not in positive_log:
                raise RuntimeError('historical control positive test did not execute successfully; install locked frontend dependencies: '+name)
            current=target.read_text()
            if name=='creation-unscoped-signer':
                replacement='export function validateProvisioningDelegation(identity, profile, bootstrapCanisterId) { return Object.freeze({ principal: identity.getPrincipal(), signingIdentity: identity, profile, bootstrapCanisterId, validate() { return true; } }); }\n\n'
            else:
                old=subprocess.check_output(['git','show',historical+':dendrite/canisters/dendrite/web/src/'+module],text=True)
                replacement=old[old.index(start):old.index(old_end,old.index(start))]
            target.write_text(current[:current.index(start)]+replacement+current[current.index(new_end,current.index(start)):])
            process=subprocess.run(command,capture_output=True,text=True)
            log=process.stdout+process.stderr;(directory/(name+'.log')).write_text(log)
            named_failure=re.search(r'(?m)^(?:✖ |not ok \d+ - )'+re.escape(pattern),log)
            if process.returncode!=1 or not re.search(r'(?m)^[ℹ#] fail 1$',log) or not named_failure:raise RuntimeError('historical mutation did not fail its named regression: '+name)
            receipts.append({'name':name,'classification':'isolated helper mutation; positive prerequisite then one expected named failing test; validator, excluded from behavioural execution counts','historical_source':None if name=='creation-unscoped-signer' else historical,'historical_helper_sha256':hashlib.sha256(replacement.encode()).hexdigest(),'current_test_sha256':hashlib.sha256((ROOT/'dendrite/canisters/dendrite/web/test'/test).read_bytes()).hexdigest(),'expected_failed_test':pattern,'positive_log':positive_name,'positive_log_sha256':hashlib.sha256(positive_log.encode()).hexdigest(),'log':name+'.log','log_sha256':hashlib.sha256(log.encode()).hexdigest(),'expected_failure_observed':True})
    (directory/'receipts.json').write_text(json.dumps({'source':SOURCE_COMMIT,'controls':receipts},indent=2)+'\n')
    print('Historical authentication/metadata helpers and the isolated unscoped provisioning mutation fail their positive regressions as required.')
    completed_suites.add('integration_negative_controls')

def component_dendrite():
    evaluator_consistency();provision()
    os.environ['PATH']=str(ROOT/'.cache/tools')+os.pathsep+os.environ['PATH']
    os.environ.update(DENDRITE_CANISTER_ID="hp4av-oiaaa-aaaar-qcaha-cai",DENDRITE_DERIVATION_ORIGIN="https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io",DENDRITE_BUILD_MODE="production",DENDRITE_FETCH_ROOT_KEY="false")
    # Keep the nested workspace, lockfile, runner and generated outputs independent.
    run(['npm','--prefix','dendrite','ci','--ignore-scripts'],name='Dendrite locked frontend dependencies')
    failures=[]
    for command in ['check','test','coverage','security-scan','sbom']:
        try:run(['sh','-c','cd dendrite && cargo xtask '+command],kind='behaviour' if command in ('check','test','coverage') else 'validator',name='Dendrite preserved gate:'+command)
        except RuntimeError as error:failures.append(str(error))
    try:run(['npm','--prefix','dendrite','run','test:coverage'],kind='behaviour',name='Dendrite frontend coverage')
    except RuntimeError as error:failures.append(str(error))
    if failures:raise RuntimeError('; '.join(failures))
    completed_suites.add('component_dendrite')

def component_dendrite_canonical():
    if SOURCE_DIRTY:raise RuntimeError('commit source before component canonical builds')
    provision()
    os.environ.update(DENDRITE_CANISTER_ID="hp4av-oiaaa-aaaar-qcaha-cai",DENDRITE_DERIVATION_ORIGIN="https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io",DENDRITE_BUILD_MODE="production",DENDRITE_FETCH_ROOT_KEY="false",DENDRITE_ALTERNATIVE_ORIGINS_JSON='{"alternativeOrigins":[]}',DENDRITE_API_HOST="https://icp-api.io",DENDRITE_IDENTITY_PROVIDER="https://id.ai/authorize",SOURCE_DATE_EPOCH="0",DENDRITE_REPRO_EVIDENCE_DIR=str(ROOT/'dist/dendrite-canonical'/SOURCE_COMMIT))
    run(['sh','-c','cd dendrite && tools/scripts/verify-docker-reproducible.sh'],name='Dendrite two forced-clean canonical builds and export checks')
    directory=ROOT/'dist/dendrite-canonical'/SOURCE_COMMIT
    run(['python3','tools/scripts/verify_artifact.py',directory/'canonical-a/dendrite.wasm','dendrite'],name='canonical Dendrite complete production exports')
    version=run(['candid-extractor','--version'],name='pinned runtime Candid extraction tool').strip()
    if version!='candid-extractor 0.1.6':raise RuntimeError('runtime Candid extraction requires candid-extractor 0.1.6')
    output=run(['candid-extractor',directory/'canonical-a/dendrite.wasm'],name='actual canonical Dendrite runtime Candid extraction')
    (directory/'dendrite.did').write_text(output)
    run([ROOT/'.cache/tools/didc','check','--strict',directory/'dendrite.did',ROOT/'dendrite/canisters/dendrite/dendrite.did'],name='actual Dendrite Candid structural compatibility')
    if not source_is_stable():raise RuntimeError('source changed during Dendrite canonical builds')
    component_manifest={'source_commit':SOURCE_COMMIT,'component':'dendrite','import_source':'b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291','source_files':{path.removeprefix('dendrite/'):digest for path,digest in SOURCE_FILES.items() if path.startswith('dendrite/')},'platform':'linux/amd64','configuration':(directory/'canonical-a/build-configuration.txt').read_text(),'artifacts':{str(path.relative_to(directory/'canonical-a')):hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted((directory/'canonical-a').rglob('*')) if path.is_file()},'candid_sha256':hashlib.sha256((directory/'dendrite.did').read_bytes()).hexdigest(),'two_clean_builds_identical':True,'scope':'component source/configuration/artifact identity; qualification and deployment binding are separately required'}
    (directory/'manifest.json').write_text(json.dumps(component_manifest,sort_keys=True,indent=2)+'\n')
    # Preserve the existing production recipe and operator release directory.
    # This task produces an explicitly separate, undeployed candidate binding.
    release_relative='dist/candidates/'+SOURCE_COMMIT
    release=ROOT/'dendrite'/release_relative
    shutil.copytree(directory/'canonical-a',release)
    recipe=directory.parent/'candidate.icp.yaml'
    content=(ROOT/'dendrite/icp.yaml').read_text()
    content=re.sub(r'(?m)^(\s*path:\s*).+$',lambda m:m[1]+release_relative+'/dendrite.wasm',content,count=1)
    candidate_hash=hashlib.sha256((release/'dendrite.wasm').read_bytes()).hexdigest()
    content=re.sub(r'(?m)^(\s*sha256:\s*).+$',lambda m:m[1]+candidate_hash,content,count=1)
    recipe.write_text(content)
    previous={key:os.environ.get(key) for key in ('DENDRITE_RELEASE_DIRECTORY','DENDRITE_RECIPE_FILE')}
    try:
        os.environ.update(DENDRITE_RELEASE_DIRECTORY=release_relative,DENDRITE_RECIPE_FILE=str(recipe))
        run(['sh','-c','cd dendrite && tools/scripts/verify-release-artifacts.sh'],name='current candidate deployment binding verified locally without network writes')
    finally:
        for key,value in previous.items():
            if value is None:os.environ.pop(key,None)
            else:os.environ[key]=value
    component_manifest.update(candidate_directory=str(release.relative_to(ROOT)),candidate_recipe_sha256=hashlib.sha256(recipe.read_bytes()).hexdigest(),deployed=False)
    (directory/'manifest.json').write_text(json.dumps(component_manifest,sort_keys=True,indent=2)+'\n')
    completed_suites.add('component_dendrite_canonical')

def system_protocol():
    evaluator_consistency();prepare()
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','protocol','--','--ignored','--exact','connected_dendrite_and_automation_use_one_real_governance_and_ledger','--nocapture','--test-threads=1'],kind='behaviour',name='shared real protocol applications')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','protocol','--','--ignored','--exact','connected_real_maturity_rewards_and_later_harvest','--nocapture','--test-threads=1'],kind='behaviour',name='shared real economic lifecycle')
    completed_suites.add('system_protocol')

def system_protocol_canonical():
    if SOURCE_DIRTY:raise RuntimeError('commit source before canonical pair qualification')
    manifest=json.loads((DQ_CANONICAL/'release/manifest.json').read_text())
    if manifest['source_commit']!=SOURCE_COMMIT:raise RuntimeError('canonical D-QUORUM source mismatch')
    dq=DQ_CANONICAL/'release/d_quorum.wasm'
    if hashlib.sha256(dq.read_bytes()).hexdigest()!=manifest['artifacts']['d_quorum.wasm']:raise RuntimeError('canonical D-QUORUM hash mismatch')
    directory=ROOT/'dist/dendrite-canonical'/SOURCE_COMMIT/'canonical-a'
    for line in (directory/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1)
        if hashlib.sha256((directory/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('canonical Dendrite checksum mismatch: '+name)
    previous={key:os.environ.get(key) for key in ('D_QUORUM_TEST_WASM','DENDRITE_TEST_WASM')}
    for name in ('connected-applications.json','connected-economic-lifecycle.json'):
        path=OUT/name
        if path.exists():shutil.copyfile(path,OUT/('prepared-'+name))
    os.environ['D_QUORUM_TEST_WASM']=str(dq);os.environ['DENDRITE_TEST_WASM']=str(directory/'dendrite.wasm')
    try:system_protocol()
    finally:
        for key,value in previous.items():
            if value is None:os.environ.pop(key,None)
            else:os.environ[key]=value
    pair={'root_source':SOURCE_COMMIT,'dendrite_import_source':'b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291','dquorum_manifest':str((DQ_CANONICAL/'release/manifest.json').relative_to(ROOT)),'dendrite_release':'dist/dendrite-canonical/'+SOURCE_COMMIT+'/canonical-a','dquorum_wasm_sha256':hashlib.sha256(dq.read_bytes()).hexdigest(),'dendrite_wasm_sha256':hashlib.sha256((directory/'dendrite.wasm').read_bytes()).hexdigest(),'dquorum_candid_sha256':hashlib.sha256((ROOT/'candid/d_quorum.did').read_bytes()).hexdigest(),'dendrite_candid_sha256':hashlib.sha256((directory.parent/'dendrite.did').read_bytes()).hexdigest(),'protocol_pins_sha256':hashlib.sha256((ROOT/'protocol-pins.json').read_bytes()).hexdigest(),'evaluator':'nns-dendrite/1.1-draft; unchanged vendored source','tested_pair':'two canonical shared real-protocol cases; signed-browser evidence is a separate mandatory lane on this same source','qualification_scope':'canonical backend pair; complete qualification requires integrated-acceptance.json','browser_configuration':'dist/evidence/browser-system/team-management/local-build.json'}
    browser_directory=OUT/'browser-system/team-management'
    local=json.loads((browser_directory/'local-build.json').read_text())
    if local['root_source']!=SOURCE_COMMIT or local['source_dirty']:raise RuntimeError('local-browser artifact source differs from canonical pair')
    if hashlib.sha256((browser_directory/'dendrite-local.wasm').read_bytes()).hexdigest()!=local['wasm_sha256']:raise RuntimeError('local-browser retained artifact checksum mismatch')
    pair.update(dendrite_manifest='dist/dendrite-canonical/'+SOURCE_COMMIT+'/manifest.json',dendrite_manifest_sha256=hashlib.sha256((directory.parent/'manifest.json').read_bytes()).hexdigest(),source_tree_sha256=SOURCE_TREE_HASH,dendrite_tree=subprocess.check_output(['git','rev-parse','HEAD:dendrite'],text=True).strip(),protocol_pins=json.loads((ROOT/'protocol-pins.json').read_text()),local_browser=local,local_browser_artifact='dist/evidence/browser-system/team-management/dendrite-local.wasm',scenario_source_sha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'tests/pocketic/tests/browser_system.rs',ROOT/'tests/pocketic/tests/protocol.rs',ROOT/'tests/browser/team-management.mjs']})
    (ROOT/'dist/integration-manifest.json').write_text(json.dumps(pair,indent=2)+'\n')
    run(['python3','-c',"import json,hashlib,pathlib; p=pathlib.Path('dist/integration-manifest.json'); d=json.loads(p.read_text()); assert hashlib.sha256(pathlib.Path(d['local_browser_artifact']).read_bytes()).hexdigest()==d['local_browser']['wasm_sha256']; print(p.read_text())"],name='canonical pair and local-browser artifact source binding')
    completed_suites.add('system_protocol_canonical')

def reproducible():
    run(['python3','tools/scripts/canonical.py'],name='two clean canonical builds')
    completed_suites.add('reproducible')

def integration_inventory():
    run(["python3","tests/system/test_qualification.py"],kind="behaviour",name="integrated acceptance verdict regressions")
    inventory={'classification':'discovery only; no execution claims','component_gates':{'dquorum':list(COMMANDS),'dendrite':['check','test','coverage','build','build-reproducible','verify-reproducible','security-scan','sbom','npm test','npm run test:coverage','tools/scripts/check-interface-drift.sh','tools/scripts/verify-docker-reproducible.sh','tools/scripts/browser-smoke.sh']},'workspaces':{}}
    for component,directory in [('dquorum',ROOT),('dendrite',ROOT/'dendrite')]:
        meta=json.loads(subprocess.check_output(['cargo','metadata','--locked','--no-deps','--format-version','1'],cwd=directory))
        inventory['workspaces'][component]=[{'package':p['name'],'targets':p['targets']} for p in meta['packages'] if p['id'] in meta['workspace_members']]
        def discover(ignored):
            command=['cargo','test','--locked','--manifest-path',str(directory/'Cargo.toml'),'--workspace','--all-targets','--']+(['--ignored'] if ignored else [])+['--list']
            listing=run(command,name=component+(' ignored' if ignored else '')+' actual test-case discovery',show=False)
            target='';cases=[]
            for line in listing.splitlines():
                header=re.search(r'Running (.+)',line)
                if header:target=header[1].strip()
                case=re.fullmatch(r'(.+): test',line)
                if case:cases.append({'target':target,'name':case[1]})
            if not cases and not ignored:raise RuntimeError('no discovered native cases: '+component)
            return cases
        cases=discover(False);ignored=discover(True)
        # Some components intentionally contain no ignored cases; discovery is
        # a validator, never counted as a behavioural execution.
        ignored_keys={(case['target'],case['name']) for case in ignored}
        inventory.setdefault('native_cases',{})[component]=[dict(case,intentionally_ignored=(case['target'],case['name']) in ignored_keys) for case in cases]
    inventory['frontend_test_targets']=[str(p.relative_to(ROOT)) for p in (ROOT/'dendrite/canisters/dendrite/web/test').glob('*.test.js')]
    (OUT/'integration-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
    run(['python3','tools/scripts/xtask.py','evaluator_consistency'],name='imported evaluator exact consistency')
    completed_suites.add('evaluator_consistency')
    run(['python3','tools/scripts/xtask.py','integration_negative_controls'],name='historical authentication and metadata negative controls')
    completed_suites.add('integration_negative_controls')
    completed_suites.add('integration_inventory')

def system_browser():
    prepare_bootstrap();prepare()
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_capability','--','--ignored','--exact','actual_ii_page_and_virtual_webauthn_capability','--nocapture'],kind='behaviour',name='actual II browser capability')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact','real_ii_scoped_child_is_enforced_by_replica','--nocapture'],kind='behaviour',name='actual II child delegation replica scope enforcement')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact','real_ii_closed_popup_does_not_publish_session','--nocapture'],kind='behaviour',name='actual II popup cancellation and bootstrap cleanup')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact','real_browser_wrong_provider_never_publishes_a_transaction_session','--nocapture'],kind='behaviour',name='actual local provider misconfiguration fails closed')
    completed_suites.add('system_browser_safety')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact','real_ii_compiled_frontend_known_managers_and_signed_governance','--nocapture'],kind='behaviour',name='actual II and signed real Governance team management')
    run(['cargo','test','--locked','-p','quorum-pocketic','--test','browser_system','--','--ignored','--exact','real_local_anonymous_browser_preserves_responsive_and_certificate_checks','--nocapture'],kind='behaviour',name='preserved responsive anonymous browser against local real protocol')
    completed_suites.add('system_browser')

def source_is_stable():
    if SOURCE_DIRTY or subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()!=SOURCE_COMMIT or subprocess.check_output(['git','status','--porcelain']).strip():return False
    current=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
    observed={f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest() for f in current if f and pathlib.Path(f).is_file()}
    return observed==SOURCE_FILES

def integrated_verdict(requirements,gates,completed,stable,evidence_directory):
    failures=[]
    if not stable:failures.append('source commit/tree changed or was dirty')
    verified=[]
    for gate in gates:
        path=pathlib.Path(evidence_directory)/gate.get('log','')
        if gate.get('exit_code')!=0 or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=gate.get('log_sha256'):
            failures.append('failed or missing gate evidence: '+gate.get('name','unnamed'))
        else:verified.append(gate)
    tests={test for gate in verified if gate.get('kind')=='behaviour' and gate.get('passed',0)>0 for test in gate.get('executed_tests',[])}
    validators={gate['name'] for gate in verified if gate.get('kind')=='validator'}
    positive='real_ii_compiled_frontend_known_managers_and_signed_governance'
    if positive not in tests:failures.append('positive actual-II signed browser management evidence absent')
    executed=[]
    for requirement in requirements:
        row=dict(requirement)
        named=bool(row.get('tests') or row.get('validators'))
        passed=(row.get('status')=='implemented' and row['suite'] in completed and named
                and set(row.get('tests',[]))<=tests and set(row.get('validators',[]))<=validators)
        row['execution']='passed' if passed else 'unqualified'
        row['evidence']=[{'log':g['log'],'sha256':g['log_sha256'],'tests':sorted(set(row.get('tests',[])) & set(g.get('executed_tests',[])))} for g in verified if set(row.get('tests',[])) & set(g.get('executed_tests',[])) or g['name'] in row.get('validators',[])]
        if row.get('mandatory',True) and not passed:failures.append('unqualified requirement: '+row['id'])
        executed.append(row)
    return {'qualified':not failures,'status':'complete' if not failures else 'incomplete','requirements':executed,'evidence_failures':failures}

def integrated_acceptance():
    report={'qualified':False,'source':SOURCE_COMMIT,'source_tree_sha256':SOURCE_TREE_HASH,'source_dirty':SOURCE_DIRTY,'status':'running','failures':[]}
    report_path=OUT/'integrated-acceptance.json'
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    for name,gate in [('integration_inventory',integration_inventory),('acceptance',full),('component_dendrite',component_dendrite),('system_protocol',system_protocol),('system_browser',system_browser),('creation_pure',creation_pure),('creation_recording',creation_recording),('creation_protocol',creation_protocol),('creation_browser',creation_browser),('component_dendrite_canonical',component_dendrite_canonical),('system_protocol_canonical',system_protocol_canonical),('creation_canonical',creation_canonical)]:
        print('Integrated lane: '+name,flush=True)
        try:
            if not source_is_stable():raise RuntimeError('source changed before '+name)
            gate()
            if not source_is_stable():raise RuntimeError('source changed after '+name)
            if name=='acceptance':
                save()
                shutil.copyfile(OUT/(sys.argv[1]+'-run.json'),OUT/'dquorum-component-acceptance-run.json')
        except (RuntimeError,FileNotFoundError,subprocess.CalledProcessError) as error:report['failures'].append({'suite':name,'error':str(error)})
        finally:stop_fixture_server()
        report_path.write_text(json.dumps(report,indent=2)+'\n')
    matrix=json.loads((ROOT/'docs/integration-matrix.json').read_text())
    report.update(integrated_verdict(matrix['requirements'],results,completed_suites,source_is_stable(),OUT))
    if report['failures']:report.update(qualified=False,status='incomplete')
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    if not report['qualified']:raise RuntimeError('Integrated qualification incomplete; inspect integrated-acceptance.json')

def integrated_readiness():
    # Aggregate existing lane receipts. Never rerun or substitute a weaker suite.
    directory=pathlib.Path(os.environ.get('D_QUORUM_CI_EVIDENCE_DIR',str(ROOT/'dist/ci-evidence'))).resolve()
    required=['unit','mock','hardening','protocol','production','scale','capacity','coverage','security','integration_inventory','component_dendrite','system_protocol','system_browser','component_dendrite_canonical','reproducible','canonical_artifact','system_protocol_canonical']
    required+=['creation_pure','creation_recording','creation_protocol','creation_browser','creation_canonical']
    gates=[];completed=set();failures=[]
    for lane in required:
        matches=list(directory.rglob(lane+'-run.json'))
        if len(matches)!=1:failures.append('missing or duplicate receipt: '+lane);continue
        receipt_path=matches[0];receipt=json.loads(receipt_path.read_text())
        if receipt.get('source')!=SOURCE_COMMIT or receipt.get('source_tree_sha256')!=SOURCE_TREE_HASH or receipt.get('source_dirty') or receipt.get('status')!='complete':failures.append('unqualified source/status receipt: '+lane);continue
        for original in receipt['gates']:
            gate=dict(original);log=(receipt_path.parent/gate['log']).resolve()
            if not log.is_relative_to(directory.resolve()):failures.append('unsafe evidence path');continue
            gate['log']=str(log);gates.append(gate)
        completed.update(receipt.get('completed_suites',[]))
    if not failures:completed.add('acceptance')
    matrix=json.loads((ROOT/'docs/integration-matrix.json').read_text())
    verdict=integrated_verdict(matrix['requirements'],gates,completed,source_is_stable() and not failures,ROOT)
    # Preserve the component requirement list too; no behavioural case disappears
    # merely because its runner invocation came from a separate hosted job.
    seen={test for gate in gates if gate.get('exit_code')==0 for test in gate.get('executed_tests',[])}
    for requirement in json.loads((ROOT/'docs/acceptance-matrix.json').read_text())['requirements']:
        if requirement.get('mandatory',True) and not set(requirement.get('tests',[]))<=seen:failures.append('missing D-QUORUM behavioural evidence: '+requirement['requirement'])
    if failures:verdict.update(qualified=False,status='incomplete')
    verdict.update(source=SOURCE_COMMIT,failures=failures,remote_ci='receipt aggregation; hosted execution exists only when this workflow actually runs')
    (OUT/'integrated-readiness.json').write_text(json.dumps(verdict,indent=2)+'\n')
    if not verdict['qualified']:raise RuntimeError('Required hosted evidence is incomplete; inspect integrated-readiness.json')

COMMANDS={'creation_canonical':creation_canonical,'creation_browser':creation_browser,'creation_pure':creation_pure,'creation_recording':creation_recording,'creation_protocol':creation_protocol,'integration_negative_controls':integration_negative_controls,'integrated_readiness':integrated_readiness,'system_protocol_canonical':system_protocol_canonical,'component_dendrite_canonical':component_dendrite_canonical,'integration_inventory':integration_inventory,'integrated_acceptance':integrated_acceptance,'system_browser':system_browser,'evaluator_consistency':evaluator_consistency,'component_dendrite':component_dendrite,'system_protocol':system_protocol,'unit':unit,'mock':lambda:suite('mocked'),'hardening':lambda:suite('hardening'),'capacity':lambda:suite('capacity'),'protocol':lambda:suite('protocol'),'production':production,'canonical_artifact':canonical_artifact,'scale':lambda:suite('scale'),'coverage':coverage,'security':security,'acceptance':full,'reproducible':reproducible,'prepare':prepare}
def main():
    global RUN_STATUS
    try:
        cmd=sys.argv[1] if len(sys.argv)>1 else 'help'
        if cmd not in COMMANDS:raise RuntimeError('commands: '+', '.join(COMMANDS))
        COMMANDS[cmd]()
        RUN_STATUS='complete';save()
    except (RuntimeError,FileNotFoundError,subprocess.CalledProcessError) as error:
        RUN_STATUS='failed';print(str(error),file=sys.stderr);save();return 1
    return 0

if __name__=='__main__':sys.exit(main())
