'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const sharp=require('sharp'),yazl=require('yazl'),{pipeline}=require('node:stream/promises'),{createWriteStream}=require('node:fs');
const {optimizeFile,optimizeImage}=require('../src/optimizer.cjs'),{optimizeToTarget}=require('../src/target-optimizer.cjs');
const {openArchive}=require('../src/archive.cjs'),{parseManifest,resolveItem}=require('../src/manifest.cjs'),{validateSettings}=require('../src/settings.cjs');
async function fixture(){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-target-')),file=path.join(folder,'input.hwpx');
  const photo=await sharp(crypto.randomBytes(800*600*3),{raw:{width:800,height:600,channels:3}}).png().toBuffer();
  const entries={'mimetype':Buffer.from('application/hwp+zip'),'Contents/header.xml':Buffer.from('<head/>'),'Contents/section0.xml':Buffer.from('<sec><tbl><tc><pic binaryItemIDRef="a"/><pic binaryItemIDRef="b"/></tc></tbl></sec>'),'Contents/content.hpf':Buffer.from('<package><manifest><item id="a" href="../BinData/%EC%82%AC%EC%A7%84.png" media-type="image/png"/><item id="b" href="BinData/사진.png" media-type="image/png"/></manifest></package>'),'BinData/사진.png':photo,'BinData/사진.png.ssenlite.jpg':Buffer.from('unreferenced payload')};
  const zip=new yazl.ZipFile(),writing=pipeline(zip.outputStream,createWriteStream(file));for(const [n,b]of Object.entries(entries))zip.addBuffer(b,n,{compress:n!=='mimetype'});zip.end();await writing;return {folder,file,entries};
}
test('PNG conversion rewrites aliases and encoded paths, handles collisions, preserves all content',async()=>{
  const {folder,file,entries}=await fixture(),original=await fs.readFile(file),r=await optimizeFile(file,{convertOpaquePng:true,profile:{quality:95,edge:null}});
  assert.equal(r.converted,1);assert.ok(r.saved>0);assert.deepEqual(await fs.readFile(file),original);
  const out=await openArchive(r.path);try{for(const [n,b]of Object.entries(entries))if(!['Contents/content.hpf','BinData/사진.png'].includes(n))assert.deepEqual(await out.read(n),b,n);
    const items=await parseManifest(await out.read('Contents/content.hpf'));for(const item of items){assert.equal(item.mediaType,'image/jpeg');const target=resolveItem(item.href,out.byName);assert.equal(target,'BinData/사진.png.ssenlite-1.jpg');assert.equal((await sharp(await out.read(target)).metadata()).width,800);}
  }finally{out.close();}
  assert.ok(!(await fs.readdir(folder)).some(n=>n.startsWith('.ssenlite')));
});
test('transparent PNG stays PNG even when conversion is enabled',async()=>{
  const png=await sharp({create:{width:800,height:600,channels:4,background:{r:20,g:100,b:70,alpha:.3}}}).png({compressionLevel:0}).toBuffer();
  const r=await optimizeImage(png,{quality:80,edge:null},{convertOpaquePng:true}),m=await sharp(r.buffer).metadata();assert.equal(m.format,'png');assert.equal(m.hasAlpha,true);assert.ok(!r.converted);
});
test('target search reaches half size without changing original and records honest unattainable target',async()=>{
  const {folder,file}=await fixture(),original=await fs.readFile(file),r=await optimizeToTarget(file,{targetRatio:.5});
  assert.equal(r.targetMet,true);assert.ok(r.after<=r.before*.5);assert.ok(r.attempts.length>1);assert.deepEqual(await fs.readFile(file),original);
  const impossible=await optimizeToTarget(file,{targetBytes:100});assert.equal(impossible.targetMet,false);assert.ok(impossible.after>100);assert.ok(impossible.after<=impossible.before);
  assert.ok(!(await fs.readdir(folder)).some(n=>n.startsWith('.ssenlite')));
});
test('canceling target search removes private work and produces no output',async()=>{
  const {folder,file}=await fixture();let canceled=false;await assert.rejects(optimizeToTarget(file,{targetRatio:.5,isCanceled:()=>canceled,onProgress:()=>{canceled=true;}}),e=>e.code==='CANCELED');assert.deepEqual(await fs.readdir(folder),['input.hwpx']);
});
test('renderer options cannot override paths, profiles or bypass target bounds',()=>{
  assert.deepEqual(validateSettings({mode:'target',targetRatio:.5,outputFolder:'bad',profile:{quality:1}}),{mode:'target',targetRatio:.5,convertOpaquePng:true});
  for(const targetRatio of [0,1,-1,NaN,Infinity,'0.5'])assert.throws(()=>validateSettings({mode:'target',targetRatio}));
  assert.equal(validateSettings('balanced').preset,'balanced');
});
