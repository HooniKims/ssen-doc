'use strict';
// Uses only synthetic fixtures and an already installed model. Never downloads a model.
const fs=require('node:fs/promises'),path=require('node:path');
const {apply}=require('../src/rules/rule-engine.cjs'),{scan}=require('../src/checker.cjs');
const {merge}=require('../src/merge.cjs');
const corpus=require('../tests/fixtures/spelling-quality.cjs');
(async()=>{
 const report={date:new Date().toISOString(),normalSentences:corpus.correct.length,falsePositiveSentences:corpus.correct.filter(t=>scan(t).length),correctionCases:corpus.errors.length,missedCorrections:corpus.errors.filter(([t,expected])=>apply(t,scan(t),{all:true})!==expected)};
 if(process.argv.includes('--ai')){
  const {LocalAI}=require('../src/ai/local-ai.cjs'),ai=new LocalAI();
  const model=path.resolve(process.env.SSENDOC_QUALITY_MODEL||'_workspace/ai-verification/models/Qwen3-0.6B-Q4_K_M.gguf');
  await fs.access(model);report.ai=[];
  try{for(const [text,expected] of corpus.ai){const started=Date.now(),responses=[];const result=await ai.inspect(model,text,()=>{},raw=>responses.push(raw));const actual=apply(text,merge(scan(text),result.issues));const row={text,expected:expected||text,actual,passed:actual===(expected||text),milliseconds:Date.now()-started,...result,responses};report.ai.push(row);console.log(JSON.stringify(row));}}
  finally{await ai.unload();if(ai.llama)await ai.llama.dispose();}
 }
 await fs.mkdir('_workspace',{recursive:true});await fs.writeFile('_workspace/spelling-quality.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({normal:report.normalSentences,falsePositives:report.falsePositiveSentences.length,correctionCases:report.correctionCases,missed:report.missedCorrections.length,ai:report.ai?.map(r=>({passed:r.passed,warnings:r.warnings}))}));
 if(report.falsePositiveSentences.length||report.missedCorrections.length||report.ai?.some(r=>!r.passed||r.warnings.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
