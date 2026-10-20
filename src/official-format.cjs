'use strict';
// Numbering is deterministic. The model never rewrites the document body.
const KOREAN=Array.from('가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호');
const width=s=>Array.from(s).reduce((n,c)=>n+(/[가-힣㉮-㉻①-⑳]/u.test(c)?2:1),0);
function marker(level,n){
  if([1,3,5].includes(level)&&n>999)throw Error('숫자 항목 번호 범위를 넘었습니다. 목록을 나누어 주세요.');
  const ko=KOREAN[n-1];
  if([2,4,6].includes(level)&&!ko)throw Error('한글 항목 번호 범위를 넘었습니다. 목록을 나누어 주세요.');
  if(level===7&&n>20||level===8&&n>14)throw Error('원문자 항목 번호 범위를 넘었습니다. 목록을 나누어 주세요.');
  return [null,`${n}.`,`${ko}.`,`${n})`,`${ko})`,`(${n})`,`(${ko})`,String.fromCodePoint(0x2460+n-1),String.fromCodePoint(0x326e+n-1)][level];
}
function parseItem(text){
  const m=text.match(/^([ \t\u3000]*)(\([1-9]\d{0,2}\)|\([가-힣]\)|[1-9]\d{0,2}[.)]|[가-힣][.)]|[①-⑳㉮-㉻])([ \t]*)(\S.*)$/u);
  if(!m)return null;
  const token=m[2],body=m[4];
  // Dates, decimals, legal references and normal sentences are not list markers.
  if(/^\d+[.)]/.test(body)||!m[3]&&/^\d/.test(body)||/^[가-힣]/.test(token)&&!KOREAN.includes(token[0])||/^\([가-힣]/.test(token)&&!KOREAN.includes(token[1]))return null;
  let level= /^\(\d/.test(token)?5:/^\(/.test(token)?6:/^[①-⑳]/u.test(token)?7:/^[㉮-㉻]/u.test(token)?8:/^\d/.test(token)?(token.endsWith('.')?1:3):(token.endsWith('.')?2:4);
  return {token,body,level,indent:width(m[1].replace(/\t/g,'    '))};
}
const nativeFormats=['DIGIT','HANGUL_SYLLABLE','DIGIT','HANGUL_SYLLABLE','DIGIT','HANGUL_SYLLABLE','CIRCLED_DIGIT','CIRCLED_HANGUL_SYLLABLE'];
const nativePatterns=['^1.','^2.','^3)','^4)','(^5)','(^6)','^7','^8'];
function itemFor(row){
 if(row.native)return {body:row.text,level:row.native.level,indent:0,token:''};
 const item=parseItem(row.text);if(item)return item;
 const bullet=row.text.match(/^([ \t]*)([-○□•·])\s+(\S.*)$/u);
 return bullet?{body:bullet[3],level:null,indent:width(bullet[1].replace(/\t/g,'    ')),token:bullet[2],ambiguous:true}:null;
}
function layout(level,token,fontHeight=1000){
  const hanging=Math.round(width(token+' ')*fontHeight/2);
  return {left:(level-1)*fontHeight+hanging,intent:-hanging};
}
function formatRows(input,overrides={}){
  if(!Array.isArray(input)||input.length>30000)throw Error('문단 수를 확인해 주세요.');
  const items=input.map(row=>{const item=itemFor(row);if(item&&!row.native&&item.indent===0&&Number.isInteger(row.paragraphIndent)&&row.paragraphIndent>0)item.indent=row.paragraphIndent;return {...row,item};});
  const rows=[],warnings=[],counters=Array(9).fill(0);let previous=0,part=null;
  // Use indentation only when a level-one anchor and an indented item coexist.
  const explicit=new Set();
  for(const r of items)if(r.item?.level===1&&r.item.indent===0&&!r.reason)explicit.add(r.scope||r.part||'text');
  for(const r of items){
    const scope=r.scope||r.part||'text';if(scope!==part){counters.fill(0);previous=0;part=scope;}
    const p=r.item;
    if(!p){
      if(r.reason||/^\s*[-○□•·]/u.test(r.text))warnings.push({index:r.index,text:r.text,reason:r.reason||'기호만으로 항목 단계를 판단할 수 없습니다.'});
      if(r.reason||/^\s*붙임(?:\s|$)/u.test(r.text)){counters.fill(0);previous=0;}
      continue;
    }
    let level=p.level;
    if(!r.native&&!p.ambiguous&&p.indent>0&&explicit.has(scope))level=p.indent%2===0?p.indent/2+1:null;
    const key=String(r.index),overridden=Object.prototype.hasOwnProperty.call(overrides,key);
    if(overridden){level=overrides[key];if(level!==null&&(!Number.isInteger(level)||level<1||level>8))throw Error('항목 단계를 확인해 주세요.');}
    let reason=r.reason||'';
    if(!reason&&(level===null||level>8))reason=overridden?'사용자가 유지한 항목입니다.':'항목 단계가 명확하지 않습니다. 단계를 선택하거나 AI 구조 검토를 실행해 주세요.';
    if(!reason&&level>previous+1)reason='상위 항목이 없습니다. 단계를 선택해 주세요.';
    if(reason){rows.push({...r,item:undefined,level,reason,originalReason:r.reason,before:r.text,after:r.text,changed:false});counters.fill(0);previous=0;continue;}
    counters[level]++;for(let n=level+1;n<=8;n++)counters[n]=0;
    let token;try{token=marker(level,counters[level]);}catch(e){rows.push({...r,item:undefined,level,reason:e.message,before:r.text,after:r.text,changed:false});previous=0;counters.fill(0);continue;}
    previous=level;
    const content=token+' '+p.body,after=r.native?r.text:r.document?content:'  '.repeat(level-1)+content;
    const format=r.document?{level,token,...(r.native?{left:r.left,intent:r.intent}:layout(level,token,r.fontHeight)),...(r.native?{native:true,numberingId:r.native.id,scope}:{}),...(r.paragraph!==undefined?{paragraph:r.paragraph}:{})}:null;
    const formatChanged=format&&(r.left!==format.left||r.intent!==format.intent);
    rows.push({...r,item:undefined,level,reason:'',before:r.text,after,preview:r.native?`${'  '.repeat(level-1)}${nativePatterns[level-1].replace('^'+level,'자동')} ${r.text}`:'  '.repeat(level-1)+content,format,changed:after!==r.text||Boolean(formatChanged)||Boolean(r.native&&(!r.native.standard||r.native.level!==level))});
  }
  // Keep every paragraph in a native list on the same cloned numbering definition.
  const affected=new Set(rows.filter(r=>r.native&&r.changed).map(r=>`${r.scope}:${r.native.id}`));
  for(const r of rows)if(r.native&&affected.has(`${r.scope}:${r.native.id}`)&&!r.reason)r.changed=true;
  return {rows,warnings,changed:rows.filter(r=>r.changed).length};
}
function structureRows(input,overrides={}){
 const result=formatRows(input,overrides),byId=new Map(result.rows.map(r=>[String(r.index),r]));
 return input.map(r=>{const p=byId.get(String(r.index));return {...r,resolvedLevel:p&&!p.reason?p.level:null,reviewed:Object.prototype.hasOwnProperty.call(overrides,String(r.index)),needsReview:Boolean(p?.reason&&!p.originalReason)};});
}
function formatText(text,overrides){
  if(typeof text!=='string'||text.length>100000)throw Error('100,000자 이하의 글을 입력해 주세요.');
  const lines=text.split(/\r\n|\n|\r/),separators=text.match(/\r\n|\n|\r/g)||[];
  const result=formatRows(lines.map((text,index)=>({index,text,location:`${index+1}행`})),overrides);
  for(const row of result.rows)if(row.changed)lines[row.index]=row.after;
  return {...result,text:lines.map((line,i)=>line+(separators[i]||'')).join('')};
}
module.exports={parseItem,itemFor,marker,layout,formatRows,formatText,structureRows,nativeFormats,nativePatterns};
