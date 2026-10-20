'use strict';
// Deterministic local editing. Patch the selected XML text, never rebuild a document.
const {unzipSync,zipSync,strToU8,strFromU8}=require('fflate');
const {xml,parseDocument,excelDate}=require('./documents.cjs');
const crypto=require('node:crypto');
const {diffChars}=require('diff');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;');
const codePoint=n=>{try{return String.fromCodePoint(n);}catch{throw new Error('문서에 올바르지 않은 문자 참조가 있습니다. 원본 프로그램에서 수정해 주세요.');}};
const decode=s=>s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?codePoint(parseInt(v.slice(v[1]?.toLowerCase()==='x'?2:1),v[1]?.toLowerCase()==='x'?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[v]));
const fail=message=>{throw new Error(message);};
// UTF-8 only: re-encoding another charset would silently corrupt untouched text.
function utf8(bytes){const text=strFromU8(bytes);if(/^﻿?\s*<\?xml[^>]*\bencoding\s*=\s*["'](?!utf-?8["'])/i.test(text.slice(0,200))||Buffer.compare(Buffer.from(strToU8(text)),Buffer.from(bytes))!==0)fail('UTF-8이 아닌 문서는 원본 프로그램에서 수정해 주세요.');return text;}
// Shared formulas repeat <f> in every member cell; only array and data-table formulas own a whole range.
const rangeFormulas=tree=>tree.all.filter(n=>n.local==='f'&&['array','dataTable'].includes(attr(tree,n,'t'))&&attr(tree,n,'ref')).map(n=>attr(tree,n,'ref'));
const sharedTrees=new WeakMap();
function sharedStrings(files){if(!sharedTrees.has(files))sharedTrees.set(files,indexXml(utf8(files['xl/sharedStrings.xml'])));return sharedTrees.get(files);}
function archive(buffer){
  if(buffer.length>50*1024*1024)fail('50MB 이하 파일만 수정할 수 있습니다.');
  let size=0;const seen=new Set();
  const files=unzipSync(new Uint8Array(buffer),{filter:e=>{
    if(seen.has(e.name)||seen.size>=5000||/(^|\/)\.\.?(\/|$)|^[/\\]|\\|^(?:__proto__|constructor|prototype)$/.test(e.name))fail('안전하게 다시 저장할 수 없는 압축 구조입니다.');
    seen.add(e.name);size+=e.originalSize;
    if(e.originalSize>64*1024*1024||size>128*1024*1024)fail('수정 가능한 압축 해제 크기를 초과합니다.');
    return true;
  }});
  if(Object.keys(files).some(n=>/_xmlsignatures|(?:^|\/)signatures?[^/]*\.xml$/i.test(n)))fail('전자서명이 있는 문서는 원본 프로그램에서 수정해 주세요.');
  return files;
}
// Index validated XML while preserving original prefixes, attributes and untouched bytes.
function indexXml(source){
  if(source.length>16*1024*1024)fail('XML 크기가 수정 범위를 초과합니다.');
  xml(strToU8(source));const stack=[],all=[];
  const tokens=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w:.-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
  for(const m of source.matchAll(tokens)){
    if(/^<[!?]/.test(m[0]))continue;
    const name=m[0].match(/^<\/?([\w:.-]+)/)[1];
    if(m[0].startsWith('</')){const n=stack.pop();if(!n||n.name!==name)fail('XML 위치를 확인할 수 없습니다.');n.close=m.index;n.end=m.index+m[0].length;continue;}
    const n={name,local:name.split(':').pop(),start:m.index,open:m.index+m[0].length,children:[],parent:stack.at(-1)};
    n.parent?.children.push(n);all.push(n);
    if(/\/\s*>$/.test(m[0])){n.close=n.open;n.end=n.open;n.self=true;}else stack.push(n);
  }
  if(stack.length)fail('XML 위치를 확인할 수 없습니다.');
  return {source,all};
}
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
const nearest=(n,name)=>{for(let p=n.parent;p;p=p.parent)if(p.local===name)return p;return null;};
const attr=(tree,n,key)=>{const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=tree.source.slice(n.start,n.open).match(new RegExp('\\s'+escaped+'\\s*=\\s*(["\'])(.*?)\\1','s'));return m?decode(m[2]):null;};
const content=(tree,n)=>n.self?'':tree.source.slice(n.open,n.close);
function setAttr(open,key,value){
  const re=new RegExp('(\\s'+key+'\\s*=\\s*)(["\']).*?\\2','s');
  return re.test(open)?open.replace(re,(_m,p)=>p+'"'+value+'"'):open.replace(/\s*(\/?>)$/,` ${key}="${value}"$1`);
}
function textOf(tree,n){const raw=content(tree,n);if(n.children.length||raw.includes('<'))fail('개체나 특수 텍스트가 포함된 부분은 원본 프로그램에서 수정해 주세요.');return decode(raw);}
function patches(source,edits){
  let boundary=source.length;
  for(const [start,end,replacement] of edits.sort((a,b)=>b[0]-a[0])){if(end>boundary||start>end)fail('편집 범위가 겹칩니다.');source=source.slice(0,start)+replacement+source.slice(end);boundary=start;}
  return source;
}
function replaceContent(tree,n,value,preserveSpace=false){
  let open=tree.source.slice(n.start,n.open);
  if(preserveSpace)open=setAttr(open,'xml:space','preserve');
  if(n.self)open=open.replace(/\/\s*>$/, '>');
  return [n.start,n.end,open+escape(value)+`</${n.name}>`];
}
function editRuns(tree,textNodes,next){
  if(!textNodes.length)fail('수정할 텍스트를 찾을 수 없습니다.');
  const values=textNodes.map(n=>textOf(tree,n)),before=values.join('');
  const changes=diffChars(before,next,{timeout:300,maxEditLength:10000});
  if(!changes)fail('변경 범위가 너무 큽니다. 한 번에 수정할 내용을 줄여 주세요.');
  let total=0;const ends=values.map(value=>total+=value.length),updated=values.map(()=> '');
  const owner=offset=>{const i=ends.findIndex(end=>offset<end);return i<0?values.length-1:i;};
  let offset=0,removedAt=null;
  for(const change of changes){
    if(change.removed){removedAt??=offset;offset+=change.value.length;}
    else if(change.added)updated[owner(removedAt??offset)]+=change.value;
    else {removedAt=null;let rest=change.value;while(rest.length){const i=owner(offset),length=Math.min(rest.length,ends[i]-offset);if(length<=0)fail('글자 서식의 경계를 확인하지 못했습니다.');updated[i]+=rest.slice(0,length);rest=rest.slice(length);offset+=length;}}
  }
  return updated.flatMap((value,i)=>value===values[i]?[]:[replaceContent(tree,textNodes[i],value,tree.all[0]?.local!=='sec')]);
}
function hwpxTarget(tree,source){
  let paragraphs;
  if(source.kind==='hwpx-paragraph')paragraphs=[tree.all.filter(n=>n.local==='p')[source.index]];
  else {
    const table=tree.all.filter(n=>n.local==='tbl')[source.table];if(!table)fail('표를 찾을 수 없습니다.');
    const candidates=[];
    table.children.filter(n=>n.local==='tr').forEach((row,ri)=>row.children.filter(n=>n.local==='tc').forEach((cell,ci)=>{
      const addr=cell.children.find(n=>n.local==='cellAddr');
      if(Number(addr?attr(tree,addr,'rowAddr'):ri)===source.row&&Number(addr?attr(tree,addr,'colAddr'):ci)===source.column)candidates.push(cell);
    }));
    if(candidates.length!==1)fail('표 셀의 위치가 명확하지 않습니다.');
    const cell=candidates[0];if(descendants(cell).some(n=>n.local==='tbl'))fail('중첩 표가 있는 셀은 원본 프로그램에서 수정해 주세요.');
    paragraphs=descendants(cell).filter(n=>n.local==='p'&&nearest(n,'tc')===cell);
  }
  if(!paragraphs.length||paragraphs.some(n=>!n))fail('문단 위치를 찾을 수 없습니다.');
  const allowed=new Set(['run','t','linesegarray','lineseg']);
  for(const p of paragraphs){
    let openFields=0;for(const n of tree.all){if(n.start>=p.start)break;if(n.local==='fieldBegin')openFields++;if(n.local==='fieldEnd')openFields=Math.max(0,openFields-1);}
    // A section definition in the first paragraph is metadata, not editable text.
    const metadata=descendants(p).filter(n=>['secPr','colPr'].includes(n.local));
    if(metadata.some(n=>descendants(n).some(c=>['t','p'].includes(c.local))))fail('본문 외 텍스트가 포함된 문단은 원본 프로그램에서 수정해 주세요.');
    const metadataNodes=new Set(metadata.flatMap(n=>[n,...descendants(n)]));
    if(openFields||descendants(p).some(n=>!allowed.has(n.local)&&!metadataNodes.has(n)))fail('필드·개체가 있는 문단은 원본 프로그램에서 수정해 주세요.');
  }
  const groups=paragraphs.map(p=>descendants(p).filter(n=>n.local==='t'));
  const values=groups.map(group=>group.map(n=>textOf(tree,n)).join(''));
  if(values.some(v=>/[\r\n]/.test(v)))fail('특수 줄바꿈이 있는 문단은 원본 프로그램에서 수정해 주세요.');
  return {paragraphs,groups,values,text:values.join('\n'),type:'text',hint:paragraphs.length>1?'문단 사이의 줄바꿈을 유지해 주세요. 바뀐 부분의 기존 글자 서식을 사용합니다.':'라벨·단위·요일을 포함한 원문입니다. 필요한 부분만 수정해 주세요.'};
}
function inRange(ref,range){
  const point=s=>{const m=s?.replace(/\$/g,'').match(/^([A-Z]+)(\d+)$/);if(!m)return null;return [Array.from(m[1]).reduce((a,c)=>a*26+c.charCodeAt(0)-64,0),Number(m[2])];};
  const p=point(ref),parts=range.split(':'),a=point(parts[0]),b=point(parts[1]||parts[0]);
  return p&&a&&b&&p[0]>=a[0]&&p[0]<=b[0]&&p[1]>=a[1]&&p[1]<=b[1];
}
function xlsxTarget(files,tree,source){
  if(files['xl/metadata.xml']&&strFromU8(files['xl/metadata.xml']).includes('XLDAPR'))fail('동적 배열이 있는 통합 문서는 엑셀에서 수정해 주세요.');
  if(tree.all.some(n=>n.local==='sheetProtection'))fail('보호된 시트는 엑셀에서 보호 설정을 확인해 주세요.');
  const found=tree.all.filter(n=>n.local==='c'&&attr(tree,n,'r')===source.ref);if(found.length!==1)fail('셀 위치가 명확하지 않습니다.');
  const cell=found[0],formula=cell.children.find(n=>n.local==='f');
  if(formula||rangeFormulas(tree).some(range=>inRange(source.ref,range)))fail('수식 또는 배열 수식 셀입니다. 수량·단가 등 입력 셀을 수정하거나 엑셀에서 계산식을 편집해 주세요.');
  if(attr(tree,cell,'cm')||attr(tree,cell,'vm'))fail('확장 데이터가 있는 셀은 엑셀에서 수정해 주세요.');
  const value=cell.children.find(n=>n.local==='v'),type=attr(tree,cell,'t')||'n';
  if(type==='n'){
    if(!value||!Number.isFinite(Number(textOf(tree,value))))fail('숫자 셀의 원래 값을 확인할 수 없습니다.');
    const raw=textOf(tree,value);return {cell,value,type:source.date?'date':'number',text:source.date?excelDate(raw,source.date1904):raw,raw,hint:source.date?'날짜는 YYYY-MM-DD 형식으로 입력하세요. 기존 셀 서식과 시간 값은 유지합니다.':'단위와 쉼표 없이 숫자를 입력하세요. 기존 셀 서식은 유지합니다.'};
  }
  if(!['s','inlineStr'].includes(type))fail('이 셀 형식은 엑셀에서 수정해 주세요.');
  let stringTree=tree,stringNode=cell.children.find(n=>n.local==='is');
  if(type==='s'){
    if(!files['xl/sharedStrings.xml']||!value)fail('공유 문자열을 찾을 수 없습니다.');
    stringTree=sharedStrings(files);
    const i=Number(textOf(tree,value));if(!Number.isInteger(i)||i<0)fail('공유 문자열 번호가 올바르지 않습니다.');
    stringNode=stringTree.all.filter(n=>n.local==='si')[i];
  }
  if(!stringNode)fail('셀의 텍스트를 찾을 수 없습니다.');
  if(descendants(stringNode).some(n=>['rPh','phoneticPr'].includes(n.local)))fail('발음 정보가 있는 셀은 엑셀에서 수정해 주세요.');
  const textNodes=descendants(stringNode).filter(n=>n.local==='t');
  return {cell,value,shared:type==='s',stringTree,stringNode,textNodes,type:'text',text:textNodes.map(n=>textOf(stringTree,n)).join(''),hint:'선택한 셀만 수정합니다. 다른 셀에서 같은 문구를 사용해도 함께 바뀌지 않습니다.'};
}
function context(buffer,filePath){const parsed=parseDocument(buffer,filePath);return {files:archive(buffer),blocks:parsed.blocks.flatMap(b=>b.cells||[b]),trees:new Map()};}
function locate(ctx,source){
  if(!source||!['hwpx-paragraph','hwpx-cell','xlsx-cell'].includes(source.kind))fail('수정할 원문 위치를 찾을 수 없습니다.');
  const match=ctx.blocks.filter(b=>JSON.stringify(b.source)===JSON.stringify(source));
  if(match.length!==1)fail('수정할 위치가 명확하지 않습니다. 다시 검사해 주세요.');
  if(!ctx.files[source.part])fail('문서 본문을 찾을 수 없습니다.');
  if(!ctx.trees.has(source.part))ctx.trees.set(source.part,indexXml(utf8(ctx.files[source.part])));
  const tree=ctx.trees.get(source.part);
  const target=source.kind.startsWith('hwpx-')?hwpxTarget(tree,source):xlsxTarget(ctx.files,tree,source);
  if(target.text.length>10000)fail('10,000자를 넘는 문단·셀은 원본 프로그램에서 수정해 주세요.');
  return {tree,target};
}
function prepareEdit(buffer,filePath,source){
  const ctx=context(buffer,filePath),{tree,target}=locate(ctx,source);
  return {files:ctx.files,tree,target,text:target.text,type:target.type,hint:target.hint,sha256:hash(buffer)};
}
function officialStyle(ctx,tree,target,source){
  if(!['hwpx-paragraph','hwpx-cell'].includes(source.kind)||target.paragraphs.length!==1)fail('문단 위치를 확인해 주세요.');
  const p=target.paragraphs[0];
  if(source.kind==='hwpx-paragraph'&&p.parent?.local!=='sec')fail('본문 밖의 문단은 한글에서 정리해 주세요.');
  const bytes=ctx.files['Contents/header.xml'];if(!bytes)fail('문단 서식 정보를 찾을 수 없습니다.');
  if(!ctx.header)ctx.header=indexXml(utf8(bytes));const h=ctx.header;
  const style=h.all.find(n=>n.local==='paraPr'&&attr(h,n,'id')===attr(tree,p,'paraPrIDRef'));
  if(!style)fail('문단 서식 정보를 찾을 수 없습니다.');
  const ds=descendants(style),heading=ds.find(n=>n.local==='heading');
  if(!heading||!['NONE','NUMBER'].includes(attr(h,heading,'type')))fail('개요·글머리표는 원본 번호 설정을 유지합니다.');
  let native=null;
  if(attr(h,heading,'type')==='NUMBER'){
    const id=attr(h,heading,'idRef'),numbering=h.all.find(n=>n.local==='numbering'&&n.parent?.local==='numberings'&&attr(h,n,'id')===id);
    const level=Number(attr(h,heading,'level'))+1;
    if(!numbering||attr(h,heading,'level')===null||!Number.isInteger(level)||level<1||level>8)fail('자동 번호 정의 또는 단계를 확인할 수 없습니다.');
    const {nativeFormats,nativePatterns}=require('../../../src/official-format.cjs');
    const heads=numbering.children.filter(n=>n.local==='paraHead');
    if(!heads.length||heads.some(n=>n.children.length))fail('복잡한 자동 번호 정의는 원본 설정을 유지합니다.');
    const standard=nativeFormats.every((fmt,i)=>{const head=heads.find(n=>Number(attr(h,n,'level'))===i+1);return head&&attr(h,head,'numFormat')===fmt&&textOf(h,head)===nativePatterns[i];});
    native={id,level,standard};
  }
  const margins=ds.filter(n=>n.local==='margin');
  if(!margins.length||margins.some(n=>!['left','intent'].every(key=>n.children.some(c=>c.local===key&&attr(h,c,'unit')==='HWPUNIT'))))fail('이 문단의 들여쓰기 단위는 한글에서 조정해 주세요.');
  const run=target.groups[0][0]?.parent,char=h.all.find(n=>n.local==='charPr'&&attr(h,n,'id')===attr(tree,run,'charPrIDRef'));
  const fontHeight=Number(char&&attr(h,char,'height'));if(!Number.isInteger(fontHeight)||fontHeight<100||fontHeight>10000)fail('글자 크기를 확인할 수 없어 문단 서식을 유지합니다.');
  // Hancom 2016+ uses the HwpUnitChar case; legacy fallback margins are doubled on resave.
  const unitCase=ds.find(n=>n.local==='case'&&/\brequired-namespace\s*=\s*["']http:\/\/www\.hancom\.co\.kr\/hwpml\/2016\/HwpUnitChar["']/.test(h.source.slice(n.start,n.open)));
  const activeMargins=unitCase?margins.filter(n=>nearest(n,'case')===unitCase):margins;
  if(!activeMargins.length)fail('적용할 문단 여백 정보를 찾을 수 없습니다.');
  const values=key=>activeMargins.map(n=>Number(attr(h,n.children.find(c=>c.local===key),'value')));
  const lefts=values('left'),intents=values('intent');
  return {p,h,style,heading,native,unitCase,fontHeight,left:lefts.every(v=>v===lefts[0])?lefts[0]:null,intent:intents.every(v=>v===intents[0])?intents[0]:null};
}
function officialRows(buffer,filePath,changes=[]){
  if(!/\.hwpx$/i.test(filePath))fail('공문 항목 정리는 텍스트와 HWPX에서 사용할 수 있습니다.');
  if(!Array.isArray(changes)||changes.length>100)fail('수정한 문단은 한 번에 100개까지 정리할 수 있습니다.');
  const ctx=context(buffer,filePath),blocks=ctx.blocks.filter(b=>b.text),updates=new Map();
  for(const e of changes){if(!Number.isInteger(e.index)||!blocks[e.index]||updates.has(e.index)||typeof e.text!=='string'||e.text.length>10000)fail('수정할 문단을 확인해 주세요.');updates.set(e.index,e.text);}
  return blocks.flatMap((b,index)=>{
    const scope=b.source.kind==='hwpx-cell'?`${b.source.part}:table${b.source.table}:r${b.source.row}:c${b.source.column}`:b.source.part;
    const row={index,blockIndex:index,text:updates.get(index)??b.text,location:b.location,part:b.source.part,scope,document:true};
    try{
      const {tree,target}=locate(ctx,b.source),texts=(updates.get(index)??target.text).split('\n');
      if(texts.length!==target.paragraphs.length)fail('원래 셀의 문단 수를 유지해 주세요.');
      return target.paragraphs.map((p,i)=>{
        const single={paragraphs:[p],groups:[target.groups[i]]};
        const sub={...row,index:b.source.kind==='hwpx-cell'?`${index}:${i}`:index,paragraph:i,text:texts[i],original:target.text,location:b.source.kind==='hwpx-cell'?`${b.location} · 문단 ${i+1}`:b.location};
        try{const style=officialStyle(ctx,tree,single,b.source);const offset=style.left+style.intent,indent=offset/style.fontHeight*2;return {...sub,native:style.native,fontHeight:style.fontHeight,left:style.left,intent:style.intent,paragraphIndent:offset>=0&&Math.abs(indent-Math.round(indent))<0.05?Math.round(indent):null};}
        catch(e){return {...sub,reason:e.message};}
      });
    }catch(e){return [{...row,reason:e.message}];}
  });
}
function cloneNumbering(ctx,sourceId,scope,styles){
  const key=JSON.stringify([sourceId,scope]);if(styles.numberCache.has(key))return styles.numberCache.get(key);
  const h=ctx.header,n=h.all.find(n=>n.local==='numbering'&&n.parent?.local==='numberings'&&attr(h,n,'id')===sourceId);
  if(!n)fail('자동 번호 정의를 찾을 수 없습니다.');
  const {nativeFormats,nativePatterns}=require('../../../src/official-format.cjs');
  const id=styles.nextNumber++,offset=n.start,raw=h.source.slice(n.start,n.end),changes=[[0,n.open-offset,setAttr(h.source.slice(n.start,n.open),'id',String(id))]];
  const heads=n.children.filter(c=>c.local==='paraHead'),base=heads[0];if(!base)fail('자동 번호 단계가 없습니다.');
  const missing=[];
  for(let i=0;i<8;i++){
    const head=heads.find(c=>Number(attr(h,c,'level'))===i+1)||base;
    let open=h.source.slice(head.start,head.open);open=setAttr(setAttr(open,'level',String(i+1)),'numFormat',nativeFormats[i]);
    open=open.replace(/\/\s*>$/, '>');const value=open+nativePatterns[i]+`</${head.name}>`;
    if(head===base&&Number(attr(h,base,'level'))!==i+1)missing.push(value);else changes.push([head.start-offset,head.end-offset,value]);
  }
  if(missing.length)changes.push([n.close-offset,n.close-offset,missing.join('')]);
  styles.numberFragments.push(patches(raw,changes));styles.numberCache.set(key,id);return id;
}
function officialPatches(ctx,tree,target,source,text,format,styles){
  const {parseItem,layout}=require('../../../src/official-format.cjs'),item=parseItem(text);
  if(!format||!Number.isInteger(format.level)||format.level<1||format.level>8||!format.native&&(!item||item.level!==format.level||item.token!==format.token||item.indent))fail('항목 내용이 변경되었습니다. 공문 항목 정리를 다시 실행해 주세요.');
  const s=officialStyle(ctx,tree,target,source);
  if(Boolean(format.native)!==Boolean(s.native))fail('자동 번호 상태가 변경되었습니다. 다시 검사해 주세요.');
  const wanted=format.native?{left:s.left,intent:s.intent}:layout(format.level,format.token,s.fontHeight);
  if(!format.native&&s.left===wanted.left&&s.intent===wanted.intent)return [];
  const actualScope=source.kind==='hwpx-cell'?`${source.part}:table${source.table}:r${source.row}:c${source.column}`:source.part;
  const numberId=format.native?cloneNumbering(ctx,s.native.id,actualScope,styles):null;
  if(format.native){const key=JSON.stringify([s.native.id,actualScope]);if(!styles.nativeUsed.has(key))styles.nativeUsed.set(key,{part:source.part,source,positions:new Set()});styles.nativeUsed.get(key).positions.add(s.p.start);}
  const key=JSON.stringify([attr(s.h,s.style,'id'),wanted,numberId,format.level]);let id=styles.cache.get(key);
  if(id===undefined){
    id=styles.next++;styles.cache.set(key,id);
    const offset=s.style.start,raw=s.h.source.slice(offset,s.style.end);
    const changes=[[0,s.style.open-offset,setAttr(s.h.source.slice(offset,s.style.open),'id',String(id))]];
    if(!format.native)for(const margin of descendants(s.style).filter(n=>n.local==='margin'))for(const n of margin.children)if(n.local==='left'||n.local==='intent'){const scale=s.unitCase&&nearest(margin,'default')?.parent===s.unitCase.parent?2:1;changes.push([n.start-offset,n.open-offset,setAttr(s.h.source.slice(n.start,n.open),'value',String(wanted[n.local]*scale))]);}
    if(format.native){let open=s.h.source.slice(s.heading.start,s.heading.open);open=setAttr(setAttr(open,'idRef',String(numberId)),'level',String(format.level-1));changes.push([s.heading.start-offset,s.heading.open-offset,open]);}
    styles.fragments.push(patches(raw,changes));
  }
  const result=[[s.p.start,s.p.open,setAttr(tree.source.slice(s.p.start,s.p.open),'paraPrIDRef',String(id))]];
  if(text===target.text)for(const n of s.p.children.filter(n=>n.local==='linesegarray'))result.push([n.start,n.end,'']);
  return result;
}
function clearFormulaCaches(files){
  let changed=false;
  for(const name of Object.keys(files).filter(n=>/^xl\/worksheets\/[^/]+\.xml$/.test(n))){
    const tree=indexXml(utf8(files[name])),edits=[];
    const ranges=rangeFormulas(tree);
    for(const cell of tree.all.filter(n=>n.local==='c'))if(cell.children.some(n=>n.local==='f')||ranges.some(range=>inRange(attr(tree,cell,'r'),range)))for(const v of cell.children.filter(n=>n.local==='v'))edits.push([v.start,v.end,'']);
    if(edits.length){files[name]=strToU8(patches(tree.source,edits));changed=true;}
  }
  if(changed){
    const tree=indexXml(utf8(files['xl/workbook.xml'])),calc=tree.all.find(n=>n.local==='calcPr');
    if(calc){let open=tree.source.slice(calc.start,calc.open);for(const [k,v] of Object.entries({calcMode:'auto',fullCalcOnLoad:'1',forceFullCalc:'1'}))open=setAttr(open,k,v);files['xl/workbook.xml']=strToU8(patches(tree.source,[[calc.start,calc.open,open]]));}
    else {const root=tree.all[0],prefix=root.name.includes(':')?root.name.split(':')[0]+':':'';const before=root.children.find(n=>['oleSize','customWorkbookViews','pivotCaches','smartTagPr','smartTagTypes','webPublishing','fileRecoveryPr','webPublishObjects','extLst'].includes(n.local));const at=before?.start??root.close;files['xl/workbook.xml']=strToU8(patches(tree.source,[[at,at,`<${prefix}calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`]]));}
  }
  return changed;
}
function refreshHwpxPreview(files){
  const textParts=[];
  for(const name of Object.keys(files).filter(n=>/^Contents\/section\d+\.xml$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
    const doc=xml(files[name]);
    for(const p of Array.from(doc.getElementsByTagNameNS('*','p'))){
      const values=Array.from(p.getElementsByTagNameNS('*','t')).filter(t=>{for(let q=t.parentNode;q;q=q.parentNode)if(q.localName==='p')return q===p;return false;}).map(t=>t.textContent||'');
      if(values.length)textParts.push(values.join(''));
    }
  }
  for(const name of Object.keys(files).filter(n=>/^Preview\/PrvText\.txt$/i.test(n)))files[name]=strToU8(Array.from(textParts.join('\r\n')).slice(0,4096).join(''));
  let staleImage=false;
  for(const name of Object.keys(files).filter(n=>/^Preview\/PrvImage\./i.test(n))){
    const referenced=Object.entries(files).some(([part,bytes])=>/\.(?:xml|hpf|rdf)$/i.test(part)&&strFromU8(bytes).toLowerCase().includes(name.split('/').at(-1).toLowerCase()));
    if(referenced)staleImage=true;else delete files[name];
  }
  return staleImage;
}
function editsFor(tree,target,source,next){
  if(typeof next!=='string'||!next.trim()||next.length>10000||/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(next))fail('저장할 내용을 확인해 주세요. 빈 값·제어 문자·10,000자 초과 내용은 저장할 수 없습니다.');
  if(next===target.text)fail('변경한 내용이 없습니다.');
  const edits=[];
  if(source.kind.startsWith('hwpx-')){
    const parts=next.replace(/\r\n/g,'\n').split('\n');if(parts.length!==target.groups.length)fail('원래 문단 수를 유지해 주세요. 문단 추가·삭제는 한글에서 할 수 있습니다.');
    target.groups.forEach((group,i)=>{if(parts[i]!==target.values[i]){edits.push(...editRuns(tree,group,parts[i]));for(const n of target.paragraphs[i].children.filter(n=>n.local==='linesegarray'))edits.push([n.start,n.end,'']);}});
  }else if(target.type==='number'||target.type==='date'){
    let value=next.trim();
    if(target.type==='number'){if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)||!Number.isFinite(Number(value)))fail('단위와 쉼표 없이 유효한 숫자를 입력해 주세요.');}
    else {const date=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value||value<(source.date1904?'1904-01-01':'1900-03-01'))fail('유효한 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');const epoch=source.date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);value=String((date.getTime()-epoch)/86400000+Number(target.raw)%1);}
    edits.push(replaceContent(tree,target.value,value));
  }else if(target.shared){
    const st=target.stringTree,n=target.stringNode;
    const innerEdits=editRuns(st,target.textNodes,next);const patched=patches(st.source,innerEdits);const newTree=indexXml(patched),newNode=newTree.all.filter(x=>x.local==='si')[st.all.filter(x=>x.local==='si').indexOf(n)];
    const prefix=newNode.name.includes(':')?newNode.name.split(':')[0]+':':'';
    const declarations=st.source.slice(st.all[0].start,st.all[0].open).match(/\sxmlns(?::[\w.-]+)?\s*=\s*(?:"[^"]*"|'[^']*')/g)||[];
    const inline=`<${prefix}is${declarations.join('')}>${content(newTree,newNode)}</${prefix}is>`;
    const open=setAttr(tree.source.slice(target.cell.start,target.cell.open),'t','inlineStr');
    edits.push([target.cell.start,target.cell.open,open],[target.value.start,target.value.end,inline]);
  }else edits.push(...editRuns(tree,target.textNodes,next));
  if(!edits.length)fail('변경한 내용이 없습니다.');
  return edits;
}
// One unzip, validation and zip for the whole batch: per-edit rebuilds made 100 edits time out on long documents.
function applyEdits(buffer,filePath,changes,expectedHash){
  if(expectedHash&&hash(buffer)!==expectedHash)fail('검사 후 원본 파일이 변경되었습니다. 다시 검사한 뒤 수정해 주세요.');
  if(!Array.isArray(changes)||!changes.length||changes.length>100)fail('한 번에 수정한 문단·셀 1~100개를 저장할 수 있습니다.');
  const ctx=context(buffer,filePath),files=ctx.files,byPart=new Map(),styles={cache:new Map(),fragments:[],next:0,numberCache:new Map(),numberFragments:[],nextNumber:0,nativeUsed:new Map()},seen=new Set();
  if(changes.some(c=>c.format)){
    if(!files['Contents/header.xml'])fail('문단 서식을 찾을 수 없습니다.');
    ctx.header=indexXml(utf8(files['Contents/header.xml']));
    styles.next=Math.max(-1,...ctx.header.all.filter(n=>n.local==='paraPr').map(n=>Number(attr(ctx.header,n,'id'))))+1;
    styles.nextNumber=Math.max(0,...ctx.header.all.filter(n=>n.local==='numbering'&&n.parent?.local==='numberings').map(n=>Number(attr(ctx.header,n,'id'))))+1;
    if(!Number.isSafeInteger(styles.next))fail('문단 서식 번호가 올바르지 않습니다.');
  }
  for(const {source,text,format} of changes){
    const key=JSON.stringify(source);if(seen.has(key))fail('편집 범위가 겹칩니다.');seen.add(key);
    const {tree,target}=locate(ctx,source);if(!byPart.has(source.part))byPart.set(source.part,[]);
    if(text!==target.text||!format)byPart.get(source.part).push(...editsFor(tree,target,source,text));
    if(format){
      const entries=Array.isArray(format)?format:[format],used=new Set(),texts=text.replace(/\r\n/g,'\n').split('\n');
      if(!entries.length||entries.length>target.paragraphs?.length)fail('문단 서식 개수를 확인해 주세요.');
      for(const entry of entries){
        const i=entry.paragraph??0;if(!Number.isInteger(i)||i<0||i>=target.paragraphs.length||used.has(i))fail('문단 서식 위치가 올바르지 않습니다.');used.add(i);
        const single={...target,paragraphs:[target.paragraphs[i]],groups:[target.groups[i]],values:[target.values[i]],text:target.values[i]};
        byPart.get(source.part).push(...officialPatches(ctx,tree,single,source,texts[i],entry,styles));
      }
    }
  }
  for(const [key,used] of styles.nativeUsed){
    const [numberId]=JSON.parse(key),h=ctx.header,tree=ctx.trees.get(used.part);
    const shared=new Set(h.all.filter(n=>n.local==='paraPr'&&n.children.some(c=>c.local==='heading'&&attr(h,c,'type')==='NUMBER'&&attr(h,c,'idRef')===numberId)).map(n=>attr(h,n,'id')));
    const cell=used.source.kind==='hwpx-cell'?nearest(tree.all.find(n=>n.local==='p'&&used.positions.has(n.start)),'tc'):null;
    const all=tree.all.filter(n=>n.local==='p'&&shared.has(attr(tree,n,'paraPrIDRef'))&&(cell?nearest(n,'tc')===cell:n.parent?.local==='sec'));
    if(all.some(n=>!used.positions.has(n.start)))fail('같은 자동 번호 목록의 모든 문단을 함께 정리해야 합니다. 제외된 문단을 확인해 주세요.');
  }
  if(styles.fragments.length){
    const h=ctx.header,container=h.all.find(n=>n.local==='paraProperties');if(!container||container.self)fail('문단 서식 목록을 찾을 수 없습니다.');
    const count=container.children.filter(n=>n.local==='paraPr').length+styles.fragments.length;
    const headerChanges=[[container.start,container.open,setAttr(h.source.slice(container.start,container.open),'itemCnt',String(count))],[container.close,container.close,styles.fragments.join('')]];
    if(styles.numberFragments.length){const ns=h.all.find(n=>n.local==='numberings');if(!ns||ns.self)fail('자동 번호 목록을 찾을 수 없습니다.');headerChanges.push([ns.start,ns.open,setAttr(h.source.slice(ns.start,ns.open),'itemCnt',String(ns.children.filter(n=>n.local==='numbering').length+styles.numberFragments.length))],[ns.close,ns.close,styles.numberFragments.join('')]);}
    files['Contents/header.xml']=strToU8(patches(h.source,headerChanges));
  }
  for(const [part,edits] of byPart)files[part]=strToU8(patches(ctx.trees.get(part).source,edits));
  let recalculate=false,stalePreview=false;
  if(changes[0].source.kind==='xlsx-cell')recalculate=clearFormulaCaches(files);
  else stalePreview=refreshHwpxPreview(files);
  for(const [name,bytes] of Object.entries(files))if(/\.xml$/i.test(name))xml(bytes);
  const output=Object.create(null);
  if(files.mimetype)output.mimetype=[files.mimetype,{level:0}];
  for(const [name,bytes] of Object.entries(files))if(name!=='mimetype')output[name]=name==='version.xml'?[bytes,{level:0}]:bytes;
  const result=Buffer.from(zipSync(output,{level:6}));
  if(result.length>50*1024*1024)fail('수정본이 50MB를 초과합니다. 원본 프로그램에서 저장해 주세요.');
  const verify=context(result,filePath);
  for(const {source,text} of changes){const {target}=locate(verify,source);if(target.type!=='number'&&target.type!=='date'&&target.text!==text.replace(/\r\n/g,'\n'))fail('수정본의 내용을 확인하지 못했습니다. 파일을 저장하지 않았습니다.');}
  return {buffer:result,recalculate,stalePreview};
}
function applyEdit(buffer,filePath,source,next,expectedHash){return applyEdits(buffer,filePath,[{source,text:next}],expectedHash);}
module.exports={prepareEdit,applyEdit,applyEdits,hash,indexXml,officialRows};
