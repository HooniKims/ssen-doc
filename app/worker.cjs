'use strict';
const {parentPort}=require('node:worker_threads'),fs=require('node:fs');
const {scan}=require('../src/checker.cjs');
const {parseDocument}=require('../modules/review/src/documents.cjs'),{prepareEdit,applyEdits,hash}=require('../modules/review/src/document-edit.cjs');
// Unknown words are not spelling errors. Do not emit frequency-list guesses.
function inspect(text){return scan(text);}
parentPort.on('message',({id,action,data})=>{try{
 let result;
 if(action==='scan')result={issues:inspect(data.text,data.userWords)};
 else{
  const {filePath,expectedHash}=data;if(fs.statSync(filePath).size>50*1024**2)throw Error('50MB 이하의 문서만 검사할 수 있습니다.');let bytes=fs.readFileSync(filePath);if(expectedHash&&hash(bytes)!==expectedHash)throw Error('검사 후 원본 파일이 변경되었습니다. 다시 불러와 주세요.');const doc=parseDocument(bytes,filePath),blocks=doc.blocks.flatMap(b=>b.cells||[b]).filter(b=>b.text);
  if(action==='document')result={name:doc.name,hash:doc.sha256,warnings:doc.warnings,blocks:blocks.map((b,index)=>({index,text:b.text,location:b.location,issues:scan(b.text.slice(0,100000))}))};
  else if(action==='prepare'){const b=blocks[data.index];if(!b)throw Error('문단을 찾을 수 없습니다.');try{const p=prepareEdit(bytes,filePath,b.source);result={text:p.text,editable:p.type==='text',hint:p.type==='text'?p.hint:'숫자·날짜 셀은 문서 대조 메뉴에서 수정하세요.'};}catch(e){result={text:b.text,editable:false,hint:e.message};}}
  else if(action==='save-document'){
   if(!Array.isArray(data.edits)||!data.edits.length||data.edits.length>100)throw Error('한 번에 수정한 문단·셀 1~100개를 저장할 수 있습니다.');const seen=new Set();
   for(const edit of data.edits){if(!Number.isInteger(edit.index)||seen.has(edit.index)||!blocks[edit.index])throw Error('수정 위치가 올바르지 않습니다.');seen.add(edit.index);}
   result=applyEdits(bytes,filePath,data.edits.map(edit=>({source:blocks[edit.index].source,text:edit.text})));
  }else throw Error('지원하지 않는 작업입니다.');
 }
 parentPort.postMessage({id,ok:true,...result});
}catch(e){parentPort.postMessage({id,ok:false,error:e.message});}});
