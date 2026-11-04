#!/usr/bin/env python3
"""Review the two inactive optional native-build findings; retain the full scan.

This is a narrow validator, not a vulnerability severity downgrade. Unknown
advisories, changed dependency paths, and a failed negative control are fatal.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess

out = Path('dist/security')
out.mkdir(parents=True, exist_ok=True)
def command(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    return result

audit = command(['npm', 'audit', '--json'])
(out/'npm-full-audit.json').write_text(audit.stdout)
if audit.returncode not in (0, 1):
    raise SystemExit('npm audit infrastructure failed')
data = json.loads(audit.stdout)
reviewed = {'GHSA-3g3m-2fjr-6pw4', 'GHSA-g3hv-75wg-m249'}
actual = set()
inventory = []
for package, finding in data.get('vulnerabilities', {}).items():
    inventory.append({'package':package,'severity':finding['severity'],'affected_nodes':finding['nodes'],'via':finding['via'],'range':finding['range'],'fix_available':finding['fixAvailable'],'exposure':'development SBOM tooling; optional XML native-build chain; installation scripts disabled; guarded JSON execution required'})
    for advisory in finding['via']:
        if isinstance(advisory, dict):
            actual.add(advisory['url'].rsplit('/', 1)[-1])
if not actual <= reviewed:
    raise SystemExit('unreviewed npm advisory: '+str(sorted(actual-reviewed)))

(out/'npm-advisory-inventory.json').write_text(json.dumps({'classification':'raw full-development findings retained; production-only audit is separate','affected_package_chains':len(inventory),'unique_advisories':sorted(actual),'findings':inventory},indent=2)+'\n')

tree = command(['npm', 'ls', '--json', '--all'])
if tree.returncode:
    raise SystemExit('complete npm dependency tree unavailable')
(out/'npm-dependency-paths.json').write_text(tree.stdout)
paths = []
def walk(node, ancestors=()):
    for name, child in node.get('dependencies', {}).items():
        path = (*ancestors, name)
        if name in ('glob', 'minimatch'):
            if not (path[0] == '@cyclonedx/cyclonedx-npm' and 'libxmljs2' in path and 'node-gyp' in path):
                raise SystemExit('vulnerable package escaped optional native-build chain: '+str(path))
            if child['version'] != {'glob': '10.5.0', 'minimatch': '9.0.9'}[name]:
                raise SystemExit('reviewed dependency version changed; reassess applicability')
            paths.append({'path': list(path), 'version': child['version']})
        walk(child, path)
walk(json.loads(tree.stdout))
if len(paths) != 2:
    raise SystemExit('reviewed dependency graph changed; reassess applicability')

# The JSON serializer/validator must work with these exact packages made unusable.
# This also covers child npm processes. Installation is separately --ignore-scripts.
base = str(Path('node_modules').resolve())+'/'
guard = out/'optional-build-module-guard.cjs'
guard.write_text('const M=require("node:module"),load=M._load;M._load=function(s,p,m){const f=M._resolveFilename(s,p,m);if('+json.dumps(['glob','minimatch'])+'.some(n=>typeof f==="string"&&f.startsWith('+json.dumps(base)+'+n+"/")))throw Error("reviewed optional build module executed");return load.apply(this,arguments);};\n')
environment = dict(os.environ, NODE_OPTIONS='--require='+str(guard.resolve()))
probe = command(['node', '-e', 'require("glob")'], env=environment)
if not probe.returncode or 'reviewed optional build module executed' not in probe.stderr:
    raise SystemExit('module-load negative control did not detect the vulnerable dependency')
sbom = out/'npm-guarded.cdx.json'
generated = command(['npm','exec','--offline','--ignore-scripts','--','cyclonedx-npm','--omit','dev','--output-format','JSON','--output-file',str(sbom)],env=environment)
(out/'guarded-sbom.log').write_text(generated.stdout+generated.stderr)
if generated.returncode or not json.loads(sbom.read_text()).get('components'):
    raise SystemExit('JSON SBOM generation touched an excluded package or failed')
(out/'tooling-applicability.json').write_text(json.dumps({'raw_scan_retained':True,'reviewed_advisories':sorted(actual),'paths':paths,'json_sbom_module_guard_passed':True,'positive_guard_control_rejected':True,'sbom_sha256':hashlib.sha256(sbom.read_bytes()).hexdigest(),'restriction':'npm installation/exec ignore scripts; JSON SBOM only; no optional XML native build'},indent=2)+'\n')
print('Full npm audit reviewed: only two verified inactive optional native-build findings; raw vulnerabilities retained.')
