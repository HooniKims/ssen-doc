'use strict';
const {scan:scanRules}=require('./rules/rule-engine.cjs');
const {sentences,parseResponse}=require('./ai/prompts.cjs');
const {retrieve}=require('./knowledge/retrieve.cjs');
const {scanLinguistic}=require('./rules/linguistic-rules.cjs');
function scan(text){
 const issues=scanRules(text);
 for(const issue of scanLinguistic(text)){
  const conflicts=issues.filter(i=>i.start<issue.end&&issue.start<i.end);
  if(!conflicts.length){issues.push(issue);continue;}
  // Compose a larger spelling+spacing fix only when it preserves every
  // contained dictionary correction. Never silently replace a different edit.
  if(conflicts.some(i=>i.start<issue.start||i.end>issue.end))continue;
  let corrected=issue.original;
  for(const i of conflicts.sort((a,b)=>b.start-a.start))
   corrected=corrected.slice(0,i.start-issue.start)+i.suggestion+corrected.slice(i.end-issue.start);
  if(corrected===issue.suggestion)continue;
  if(corrected.replace(/\s/gu,'')!==issue.suggestion.replace(/\s/gu,''))continue;
  for(const i of conflicts)issues.splice(issues.indexOf(i),1);
  issues.push(issue);
 }
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
