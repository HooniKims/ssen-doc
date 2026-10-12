'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {GATED,OPEN,ACTIONS,createRegistrar,validCommand,diagnosticReport}=require('../app/auth-policy.cjs');
test('every protected IPC authorizes before its handler, rejects spoofed senders',async()=>{
 const handlers=new Map();let editable=false,called=0,denied=0;
 const register=createRegistrar({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},auth:{authorize:async()=>{if(!editable)throw Error('LOGIN');}},allowed:e=>e.trusted,onDenied:()=>denied++});
 for(const name of GATED){register(name,async()=>++called);assert.equal((await handlers.get(name)({trusted:true})).code,'AUTH_REQUIRED');await assert.rejects(()=>handlers.get(name)({trusted:false}));}
 assert.equal(called,0);assert.equal(denied,GATED.size);editable=true;
 for(const name of GATED)await handlers.get(name)({trusted:true});assert.equal(called,GATED.size);
 assert.throws(()=>register('new:unreviewed',()=>{}),/Unclassified/);
 for(const name of OPEN)assert.ok(!GATED.has(name));
});
test('13 auth commands only; internal peek and storage operations inaccessible',()=>{
 assert.equal(ACTIONS.size,13);for(const action of ACTIONS)assert.doesNotThrow(()=>validCommand(action,{}));
 for(const action of ['peek','write','__proto__','admin'])assert.throws(()=>validCommand(action,{}));
 for(const args of [null,[],{code:'x'.repeat(5000)}])assert.throws(()=>validCommand('login',args));
});
test('diagnostic export excludes account and cannot become arbitrary text export',()=>{
 const report=diagnosticReport({summary:()=>({email:'private@example.test',token:'secret',lastFailure:null,diagnostics:[]})},'1.1.0');
 assert.ok(!report.includes('private'));assert.ok(!report.includes('secret'));assert.equal(JSON.parse(report).app,'SsenDoc');
});
test('bundled common auth files are byte-identical to the supplied kit',()=>{
 const manifest=fs.readFileSync(path.join(__dirname,'auth-kit/SHA256SUMS.txt'),'utf8');let count=0;
 for(const line of manifest.trim().split(/\r?\n/)){const m=line.match(/^([a-f0-9]{64})\s+\*?(?:\.\/)?auth\/(.+)$/);if(!m)continue;count++;assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../app/auth',m[2]))).digest('hex'),m[1],m[2]);}
 assert.equal(count,6);
});
