'use strict';
const database=require('./rules.json');
const {ruleEvidence}=require('../knowledge/retrieve.cjs');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function scan(text,rules=database.rules,{includeAdvisories=false}={}){if(typeof text!=='string'||text.length>100000)throw Error('100,000자 이하의 글을 입력해 주세요.');const found=[];
 for(const r of rules){if(!includeAdvisories&&(r.auto===false||typeof r.replacement!=='string'))continue;const re=new RegExp(r.regex?r.pattern:escape(r.pattern),'gu');for(const match of text.matchAll(re)){if(!match[0])continue;const start=match.index,end=start+match[0].length;
  if(['left','word'].includes(r.boundary)&&start&&/[가-힣A-Za-z0-9]/.test(text[start-1]))continue;
  if(r.boundary==='word'&&end<text.length&&/[가-힣A-Za-z0-9]/.test(text[end]))continue;
  const reference=ruleEvidence(r);
  const reason=r.id.startsWith('spacing-')&&r.pattern.includes('때')?"'때'는 앞의 관형어와 띄어 씁니다.":r.reason;
  found.push({id:`${r.id}:${start}`,ruleId:r.id,start,end,original:match[0],suggestion:r.replacement,reason,example:r.example||'',category:r.category,source:r.auto===false?'context':'rule',auto:r.auto!==false&&typeof r.replacement==='string',...(reference?{evidence:reference}:{})});
 }}
 // Corrections first so a long context reminder never hides a real error inside it.
 found.sort((a,b)=>Number(b.auto)-Number(a.auto)||(b.end-b.start)-(a.end-a.start));const accepted=[];for(const issue of found)if(!accepted.some(a=>a.start<issue.end&&issue.start<a.end))accepted.push(issue);return accepted.sort((a,b)=>a.start-b.start);
}
function apply(text,issues,{all=false}={}){const selected=issues.filter(i=>!all||i.source==='rule'&&i.auto).sort((a,b)=>b.start-a.start);let last=text.length;for(const i of selected){if(!Number.isInteger(i.start)||!Number.isInteger(i.end)||i.start<0||i.end>last||text.slice(i.start,i.end)!==i.original||typeof i.suggestion!=='string')throw Error('본문이 바뀌었습니다. 다시 검사해 주세요.');text=text.slice(0,i.start)+i.suggestion+text.slice(i.end);last=i.start;}return text;}
module.exports={scan,apply,database};
