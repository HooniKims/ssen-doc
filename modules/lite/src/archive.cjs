'use strict';
const yauzl=require('yauzl'),crc32=require('buffer-crc32');
const {DOMParser}=require('@xmldom/xmldom');
const LIMITS=Object.freeze({file:500*1024*1024,total:1024*1024*1024,entry:256*1024*1024,xml:32*1024*1024,count:10000});
async function openArchive(file){
  const zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,autoClose:false,validateEntrySizes:true,strictFileNames:true},(e,z)=>e?reject(Error('HWPX 파일을 읽을 수 없습니다. 파일이 손상되었거나 다른 형식인지 확인해 주세요.')):resolve(z)));
  try{
    const entries=[],names=new Set();let total=0;
    await new Promise((resolve,reject)=>{
      zip.on('error',reject);zip.once('end',resolve);
      zip.on('entry',entry=>{
        try{
          const name=entry.fileName;
          if(names.has(name)||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..'))throw Error('중복되거나 잘못된 내부 파일 경로입니다.');
          if(entry.isEncrypted())throw Error('암호화된 문서는 처리할 수 없습니다.');
          if(![0,8].includes(entry.compressionMethod))throw Error('지원하지 않는 ZIP 압축 방식입니다.');
          if(/signature|encryption/i.test(name)&&/^META-INF\//i.test(name))throw Error('서명 또는 암호화 정보가 있는 문서는 처리할 수 없습니다.');
          total+=entry.uncompressedSize;
          if(entry.uncompressedSize>LIMITS.entry||total>LIMITS.total||entries.length>=LIMITS.count)throw Error('문서 내부 데이터가 처리 한도를 초과합니다.');
          names.add(name);entries.push(entry);zip.readEntry();
        }catch(e){reject(e);}
      });zip.readEntry();
    });
    const byName=new Map(entries.map(e=>[e.fileName,e]));
    for(const name of ['mimetype','Contents/content.hpf','Contents/header.xml'])if(!byName.has(name))throw Error('필수 구성 파일이 없는 HWPX 문서입니다.');
    if(!entries.some(e=>/^Contents\/section\d+\.xml$/.test(e.fileName)))throw Error('본문 구역이 없는 문서입니다.');
    return {zip,entries,byName,close:()=>zip.close(),read:entry=>readEntry(zip,typeof entry==='string'?byName.get(entry):entry)};
  }catch(e){zip.close();throw e;}
}
async function readEntry(zip,entry){
  if(!entry)throw Error('참조한 내부 파일이 없습니다.');
  if(/\.(xml|hpf)$/i.test(entry.fileName)&&entry.uncompressedSize>LIMITS.xml)throw Error('문서 XML 크기가 처리 한도를 초과합니다.');
  const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(e,s)=>e?reject(e):resolve(s)));
  const parts=[];let length=0;
  for await(const chunk of stream){length+=chunk.length;if(length>entry.uncompressedSize||length>LIMITS.entry){stream.destroy();throw Error('내부 파일의 크기 정보가 잘못되었습니다.');}parts.push(chunk);}
  const buffer=Buffer.concat(parts,length);
  if(length!==entry.uncompressedSize||crc32.unsigned(buffer)!==entry.crc32)throw Error(`손상된 내부 파일: ${entry.fileName}`);
  return buffer;
}
function parseXml(buffer,name){
  const text=buffer.toString('utf8');
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error(`${name}: 외부 엔터티를 포함한 XML은 지원하지 않습니다.`);
  let problem;
  const doc=new DOMParser({onError:(level,message)=>{problem=message;}}).parseFromString(text,'application/xml');
  if(problem||!doc?.documentElement)throw Error(`${name}: 올바르지 않은 XML입니다.`);
  return doc;
}
module.exports={LIMITS,openArchive,parseXml};
