"use strict";
const {sentences}=require('./prompts.cjs');
const {inspectChunk}=require('./spelling-harness.cjs');
class LocalAI{
 constructor({loadRuntime=()=>import('node-llama-cpp')}={}){this.loadRuntime=loadRuntime;this.busy=false;this.model=null;this.modelPath=null;this.abort=null;}
 async unload(){if(this.busy)throw Error('AI 검사가 끝난 뒤 모델을 변경하거나 삭제해 주세요.');if(this.model)await this.model.dispose();this.model=null;this.modelPath=null;}
 cancel(){this.abort?.abort();}
 async reviewStructure(file,rows,onProgress=()=>{},options={}){
  if(this.busy)throw Error('AI 검사가 진행 중입니다.');
  if(!file)throw Error('먼저 AI 모델을 준비해 주세요.');
  this.busy=true;this.abort=new AbortController();let context;
  try{
   const {runStructure,jobsFor}=require('./structure-harness.cjs');
   if(!jobsFor(rows).length)return await runStructure(rows,{signal:this.abort.signal,request:()=>{throw Error('검토 대상 없음');}});
   const {getLlama,LlamaChatSession,QwenChatWrapper}=await this.loadRuntime();if(!this.llama)this.llama=await getLlama({gpu:false,build:'never'});
   if(this.modelPath!==file){if(this.model)await this.model.dispose();this.model=null;this.modelPath=null;this.model=await this.llama.loadModel({modelPath:file,gpuLayers:0});this.modelPath=file;}
   context=await this.model.createContext({contextSize:4096,threads:Math.max(1,Math.min(4,require('node:os').availableParallelism()-1))});
   const sequence=context.getSequence();
   const request=async({system,message,schema,signal,maxTokens})=>{
    const grammar=await this.llama.createGrammarForJsonSchema(schema);
    const session=new LlamaChatSession({contextSequence:sequence,systemPrompt:system,...(/qwen3/i.test(file)?{chatWrapper:new QwenChatWrapper({thoughts:'discourage'})}:{})});
    try{const output=await session.prompt(message,{grammar,temperature:0,maxTokens,signal,stopOnAbortSignal:false});options.onResponse?.(output);return output;}
    finally{session.dispose();await sequence.clearHistory();}
   };
   return await runStructure(rows,{...options,request,signal:this.abort.signal,onProgress});
  }finally{try{if(context)await context.dispose();}finally{this.busy=false;this.abort=null;}}
 }
 async inspect(file,input,onProgress=()=>{},onResponse=()=>{}){
  if(this.busy)throw Error('AI 검사가 진행 중입니다.');if(!file)throw Error('먼저 AI 모델을 준비해 주세요.');this.busy=true;this.abort=new AbortController();
  const blocks=typeof input==='string'?[{index:0,text:input}]:input;
  const results=blocks.map(b=>({index:b.index,text:b.text,issues:[],stats:{total:0,completed:0,failed:0,unprocessed:0}}));
  const chunks=blocks.flatMap((b,n)=>sentences(b.text).map(chunk=>({...chunk,block:n,fullText:b.text})));
  for(const chunk of chunks)results[chunk.block].stats.total++;
  const stats={total:chunks.length,completed:0,failed:0,unprocessed:chunks.length,cancelled:false},warnings=[];
  let context;
  try{
   if(chunks.length){
    const {getLlama,LlamaChatSession,QwenChatWrapper}=await this.loadRuntime();if(!this.llama)this.llama=await getLlama({gpu:false,build:'never'});
    if(this.modelPath!==file){if(this.model)await this.model.dispose();this.model=null;this.modelPath=null;this.model=await this.llama.loadModel({modelPath:file,gpuLayers:0});this.modelPath=file;}
    context=await this.model.createContext({contextSize:4096,threads:Math.max(1,Math.min(4,require('node:os').availableParallelism()-1))});
    const sequence=context.getSequence(),grammars=new Map();
    const request=async({system,message,schema,signal,maxTokens})=>{
     const key=JSON.stringify(schema);if(!grammars.has(key))grammars.set(key,await this.llama.createGrammarForJsonSchema(schema));
     const session=new LlamaChatSession({contextSequence:sequence,systemPrompt:system,...(/qwen3/i.test(file)?{chatWrapper:new QwenChatWrapper({thoughts:'discourage'})}:{})});
     try{const output=await session.prompt(message,{grammar:grammars.get(key),temperature:0,maxTokens,signal,stopOnAbortSignal:false});onResponse(output);return output;}
     finally{session.dispose();await sequence.clearHistory();}
    };
    for(let i=0;i<chunks.length;i++){
     if(this.abort.signal.aborted)break;
     const chunk=chunks[i],result=results[chunk.block];
     onProgress({current:i+1,total:chunks.length,completed:stats.completed,failed:stats.failed,block:chunk.block+1,blocks:blocks.length});
     const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(30000)]);
     try{
      const {issues:accepted}=await inspectChunk(chunk,chunk.fullText,request,signal);
      if(this.abort.signal.aborted)break;
      result.issues.push(...accepted);result.stats.completed++;stats.completed++;
     }catch(e){
      if(this.abort.signal.aborted)break;
      result.stats.failed++;stats.failed++;
      if(warnings.length<5)warnings.push(`${chunk.block+1}번째 문단·셀, ${i+1}번째 검사 구간: ${signal.aborted?'시간 초과':e.message}`);
     }
    }
   }
   stats.cancelled=this.abort.signal.aborted;stats.unprocessed=stats.total-stats.completed-stats.failed;
   for(const result of results)result.stats.unprocessed=result.stats.total-result.stats.completed-result.stats.failed;
   return {issues:typeof input==='string'?results[0].issues:[],blocks:results,stats,warnings};
  }finally{try{if(context)await context.dispose();}finally{this.busy=false;this.abort=null;}}
 }
}
module.exports={LocalAI};
