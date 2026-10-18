'use strict';
const {systemPrompt,schema,sentences,parseResponse,buildPrompt}=require('./prompts.cjs');
class LocalAI{
 constructor(){this.busy=false;this.model=null;this.modelPath=null;this.abort=null;}
 async unload(){if(this.busy)throw Error('AI 검사가 끝난 뒤 모델을 변경하거나 삭제해 주세요.');if(this.model)await this.model.dispose();this.model=null;this.modelPath=null;}
 cancel(){this.abort?.abort();}
 async inspect(file,text,onProgress=()=>{},onResponse=()=>{}){
  if(this.busy)throw Error('AI 검사가 진행 중입니다.');if(!file)throw Error('먼저 AI 모델을 준비해 주세요.');this.busy=true;this.abort=new AbortController();
  let context;const issues=[],warnings=[];
  try{const {getLlama,LlamaChatSession,QwenChatWrapper}=await import('node-llama-cpp');if(!this.llama)this.llama=await getLlama({gpu:false,build:'never'});
   if(this.modelPath!==file){if(this.model)await this.model.dispose();this.model=null;this.modelPath=null;this.model=await this.llama.loadModel({modelPath:file,gpuLayers:0});this.modelPath=file;}
   context=await this.model.createContext({contextSize:4096,threads:Math.max(1,Math.min(4,require('node:os').availableParallelism()-1))});const sequence=context.getSequence();const grammar=await this.llama.createGrammarForJsonSchema(schema);const chunks=sentences(text);
   for(let i=0;i<chunks.length;i++){if(this.abort.signal.aborted){warnings.push('AI 검사를 중지했습니다.');break;}const chunk=chunks[i],request=buildPrompt(chunk,text);onProgress({current:i+1,total:chunks.length});if(!request.references.some(r=>r.kind!=='protection'))continue;const session=new LlamaChatSession({contextSequence:sequence,systemPrompt,...(/qwen3/i.test(file)?{chatWrapper:new QwenChatWrapper({thoughts:'discourage'})}:{})});
    try{const output=await session.prompt(request.prompt,{grammar,temperature:0,maxTokens:384,signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(30000)]),stopOnAbortSignal:false});onResponse(output);issues.push(...parseResponse(output,chunk.text,chunk.start,request.references));}
    catch(e){warnings.push(`${i+1}번째 문장: ${e.name==='AbortError'||e.name==='TimeoutError'?'시간 초과 또는 중지':e.message}. 이 문장은 직접 확인해 주세요.`);}finally{session.dispose();await sequence.clearHistory();}
   }
   return {issues,warnings};
  }finally{if(context)await context.dispose();this.busy=false;this.abort=null;}
 }
}
module.exports={LocalAI};
