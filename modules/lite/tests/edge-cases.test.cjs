'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createWriteStream}=require('node:fs'),{pipeline}=require('node:stream/promises');
const yazl=require('yazl'),sharp=require('sharp');
const {optimizeFile}=require('../src/optimizer.cjs');
const {openArchive,LIMITS}=require('../src/archive.cjs');

async function directory(t){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'ssen-edge-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));return folder;}
async function fixture(folder,{items='',section='<sec/>',extra=[],compressionLevel=6}={}){
  const entries=[['mimetype','application/hwp+zip'],['Contents/content.hpf',`<package><manifest>${items}</manifest></package>`],['Contents/header.xml','<head/>'],['Contents/section0.xml',section],...extra];
  const input=path.join(folder,'input.hwpx'),zip=new yazl.ZipFile(),writing=pipeline(zip.outputStream,createWriteStream(input));
  for(const [name,data] of entries)zip.addBuffer(Buffer.isBuffer(data)?data:Buffer.from(data),name,{compressionLevel:name==='mimetype'?0:compressionLevel});
  zip.end();await writing;return input;
}
const item=(id,href,type='image/png')=>`<item id="${id}" href="${href}" media-type="${type}"/>`;
const image=()=>sharp({create:{width:2600,height:220,channels:4,background:{r:21,g:146,b:77,alpha:.45}}}).png({compressionLevel:0}).toBuffer();
async function identicalEntries(input,output,except=[]){
  const a=await openArchive(input),b=await openArchive(output);
  try{assert.deepEqual(a.entries.map(e=>e.fileName).sort(),b.entries.map(e=>e.fileName).sort());for(const e of a.entries)if(!except.includes(e.fileName))assert.deepEqual(await a.read(e),await b.read(e.fileName),e.fileName);}
  finally{a.close();b.close();}
}
async function rejectClean(input,pattern){const source=await fs.readFile(input);await assert.rejects(optimizeFile(input),pattern);assert.deepEqual(await fs.readFile(input),source);assert.deepEqual(await fs.readdir(path.dirname(input)),['input.hwpx']);}
async function patchCentral(input,name,patch){
  const bytes=await fs.readFile(input);let found=false;
  for(let i=0;i+46<=bytes.length;i++)if(bytes.readUInt32LE(i)===0x02014b50){const n=bytes.readUInt16LE(i+28);if(bytes.subarray(i+46,i+46+n).toString('utf8')===name){patch(bytes,i);found=true;break;}}
  assert.ok(found,`central directory entry ${name}`);await fs.writeFile(input,bytes);
}

test('repeated picture references and different IDs sharing an href optimize the payload once',async t=>{
  const folder=await directory(t),png=await image();
  const input=await fixture(folder,{items:item('picture','BinData/image.png')+item('alias','BinData/image.png'),section:'<sec><picture binaryItemIDRef="picture"/><table><cell><picture binaryItemIDRef="picture"/></cell></table><picture binaryItemIDRef="alias"/></sec>',extra:[['BinData/image.png',png],['BinData/object.ole',Buffer.from([0,255,1,3,0,17])],['Scripts/document.js','const untouched = "x";'],['Preview/PrvText.txt','Original preview']]});
  const result=await optimizeFile(input,{preset:'small'});assert.equal(result.images,1);assert.equal(result.changed,1);assert.ok(result.saved>0);
  await identicalEntries(input,result.path,['BinData/image.png']);
});

test('manifest relative, root and percent-encoded Korean image paths resolve without changing XML',async t=>{
  const png=await image();
  for(const [href,name] of [['../BinData/image.png','BinData/image.png'],['BinData/image.png','BinData/image.png'],['../BinData/'+encodeURIComponent('사진 1.png'),'BinData/사진 1.png'],['media/image.png','Contents/media/image.png']]){
    await t.test(href,async sub=>{const folder=await directory(sub),input=await fixture(folder,{items:item('i',href),section:'<sec><pic binaryItemIDRef="i"/></sec>',extra:[[name,png]]});const result=await optimizeFile(input,{preset:'small'});assert.equal(result.images,1);assert.equal(result.changed,1);await identicalEntries(input,result.path,[name]);});
  }
});

test('duplicate manifest IDs and duplicate ZIP names are rejected without any output',async t=>{
  await t.test('manifest IDs',async sub=>{const folder=await directory(sub),input=await fixture(folder,{items:item('i','BinData/a.png')+item('i','BinData/b.png'),extra:[['BinData/a.png','a'],['BinData/b.png','b']]});await rejectClean(input,/중복 ID/);});
  await t.test('ZIP names',async sub=>{const folder=await directory(sub),input=await fixture(folder,{extra:[['Contents/header.xml','<other/>']]});await rejectClean(input,/중복/);});
});

test('CRC damage in image and non-image payloads rejects the whole document and removes temporary files',async t=>{
  for(const name of ['BinData/image.png','BinData/object.ole','Contents/section0.xml'])await t.test(name,async sub=>{
    const folder=await directory(sub),input=await fixture(folder,{items:item('i','BinData/image.png'),extra:[['BinData/image.png',await image()],['BinData/object.ole','OLE bytes preserved']]});
    await patchCentral(input,name,(b,p)=>b.writeUInt32LE((b.readUInt32LE(p+16)^1)>>>0,p+16));await rejectClean(input,/손상된 내부 파일/);
  });
});

test('oversized central directory declarations fail before decompression or image processing',async t=>{
  await t.test('entry size',async sub=>{const folder=await directory(sub),input=await fixture(folder,{extra:[['BinData/oversize.bin','x']]});await patchCentral(input,'BinData/oversize.bin',(b,p)=>b.writeUInt32LE(LIMITS.entry+1,p+24));await rejectClean(input,/처리 한도/);});
  await t.test('XML size',async sub=>{const folder=await directory(sub),input=await fixture(folder);await patchCentral(input,'Contents/header.xml',(b,p)=>b.writeUInt32LE(LIMITS.xml+1,p+24));await rejectClean(input,/XML 크기/);});
});

test('a corrupt image is preserved with its reason while a valid image is optimized',async t=>{
  const folder=await directory(t),input=await fixture(folder,{items:item('bad','BinData/bad.jpg','image/jpeg')+item('good','BinData/good.png'),extra:[['BinData/bad.jpg','NOT_AN_IMAGE'],['BinData/good.png',await image()]]});
  const result=await optimizeFile(input,{preset:'small'});assert.equal(result.images,2);assert.equal(result.changed,1);assert.ok(result.saved>0);
  const bad=result.records.find(r=>r.name==='BinData/bad.jpg');assert.equal(bad.changed,false);assert.match(bad.reason,/읽지 못해/);await identicalEntries(input,result.path,['BinData/good.png']);
});

test('falling back to the original archive retains failed-image diagnostics',async t=>{
  const folder=await directory(t),input=await fixture(folder,{items:item('bad','BinData/bad.jpg','image/jpeg'),extra:[['BinData/bad.jpg','NOT_AN_IMAGE']],compressionLevel:9});
  const result=await optimizeFile(input);assert.equal(result.saved,0);assert.equal(result.changed,0);assert.match(result.records[0].reason,/읽지 못해/);assert.deepEqual(await fs.readFile(result.path),await fs.readFile(input));
});
