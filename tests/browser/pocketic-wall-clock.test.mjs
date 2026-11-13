import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('owned PocketIC clock follows explicit real-time jumps while monotonic timers stay real',()=>{
 const directory=mkdtempSync(`${root}.cache/tmp/clock-unit-`),library=`${directory}/clock.so`,offset=`${directory}/offset`;
 try{
  execFileSync('cc',['-shared','-fPIC','-O2','-Wall','-Wextra','-Werror',`${root}tests/browser/pocketic-wall-clock.c`,'-o',library]);
  writeFileSync(offset,'0\n');
  const result=JSON.parse(execFileSync('python3',['-c',`import time,json,os
before=time.time_ns(); mono=time.monotonic_ns()
with open(os.environ['DENDRITE_TEST_CLOCK_FILE'],'w') as f: f.write('172800000000000\\n')
time.sleep(.02)
print(json.dumps({'jump':time.time_ns()-before,'monotonic':time.monotonic_ns()-mono,'clock':time.clock_gettime_ns(time.CLOCK_REALTIME)-time.time_ns()}))`],{env:{...process.env,LD_PRELOAD:library,DENDRITE_TEST_CLOCK_FILE:offset},encoding:'utf8'}));
  assert.ok(result.jump>=172800000000000&&result.jump<172810000000000);
  assert.ok(result.monotonic>=10000000&&result.monotonic<10000000000);
  assert.ok(Math.abs(result.clock)<10000000);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
