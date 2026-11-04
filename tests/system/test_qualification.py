"""Small pure verdict regressions; no test subprocess or canister substitution."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import re
import unittest
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
if __name__=='__main__':unittest.main(verbosity=2)
