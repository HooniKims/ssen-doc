'use strict';
const {scan:scanRules}=require('./rules/rule-engine.cjs');
const {sentences,parseResponse}=require('./ai/prompts.cjs');
const {retrieve}=require('./knowledge/retrieve.cjs');
function scan(text){
 const issues=scanRules(text);
 // A deliberately small structural check, separate from model output. Never bulk-applied.
 // Possessive goal statements avoid ambiguous topic readings such as 이 목표는 ... 실천합니다.
 for(const chunk of sentences(text)){
  if(!/^\s*(?:저|우리|교육)의\s+(?:목표는|목적은|바람은)\s/u.test(chunk.text))continue;
  const suggestion=chunk.text.replace(/합니다([.!?]?)$/u,'하는 것입니다$1');
  const candidates=parseResponse({corrections:[{original:chunk.text,suggestion,evidenceId:'grammar-agreement'}]},chunk.text,chunk.start,retrieve(chunk.text));
  for(const issue of candidates)if(!issues.some(i=>i.start<issue.end&&issue.start<i.end))issues.push({...issue,id:issue.id.replace('ai-','grammar-'),source:'grammar'});
 }
 return issues.sort((a,b)=>a.start-b.start);
}
module.exports={scan};
