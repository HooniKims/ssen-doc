'use strict';
// Synthetic text only; verifies real CPU inference over a whole document-shaped batch.
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {LocalAI}=require('../src/ai/local-ai.cjs');
(async()=>{
 const ai=new LocalAI(),model=path.resolve('_workspace/ai-verification/models/Qwen3-0.6B-Q4_K_M.gguf');
 const blocks=[{index:0,text:'학생들은 질서를 지키며 이동해 주시기 바랍니다.'},{index:1,text:'신청서를 작성하신 후 회신해 주시기 바랍니다.'},{index:2,text:'오늘은 왠지 기분이 좋습니다.'}];
 const responses=[],started=Date.now();let result;
 try{
  result=await ai.inspect(model,blocks,p=>console.log(JSON.stringify(p)),raw=>responses.push(raw));
  assert.equal(result.stats.total,3);assert.equal(result.stats.completed,3);assert.equal(result.stats.failed,0);assert.equal(result.stats.unprocessed,0);assert.equal(responses.length,3);
  assert.deepEqual(result.blocks.map(b=>b.stats.completed),[1,1,1]);assert.ok(result.blocks.every(b=>b.issues.length===0));
  await fs.writeFile('docs/AI-DOCUMENT-1.3.1.json',JSON.stringify({version:'1.3.1',date:new Date().toISOString(),milliseconds:Date.now()-started,...result,responses},null,2));
  console.log('All three blocks reached real CPU inference; no false suggestions.');
 }finally{await ai.unload();if(ai.llama)await ai.llama.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
