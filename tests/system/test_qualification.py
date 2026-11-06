"""Small pure verdict regressions; no test subprocess or canister substitution."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import re
import unittest
from unittest import mock
import io
import os
import subprocess
spec=importlib.util.spec_from_file_location('existing_xtask',Path(__file__).resolve().parents[2]/'tools/scripts/xtask.py')
xtask=importlib.util.module_from_spec(spec);spec.loader.exec_module(xtask)
POSITIVE='real_ii_compiled_frontend_known_managers_and_signed_governance'
class QualificationVerdict(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory(dir=xtask.ROOT/'.cache/tmp')
        self.addCleanup(self.directory.cleanup)
        log=Path(self.directory.name)/'executed.log';log.write_text('actual test receipt fixture\n')
        self.gates=[{'name':'browser','kind':'behaviour','exit_code':0,'passed':1,'executed_tests':[POSITIVE],'log':log.name,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}]
        self.requirements=[{'id':'browser','status':'implemented','suite':'system_browser','mandatory':True,'tests':[POSITIVE]}]
    def verdict(self,stable=True):return xtask.integrated_verdict(self.requirements,self.gates,{'system_browser'},stable,self.directory.name)
    def test_all_required_evidence_passes(self):
        result=self.verdict();self.assertTrue(result['qualified']);self.assertEqual(result['status'],'complete');self.assertTrue(result['requirements'][0]['evidence'])
    def test_one_required_failure(self):
        self.gates[0]['exit_code']=1;self.assertFalse(self.verdict()['qualified'])
    def test_missing_evidence(self):
        Path(self.directory.name,'executed.log').unlink();self.assertFalse(self.verdict()['qualified'])
    def test_changed_source(self):self.assertFalse(self.verdict(False)['qualified'])
    def test_absent_positive_browser(self):
        self.gates[0]['executed_tests']=['safety refusal'];self.assertFalse(self.verdict()['qualified'])
    def test_editing_matrix_alone_is_insufficient(self):
        self.requirements[0]['tests']=[];self.assertFalse(self.verdict()['qualified'])
class WorkflowDependencies(unittest.TestCase):
    def test_inventory_job_provisions_history_and_locked_frontend_dependencies(self):
        text=(xtask.ROOT/'.github/workflows/qualification.yml').read_text()
        body=re.search(r'(?ms)^  shared-system-protocol:\n(.*?)(?=^  [a-z][a-z-]+:\n|\Z)',text)[1]
        inventory=body.index('cargo run --locked -p xtask -- integration_inventory')
        setup=body[:inventory]
        self.assertRegex(setup,r'(?m)^          fetch-depth: 0$')
        self.assertIn('uses: actions/setup-node@',setup)
        self.assertIn('node-version: 24.15.0',setup)
        self.assertIn('npm install --global npm@11.12.1 --ignore-scripts',setup)
        self.assertIn('npm --prefix dendrite ci --ignore-scripts',setup)
        self.assertIn('persist-credentials: false',setup)
    def test_required_workflow_dependencies_are_acyclic(self):
        text=(xtask.ROOT/'.github/workflows/qualification.yml').read_text().split('jobs:',1)[1]
        jobs={}
        matches=list(re.finditer(r'(?m)^  ([a-z][a-z-]+):\n',text))
        for index,match in enumerate(matches):
            body=text[match.end():matches[index+1].start() if index+1<len(matches) else len(text)]
            needs=re.search(r'(?m)^    needs: \[(.*?)\]',body)
            jobs[match[1]]=[name.strip() for name in needs[1].split(',')] if needs else []
        self.assertTrue({'canonical','integrated-readiness','signed-browser-ii'}<=set(jobs))
        def visit(name,stack):
            self.assertIn(name,jobs);self.assertNotIn(name,stack)
            for dependency in jobs[name]:visit(dependency,stack+[name])
        for name in jobs:visit(name,[])
class HistoricalControlPrerequisites(unittest.TestCase):
    def test_missing_sdk_is_not_a_successful_historical_negative_control(self):
        failure=subprocess.CompletedProcess([],1,'Error [ERR_MODULE_NOT_FOUND]: Cannot find package @icp-sdk/core\n# fail 1\n','')
        original=xtask.subprocess.run
        def run(command,*args,**kwargs):
            if command[0]=='node':return failure
            return original(command,*args,**kwargs)
        with tempfile.TemporaryDirectory(dir=xtask.ROOT/'.cache/tmp') as directory:
            with mock.patch.object(xtask,'OUT',Path(directory)),mock.patch.object(xtask.subprocess,'run',side_effect=run):
                with self.assertRaises(RuntimeError):xtask.integration_negative_controls()
    def test_module_error_cannot_replace_the_named_mutation_failure(self):
        name='replicated manager preparation uses scalar registration'
        positive=subprocess.CompletedProcess([],0,'✔ '+name+' (1ms)\nℹ pass 1\nℹ fail 0\n','')
        unrelated=subprocess.CompletedProcess([],1,'Error [ERR_MODULE_NOT_FOUND]\n# fail 1\n','')
        source=(xtask.ROOT/'dendrite/canisters/dendrite/web/src/transaction.js').read_text()
        with tempfile.TemporaryDirectory(dir=xtask.ROOT/'.cache/tmp') as directory:
            with mock.patch.object(xtask,'OUT',Path(directory)),mock.patch.object(xtask.subprocess,'check_output',return_value=source),mock.patch.object(xtask.subprocess,'run',side_effect=[positive,unrelated]) as run:
                with self.assertRaisesRegex(RuntimeError,'named regression'):xtask.integration_negative_controls()
                self.assertEqual(run.call_count,2)
class BrowserSetupRecovery(unittest.TestCase):
    def exercise(self,failures,channel=True):
        # Execute the production test driver's function, not a second retry model.
        # Only setup outcomes and browser-context disposal are scripted here.
        source=(xtask.ROOT/'tests/browser/team-management.mjs').read_text()
        start=source.index('async function authenticate(index){')
        end=source.index('async function authenticateAttempt(index){',start)
        function=source[start:end]
        script="""
const applicationPages=[],authenticationRetries=[],receipts=[];
const directory='unused';let calls=0,closed=0;
const console={error(){}};
const writeEvidence=async(path,bytes)=>receipts.push(JSON.parse(bytes));
async function authenticateAttempt(index){
 calls++;applicationPages.push({browserContext:()=>({async close(){closed++;}})});
 if(calls<=FAILURES){
  const error=Error('scripted setup failure');
  if(CHANNEL)error.iiChannelFailure='Unable to connect';
  throw error;
 }
 return {index,setupSucceeded:true};
}
FUNCTION
let result,error;
try{result=await authenticate(7);}catch(caught){error=caught.message;}
process.stdout.write(JSON.stringify({calls,closed,retries:authenticationRetries.length,receipts:receipts.length,result,error}));
""".replace('FAILURES',str(failures)).replace('CHANNEL','true' if channel else 'false').replace('FUNCTION',function)
        completed=subprocess.run(['node','--input-type=module'],input=script,text=True,capture_output=True)
        self.assertEqual(completed.returncode,0,completed.stderr)
        import json
        return json.loads(completed.stdout)
    def test_known_channel_failure_restarts_in_a_fresh_context(self):
        result=self.exercise(1)
        self.assertEqual((result['calls'],result['closed'],result['retries'],result['receipts']),(2,1,1,1))
        self.assertTrue(result['result']['setupSucceeded'])
    def test_repeated_setup_failure_stops_after_two_attempts(self):
        result=self.exercise(100)
        self.assertEqual((result['calls'],result['closed'],result['retries']),(2,1,1))
        self.assertNotIn('result',result);self.assertIn('error',result)
    def test_other_failure_never_gets_a_new_attempt(self):
        result=self.exercise(1,channel=False)
        self.assertEqual((result['calls'],result['closed'],result['retries']),(1,0,0))
        self.assertNotIn('result',result);self.assertIn('error',result)
    def test_healthy_setup_does_not_restart(self):
        result=self.exercise(0)
        self.assertEqual((result['calls'],result['closed'],result['retries']),(1,0,0))
        self.assertTrue(result['result']['setupSucceeded'])

class FixtureServerOwnership(unittest.TestCase):
    def test_dead_server_is_not_restarted_within_a_lane(self):
        server=mock.Mock();server.poll.return_value=-9
        with mock.patch.object(xtask,'FIXTURE_SERVER',server),mock.patch.object(xtask.subprocess,'Popen') as start:
            with self.assertRaisesRegex(RuntimeError,'exit status -9'):xtask.fixture_server()
            start.assert_not_called()
    def test_lane_cleanup_releases_only_owned_handles_and_is_idempotent(self):
        with tempfile.TemporaryDirectory(dir=xtask.ROOT/'.cache/tmp') as directory:
            port=Path(directory)/'owned.port';port.write_text('1234\n')
            other=Path(directory)/'unrelated.port';other.write_text('5678\n')
            log=io.StringIO();server=mock.Mock();server.poll.return_value=None;server.returncode=-15
            with mock.patch.object(xtask,'FIXTURE_SERVER',server),mock.patch.object(xtask,'FIXTURE_LOG',log),mock.patch.object(xtask,'FIXTURE_PORT',port),mock.patch.dict(os.environ,{'D_QUORUM_POCKET_IC_URL':'http://127.0.0.1:1234/'}),mock.patch('builtins.print'):
                xtask.stop_fixture_server();xtask.stop_fixture_server()
                server.terminate.assert_called_once();server.wait.assert_called_once_with(timeout=10);server.kill.assert_not_called()
                self.assertIsNone(xtask.FIXTURE_SERVER);self.assertIsNone(xtask.FIXTURE_LOG);self.assertIsNone(xtask.FIXTURE_PORT)
                self.assertTrue(log.closed);self.assertFalse(port.exists());self.assertTrue(other.exists())
                self.assertNotIn('D_QUORUM_POCKET_IC_URL',os.environ)

if __name__=='__main__':unittest.main(verbosity=2)
