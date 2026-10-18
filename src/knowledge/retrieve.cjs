'use strict';
const database=require('./korean-rules.json');
const byId=new Map(database.entries.map(entry=>[entry.id,entry]));
const triggers={
 'hangul-35':/됬|되요|뵈요|돼었|되어|됐|돼요|봬요/u,
 'hangul-42':/[가-힣]\s*(?:수\s*(?:있|없)|것|뿐|때)/u,
 'hangul-53':/[가-힣]께(?:요|[.!?\s]|$)|[가-힣]게요/u,
 'hangul-47':/[아어해여]\s*(?:주|드리|보|버리)/u,
 'grammar-agreement':/(?:목표는|목적은|바람은)\s/u
};
function retrieve(text,limit=3){
 // Deterministic local retrieval: a relevant rule is evidence, never a detection.
 return database.entries.filter(entry=>triggers[entry.id].test(text))
  .sort((a,b)=>Number(b.kind==='grammar')-Number(a.kind==='grammar'))
  .slice(0,limit);
}
function evidence(entry){return {id:entry.id,title:entry.title,summary:entry.summary,exceptions:entry.exceptions,source:entry.source,version:database.version,reviewedAt:database.reviewedAt};}
function ruleEvidence(rule){
 let id;
 if(rule.id.startsWith('spacing-')&&!rule.pattern.includes('때'))id='hangul-42';
 else if(/됬|되요|뵈요|돼었/u.test(rule.pattern))id='hangul-35';
 else if(rule.pattern.endsWith('께'))id='hangul-53';
 return id?evidence(byId.get(id)):null;
}
function isSupportedChange(entry,original,suggestion){
 if(entry.kind==='protection')return false;
 if(entry.id==='hangul-35')return original.replace(/됬/g,'됐').replace(/되요/g,'돼요').replace(/뵈요/g,'봬요').replace(/돼었/g,'되었')===suggestion;
 if(entry.id==='hangul-53')return original.replace(/([가-힣])께(?=요|[.!?\s]|$)/gu,(_,syllable)=>{
  // The preceding syllable must end in ㄹ; protects 선생님께 and 함께.
  return (syllable.charCodeAt(0)-0xAC00)%28===8?syllable+'게':syllable+'께';
 })===suggestion;
 if(entry.id==='hangul-42'){
  // Only a narrow, unambiguous subset is accepted without morphological analysis.
  const changed=original.replace(/([가-힣])\s*(수)\s*(있|없)/gu,(match,syllable,noun,verb)=>
   (syllable.charCodeAt(0)-0xAC00)%28===8?`${syllable} ${noun} ${verb}`:match);
  return changed!==original&&changed===suggestion;
 }
 if(entry.id==='grammar-agreement'){
  // Require an embedded subject and an explanatory predicate; reject quotes and topic readings.
  if(/["“”'‘’:：\n]/u.test(original)||!/(?:목표는|목적은|바람은)\s+[\s\S]*[이가]\s/u.test(original))return false;
  if(!/(?:귀가|참여|성장|협력|생활|도전|활동)합니다([.!?]?)$/u.test(original))return false;
  return original.replace(/합니다([.!?]?)$/u,'하는 것입니다$1')===suggestion;
 }
 return false;
}
module.exports={database,retrieve,evidence,ruleEvidence,isSupportedChange};
