'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const corpus=require('../tests/fixtures/practical-quality.cjs'),{scan}=require('../src/checker.cjs'),{apply}=require('../src/rules/rule-engine.cjs'),{merge}=require('../src/merge.cjs'),{LocalAI}=require('../src/ai/local-ai.cjs'),{formatText,structureRows}=require('../src/official-format.cjs');
const out=path.resolve('_workspace/practical-quality-1.5.0');
const acceptable=(expected,actual)=>Array.isArray(expected)?expected.includes(actual):expected===actual;
async function main(){
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'inputs.json'),JSON.stringify(corpus,null,2));
 const model=path.resolve('_workspace/ai-verification/models',require('../src/ai/models.json').models[0].filename);await fs.access(model);
 const report={version:require('../package.json').version,date:new Date().toISOString(),synthetic:true,model:path.basename(model),method:'Frozen expected outputs. All proposals hypothetically accepted; app still requires user selection. No engine changes during evaluation.',spelling:[],documents:[]};
 const ai=new LocalAI();
 const save=()=>fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
 async function inspect(text){const basic=scan(text),start=Date.now(),result=await ai.inspect(model,text),merged=merge(basic,result.issues);return {basic,aiIssues:result.issues,basicActual:apply(text,basic),aiActual:apply(text,result.issues),actual:apply(text,merged),stats:result.stats,warnings:result.warnings,milliseconds:Date.now()-start};}
 try{
  for(const c of corpus.spelling){const r=await inspect(c.text);report.spelling.push({...c,...r,exact:c.expected===null?null:acceptable(c.expected,r.actual),basicExact:c.expected===null?null:acceptable(c.expected,r.basicActual),aiExact:c.expected===null?null:acceptable(c.expected,r.aiActual)});console.log(JSON.stringify({id:c.id,actual:r.actual,ai:r.aiIssues.length,exact:report.spelling.at(-1).exact,stats:r.stats}));await save();}
  for(const c of corpus.documents){
   const lines=c.text.split('\n'),checked=[];
   for(let i=0;i<lines.length;i++){const r=await inspect(lines[i]);checked.push({index:i,text:lines[i],...r});}
   const checkedText=checked.map(r=>r.actual).join('\n'),rows=structureRows(checkedText.split('\n').map((text,index)=>({index,text,scope:'text'})));
   const start=Date.now(),structure=await ai.reviewStructure(model,rows),overrides=Object.fromEntries(structure.proposals.map(p=>[p.index,p.level])),formatted=formatText(checkedText,overrides);
   const r={...c,checked,structure,structureMs:Date.now()-start,actual:formatted.text,exact:formatted.text===c.expected,correctLevels:structure.proposals.filter(p=>c.levels[p.index]===p.level).length,wrongLevels:structure.proposals.filter(p=>c.levels[p.index]!==p.level),requiredLevels:Object.keys(c.levels).length,remaining:formatted.rows.filter(r=>r.reason).map(r=>({index:r.index,reason:r.reason}))};report.documents.push(r);
   await fs.writeFile(path.join(out,c.id+'-before.txt'),c.text);await fs.writeFile(path.join(out,c.id+'-after.txt'),r.actual);await save();console.log(JSON.stringify({id:c.id,exact:r.exact,correctLevels:r.correctLevels,wrongLevels:r.wrongLevels.length,stats:structure.stats}));
  }
 }finally{await ai.unload();if(ai.llama&&!ai.llama.disposed)await ai.llama.dispose();}
 report.completed=new Date().toISOString();await save();console.log('Saved '+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
