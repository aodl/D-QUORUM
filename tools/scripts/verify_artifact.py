#!/usr/bin/env python3
"""Parse the actual Wasm, checking its complete application export set and DID bytes."""
import pathlib,sys,hashlib,json
path=pathlib.Path(sys.argv[1]);b=path.read_bytes();assert b[:8]==b'\0asm\x01\0\0\0'
def leb(i):
    x=0;s=0
    while True:
        v=b[i];i+=1;x|=(v&127)<<s
        if v<128:return x,i
        s+=7;assert s<=35

def string(i):
    n,i=leb(i);return b[i:i+n].decode(),i+n
exports=[];custom={};i=8
while i<len(b):
    section=b[i];n,j=leb(i+1);end=j+n;assert end<=len(b)
    if section==0:
        name,k=string(j);custom[name]=b[k:end]
    if section==7:
        count,k=leb(j)
        for _ in range(count):
            name,k=string(k);kind=b[k];_,k=leb(k+1);exports.append(name)
    i=end
component=sys.argv[2] if len(sys.argv)>2 else 'dquorum'
if component=='dendrite':
    expected={'canister_query http_request','canister_update check_neuron'}
    allowed=expected|{'memory','get_candid_pointer','canister_init','canister_post_upgrade','__data_end','__heap_base'}
    assert set(exports)==allowed,(set(exports)-allowed,allowed-set(exports))
    assert not any(any(word in x.lower() for word in ('debug','admin','test','probe')) for x in exports),exports
    print(json.dumps({'component':'dendrite','wasm_sha256':hashlib.sha256(b).hexdigest(),'wasm_bytes':len(b),'exports':exports,'candid_section':'absent; require runtime extraction and native structural interface check separately'},indent=2))
    sys.exit(0)
assert component=='dquorum','unknown component'
methods={'set_delegates_per_topic':'update','configuration':'query','scan_progress':'query','candidate_page':'query','score_page':'query','roster_page':'query','exclusion_page':'query','proposal_progress':'query','payout_page':'query','transfer_page':'query','health':'query'}
actual={x for x in exports if x.startswith(('canister_query ','canister_update '))}
expected={f'canister_{mode} {name}' for name,mode in methods.items()} | {'canister_update <ic-cdk internal> timer_executor'}
assert actual==expected,(actual-expected,expected-actual)
allowed=expected|{"memory","get_candid_pointer","canister_init","canister_post_upgrade","canister_global_timer","__data_end","__heap_base"}
assert set(exports)==allowed,(set(exports)-allowed,allowed-set(exports))
assert not any(any(word in x.lower() for word in ('debug','admin','test','probe')) for x in exports),exports
assert 'canister_init' in exports and 'canister_post_upgrade' in exports and 'canister_global_timer' in exports
assert custom.get('icp:public candid:service')==pathlib.Path('candid/d_quorum.did').read_bytes(),'embedded Candid differs'
print(json.dumps({'wasm_sha256':hashlib.sha256(b).hexdigest(),'wasm_bytes':len(b),'exports':exports,'candid_sha256':hashlib.sha256(custom['icp:public candid:service']).hexdigest()},indent=2))
