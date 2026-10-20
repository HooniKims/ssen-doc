'use strict';
// Run each engine in its own process so native model memory is released reliably.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const baseline=process.argv.includes('--baseline'),unseen=process.argv.includes('--unseen'),engine=path.resolve(baseline?'_workspace/harness-baseline/src':'src');
const {LocalAI}=require(path.join(engine,'ai/local-ai.cjs')),{scan}=require(path.join(engine,'checker.cjs'));
const {apply}=require(path.join(engine,'rules/rule-engine.cjs')),{merge}=require(path.join(engine,'merge.cjs'));
const {formatText,structureRows}=require(path.join(engine,'official-format.cjs'));
const holdout=require(unseen?'../tests/fixtures/harness-unseen.cjs':'../tests/fixtures/harness-holdout.cjs'),practical=require('../tests/fixtures/practical-quality.cjs');
const root=path.resolve('_workspace/harness-quality-1.5.1'),acceptable=(expected,actual)=>Array.isArray(expected)?expected.includes(actual):expected===actual;
async function main(){
 await fs.mkdir(root,{recursive:true});
 const corpusHash=crypto.createHash('sha256').update(JSON.stringify(holdout)).digest('hex');
 const model=path.resolve('_workspace/ai-verification/models',require('../src/ai/models.json').models[0].filename);
 const report={engine:baseline?'1.5.0 baseline':'1.5.1 harness',started:new Date().toISOString(),corpusHash,synthetic:true,model:path.basename(model),method:'Frozen expected outputs; all accepted suggestions applied for comparison. Contextual suggestions still require user selection.',spelling:[],documents:[]};
 const file=path.join(root,unseen?'unseen.json':baseline?'baseline.json':'current.json'),save=()=>fs.writeFile(file,JSON.stringify(report,null,2));
 await fs.writeFile(path.join(root,unseen?'unseen-inputs.json':'locked-inputs.json'),JSON.stringify({corpusHash,holdout,practical},null,2));
 const ai=new LocalAI();
 const inspect=async text=>{
  const basic=scan(text),responses=[],start=Date.now(),result=await ai.inspect(model,text,()=>{},raw=>responses.push(raw));
  return {basic,aiIssues:result.issues,actual:apply(text,merge(basic,result.issues)),stats:result.stats,warnings:result.warnings,responses,milliseconds:Date.now()-start};
 };
 try{
  const cases=[...holdout.errors.map(([text,expected],i)=>({id:`h-error-${i+1}`,suite:'holdout-error',text,expected})),...holdout.normal.map((text,i)=>({id:`h-normal-${i+1}`,suite:'holdout-normal',text,expected:text})),...(!baseline&&!unseen?practical.spelling.map(c=>({...c,suite:'previous'})):[])];
  for(const c of cases){const r=await inspect(c.text),entry={...c,...r,exact:c.expected===null?null:acceptable(c.expected,r.actual)};report.spelling.push(entry);await save();console.log(JSON.stringify({id:c.id,exact:entry.exact,actual:r.actual,stats:r.stats}));}
  if(!baseline&&!unseen){
   const oldParagraph=JSON.parse(await fs.readFile('_workspace/practical-quality-1.5.0/paragraph.json','utf8'));
   report.paragraph={text:oldParagraph.text,expected:oldParagraph.expected,...await inspect(oldParagraph.text)};report.paragraph.exact=report.paragraph.actual===report.paragraph.expected;await save();
   for(const c of practical.documents){
    const checked=[];for(const [index,text] of c.text.split('\n').entries())checked.push({index,text,...await inspect(text)});
    const checkedText=checked.map(r=>r.actual).join('\n'),rows=structureRows(checkedText.split('\n').map((text,index)=>({index,text,scope:'text'})));
    const structure=await ai.reviewStructure(model,rows),formatted=formatText(checkedText,Object.fromEntries(structure.proposals.map(p=>[p.index,p.level])));
    const r={...c,checked,structure,actual:formatted.text,exact:formatted.text===c.expected,correctLevels:structure.proposals.filter(p=>c.levels[p.index]===p.level).length,wrongLevels:structure.proposals.filter(p=>c.levels[p.index]!==p.level),requiredLevels:Object.keys(c.levels).length};
    report.documents.push(r);await save();console.log(JSON.stringify({id:c.id,exact:r.exact,stats:structure.stats}));
   }
  }
 }finally{await ai.unload();if(ai.llama&&!ai.llama.disposed)await ai.llama.dispose();}
 report.completed=new Date().toISOString();await save();console.log('Saved '+file);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
