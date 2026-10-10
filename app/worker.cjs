'use strict';
const {parentPort}=require('node:worker_threads'),fs=require('node:fs');
const {scan}=require('../src/rules/rule-engine.cjs'),{Dictionary}=require('../src/dictionary/spell-suggest.cjs');
const {parseDocument}=require('../modules/review/src/documents.cjs'),{prepareEdit,applyEdit,hash}=require('../modules/review/src/document-edit.cjs');
let dictionary;
function inspect(text,userWords=[]){const issues=scan(text);dictionary??=new Dictionary();return [...issues,...dictionary.scan(text,issues,userWords)].sort((a,b)=>a.start-b.start);}
parentPort.on('message',({id,action,data})=>{try{
 let result;
 if(action==='scan')result={issues:inspect(data.text,data.userWords)};
 else{
  const {filePath,expectedHash}=data;if(fs.statSync(filePath).size>50*1024**2)throw Error('50MB 이하의 문서만 검사할 수 있습니다.');let bytes=fs.readFileSync(filePath);if(expectedHash&&hash(bytes)!==expectedHash)throw Error('검사 후 원본 파일이 변경되었습니다. 다시 불러와 주세요.');const doc=parseDocument(bytes,filePath),blocks=doc.blocks.flatMap(b=>b.cells||[b]).filter(b=>b.text);
  if(action==='document')result={name:doc.name,hash:doc.sha256,warnings:doc.warnings,blocks:blocks.map((b,index)=>({index,text:b.text,location:b.location,issues:scan(b.text.slice(0,100000))}))};
  else if(action==='prepare'){const b=blocks[data.index];if(!b)throw Error('문단을 찾을 수 없습니다.');try{const p=prepareEdit(bytes,filePath,b.source);result={text:p.text,editable:p.type==='text',hint:p.type==='text'?p.hint:'숫자·날짜 셀은 문서 대조 메뉴에서 수정하세요.'};}catch(e){result={text:b.text,editable:false,hint:e.message};}}
  else if(action==='save-document'){
   if(!Array.isArray(data.edits)||!data.edits.length||data.edits.length>100)throw Error('한 번에 수정한 문단·셀 1~100개를 저장할 수 있습니다.');const seen=new Set();let recalculate=false,stalePreview=false;
   for(const edit of data.edits){if(!Number.isInteger(edit.index)||seen.has(edit.index)||!blocks[edit.index])throw Error('수정 위치가 올바르지 않습니다.');seen.add(edit.index);const result=applyEdit(bytes,filePath,blocks[edit.index].source,edit.text);bytes=result.buffer;recalculate||=result.recalculate;stalePreview||=result.stalePreview;}
   result={buffer:bytes,recalculate,stalePreview};
  }else throw Error('지원하지 않는 작업입니다.');
 }
 parentPort.postMessage({id,ok:true,...result});
}catch(e){parentPort.postMessage({id,ok:false,error:e.message});}});
