'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {LocalAI}=require('../src/ai/local-ai.cjs');
function runtime(respond){
 return {getLlama:async()=>({loadModel:async()=>({dispose:async()=>{},createContext:async()=>({dispose:async()=>{},getSequence:()=>({clearHistory:async()=>{}})})}),createGrammarForJsonSchema:async s=>s}),
  LlamaChatSession:class{constructor(options){this.system=options.systemPrompt;}async prompt(text,options){return respond(text,options,this.system);}dispose(){}},QwenChatWrapper:class{}};
}
test('all blocks and sentences reach inference without retrieval matches; offsets stay per block',async()=>{
 const calls=[],ai=new LocalAI({loadRuntime:async()=>runtime(text=>{calls.push(text);return '{"corrections":[]}';})});
 const result=await ai.inspect('model.gguf',[{index:0,text:'안녕하세요. 반갑습니다.'},{index:1,text:'학교에 갑니다.'}]);
 assert.equal(calls.length,3);assert.equal(result.blocks.length,2);assert.deepEqual(result.blocks.map(b=>b.stats.completed),[2,1]);
 assert.deepEqual(result.stats,{total:3,completed:3,failed:0,unprocessed:0,cancelled:false});await ai.unload();
});
test('general corrections need a second review, stay local to each block, and are never bulk-applied',async()=>{
 let reviews=0;
 const ai=new LocalAI({loadRuntime:async()=>runtime((text,options)=>{
  if(options.grammar.properties.confirmed){reviews++;return '{"confirmed":true}';}
  return JSON.stringify({corrections:[{original:'학교에 가요요.',suggestion:'학교에 가요.',evidenceId:'ai-review',reason:'종결 어미 요가 중복되었습니다.'}]});
 })});
 const r=await ai.inspect('model.gguf',[{index:0,text:'학교에 가요요.'},{index:1,text:'내일 학교에 가요요.'}]);
 assert.equal(reviews,2);assert.equal(r.blocks[0].issues[0].start,4);assert.equal(r.blocks[1].issues[0].start,7);
 for(const b of r.blocks){assert.equal(b.issues[0].auto,false);assert.equal(b.issues[0].evidence,undefined);assert.equal(b.issues[0].requiresReview,undefined);}
});
test('rejected review produces no suggestion but counts an actually inspected sentence',async()=>{
 const ai=new LocalAI({loadRuntime:async()=>runtime((_t,o)=>o.grammar.properties.confirmed?'{"confirmed":false}':JSON.stringify({corrections:[{original:'가요요.',suggestion:'가요.',evidenceId:'ai-review',reason:'종결 어미 요가 중복되었습니다.'}]}))});
 const r=await ai.inspect('model.gguf','가요요.');assert.equal(r.stats.completed,1);assert.deepEqual(r.issues,[]);
});
test('failure is reported separately and remaining sentences still run',async()=>{
 let calls=0;const ai=new LocalAI({loadRuntime:async()=>runtime(()=>{if(++calls===1)throw Error('timeout');return '{"corrections":[]}';})});
 const r=await ai.inspect('model.gguf','안녕하세요. 반갑습니다.');assert.equal(r.stats.failed,1);assert.equal(r.stats.completed,1);assert.equal(r.stats.unprocessed,0);assert.equal(r.warnings.length,1);
});
test('cancellation preserves completed blocks and exposes unprocessed sentences',async()=>{
 let calls=0;const ai=new LocalAI({loadRuntime:async()=>runtime(()=>{if(++calls===2)ai.cancel();return '{"corrections":[]}';})});
 const r=await ai.inspect('model.gguf',[{index:0,text:'첫 문장입니다.'},{index:1,text:'다음입니다. 마지막입니다.'}]);
 assert.equal(calls,2);assert.equal(r.stats.cancelled,true);assert.equal(r.stats.completed,1);assert.equal(r.stats.unprocessed,2);assert.equal(r.blocks[1].stats.completed,0);assert.equal(ai.busy,false);
});
test('empty input reports no targets without loading a model',async()=>{
 const ai=new LocalAI({loadRuntime:async()=>{throw Error('must not load');}});const r=await ai.inspect('model.gguf','   ');assert.equal(r.stats.total,0);assert.equal(r.stats.completed,0);
});
test('general AI proposals cannot relabel style preferences, allowed spacing or changed numbers as errors',()=>{
 const {parseResponse}=require('../src/ai/prompts.cjs');
 for(const [original,suggestion,reason] of [
  ['3명이 참석합니다.','4명이 참석합니다.','인원수가 잘못되었습니다.'],
  ['확인해 주세요.','확인해주세요.','보조 용언의 띄어쓰기가 틀렸습니다.'],
  ['회신해 주세요.','답변해 주세요.','더 자연스러운 표현입니다.'],
  ['학교에 가요요.','학교에 가요.','']
 ])assert.deepEqual(parseResponse({corrections:[{original,suggestion,reason,evidenceId:'ai-review'}]},original,0,[],{allowReview:true}),[]);
});
