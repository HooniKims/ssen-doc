'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const baseline=process.argv.includes('--baseline'),tag=process.argv.find(v=>v.startsWith('--tag='))?.slice(6)||'candidate';
const fixture=process.argv.find(v=>v.startsWith('--fixture='))?.slice(10)||'tests/fixtures/quality95.cjs';
const corpus=require(path.resolve(fixture)),engine=path.resolve(baseline?'_workspace/quality95-baseline/src':'src');
const {LocalAI}=require(path.join(engine,'ai/local-ai.cjs')),{scan}=require(path.join(engine,'checker.cjs')),{apply}=require(path.join(engine,'rules/rule-engine.cjs')),{merge}=require(path.join(engine,'merge.cjs'));
const {formatText,structureRows}=require(path.join(engine,'official-format.cjs'));
const root=path.resolve('_workspace/quality95'),name=baseline?'baseline':tag;
const exact=(a,b)=>Array.isArray(a)?a.includes(b):a===b;
async function fingerprint(dir){
 const files={};
 const walk=async(folder)=>{
  for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const file=path.join(folder,entry.name);
   if(entry.isDirectory())await walk(file);
   else files[path.relative(dir,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
 };
 await walk(dir);
 return {sha256:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
async function main(){
 await fs.mkdir(root,{recursive:true});
 if(await fs.stat(path.join(root,name+'.json')).then(()=>true,()=>false))throw Error('Existing evaluation is preserved; use a new --tag.');
 const report={version:require('../package.json').version,engine:baseline?'1.5.1 baseline':'current',source:await fingerprint(engine),started:new Date().toISOString(),corpus:corpus.version,corpusHash:crypto.createHash('sha256').update(JSON.stringify(corpus)).digest('hex'),rubric:corpus.rubric,model:'Qwen3-0.6B-Q4_K_M.gguf',synthetic:true,cases:[]};
 await fs.writeFile(path.join(root,name+'-inputs.json'),JSON.stringify(corpus,null,2));
 const save=()=>fs.writeFile(path.join(root,name+'.json'),JSON.stringify(report,null,2));
 const model=path.resolve('_workspace/ai-verification/models',report.model),ai=new LocalAI();
 try{
  for(const c of corpus.cases){
   const basic=scan(c.text),responses=[],started=Date.now(),inference=await ai.inspect(model,c.text,()=>{},r=>responses.push(r));
   const merged=merge(basic,inference.issues),spelled=apply(c.text,merged);let actual=spelled,structure;
   if(c.kind==='document'){
    structure=await ai.reviewStructure(model,structureRows(spelled.split('\n').map((text,index)=>({index,text,scope:'text'}))));
    actual=formatText(spelled,Object.fromEntries(structure.proposals.map(p=>[p.index,p.level]))).text;
   }
   const failed=inference.stats.failed+inference.stats.unprocessed+(structure?.stats.failed||0)+(structure?.stats.unprocessed||0);
   const entry={...c,actual,exact:exact(c.expected,actual)&&!failed,basic,aiIssues:inference.issues,stats:inference.stats,warnings:inference.warnings,structure,responses,milliseconds:Date.now()-started};
   report.cases.push(entry);await save();console.log(JSON.stringify({id:c.id,kind:c.kind,exact:entry.exact,...(!entry.exact?{actual}:{}),failed}));
  }
 }finally{await ai.unload();if(ai.llama&&!ai.llama.disposed)await ai.llama.dispose();}
 const group=kind=>{const rows=report.cases.filter(r=>kind.includes(r.kind));return {total:rows.length,correct:rows.filter(r=>r.exact).length};};
 const score=100*report.cases.filter(r=>r.exact).length/report.cases.length,errors=group(['error','paragraph']),normal=group(['normal']),documents=group(['document']);
 report.summary={score,errorAccuracy:100*errors.correct/errors.total,errors,normal,documents,normalChanges:normal.total-normal.correct,failedChunks:report.cases.reduce((n,c)=>n+c.stats.failed+c.stats.unprocessed+(c.structure?.stats.failed||0)+(c.structure?.stats.unprocessed||0),0)};
 report.sourceUnchanged=report.source.sha256===(await fingerprint(engine)).sha256;
 report.passed=report.sourceUnchanged&&score>=corpus.rubric.minimumScore&&report.summary.errorAccuracy>=corpus.rubric.minimumErrorAccuracy&&report.summary.normalChanges<=corpus.rubric.normalChangesAllowed&&documents.correct===documents.total&&!report.summary.failedChunks;
 report.completed=new Date().toISOString();await save();console.log(JSON.stringify({passed:report.passed,...report.summary}));
 if(!report.passed&&!baseline)process.exitCode=2;
}
async function exclusive(){
 await fs.mkdir(root,{recursive:true});
 const lock=path.join(root,'.inference.lock');
 const handle=await fs.open(lock,'wx').catch(e=>{if(e.code==='EEXIST')throw Error('Another quality evaluation holds .inference.lock. Run the suite sequentially; never run CPU model evaluations in parallel.');throw e;});
 try{await handle.writeFile(JSON.stringify({pid:process.pid,tag:name,started:new Date().toISOString()}));await main();}
 finally{await handle.close();await fs.unlink(lock);}
}
exclusive().catch(e=>{console.error(e);process.exitCode=1;});
