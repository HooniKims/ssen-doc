'use strict';
// CPU inference must be serialized. UI mocks are not real quality evaluations.
const {spawn}=require('node:child_process');
const jobs=[
 ['--fixture=tests/fixtures/quality95-fresh-b.cjs','--tag=fresh-b2'],
 ['--fixture=tests/fixtures/quality95-fresh-c.cjs','--tag=fresh-c2'],
 ['--fixture=tests/fixtures/quality95-fresh-a.cjs','--tag=fresh-a4'],
 ['--tag=round4']
];
const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6);
if(run&&!/^[a-z0-9][a-z0-9-]{0,60}$/i.test(run))throw Error('--run must be an ASCII letter/number/hyphen label.');
if(run)for(const job of jobs){
 const index=job.findIndex(a=>a.startsWith('--tag='));
 job[index]='--tag='+run+'-'+job[index].slice(6);
}
(async()=>{
 let failed=false;
 for(const args of jobs){
  console.log('START',args.join(' '),new Date().toISOString());
  const code=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['scripts/test-quality95.cjs',...args],{stdio:'inherit',windowsHide:true});
   child.on('error',reject);child.on('exit',resolve);
  });
  console.log('END',args.join(' '),'exit',code,new Date().toISOString());
  if(code!==0)failed=true;
 }
 if(failed)process.exitCode=2;
})().catch(e=>{console.error(e);process.exitCode=1;});
