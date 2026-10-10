'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
function parseManifest(xml,executable=path.join(__dirname,'../native/bin/ssen-hwpx.exe')){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let bytes=0,finished=false;
    const done=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();done(Error('문서 목록 읽기 시간이 초과되었습니다.'));},15000);
    child.on('error',()=>done(Error('OpenHWP 문서 엔진을 실행할 수 없습니다. 앱을 다시 설치해 주세요.')));
    child.stdin.on('error',()=>{});child.stderr.resume();
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){child.kill();done(Error('문서 파일 목록이 너무 큽니다.'));}else chunks.push(chunk);});
    child.on('close',code=>{
      if(code!==0)return done(Error('OpenHWP가 문서의 파일 목록을 읽지 못했습니다.'));
      try{const items=JSON.parse(Buffer.concat(chunks).toString('utf8'));done(null,items.map(item=>({id:item['@id'],href:item['@href'],mediaType:item['@media-type']})));}catch{done(Error('문서 엔진의 응답을 읽지 못했습니다.'));}
    });child.stdin.end(xml);
  });
}
function resolveItem(href,entries){
  if(typeof href!=='string'||/[?#\\]/.test(href)||/^[a-z]+:/i.test(href))return null;
  let decoded;try{decoded=decodeURIComponent(href);}catch{return null;}
  const normalized=path.posix.normalize(decoded);
  for(const candidate of [normalized,path.posix.normalize(path.posix.join('Contents',decoded))]){
    if(!candidate.startsWith('../')&&!candidate.startsWith('/')&&entries.has(candidate))return candidate;
  }
  return null;
}
module.exports={parseManifest,resolveItem};
