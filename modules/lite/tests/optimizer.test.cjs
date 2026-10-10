'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const sharp=require('sharp'),yazl=require('yazl'),{createWriteStream}=require('node:fs'),{pipeline}=require('node:stream/promises');
const {optimizeFile,optimizeImage,PRESETS}=require('../src/optimizer.cjs');
const {openArchive}=require('../src/archive.cjs');
async function fixture(entries,folder){const file=path.join(folder,'input.hwpx'),zip=new yazl.ZipFile(),writing=pipeline(zip.outputStream,createWriteStream(file));for(const [name,data] of Object.entries(entries))zip.addBuffer(Buffer.from(data),name,{compress:name!=='mimetype'});zip.end();await writing;return file;}
const base={mimetype:'application/hwp+zip','Contents/header.xml':'<head/>','Contents/section0.xml':'<sec><p>보존할 내용 &amp; 특수문자</p></sec>','Contents/content.hpf':'<package><manifest/></package>'};
test('real sample: reduces size and preserves all non-image entries byte for byte',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-core-')),input=path.resolve(__dirname,'../assets/samples/쎈Lite_이미지_예제.hwpx');
  const before=await fs.readFile(input),result=await optimizeFile(input,{outputFolder:folder});assert.ok(result.saved>0);assert.equal(result.images,2);assert.equal(result.changed,2);assert.deepEqual(await fs.readFile(input),before);
  const a=await openArchive(input),b=await openArchive(result.path);
  try{for(const entry of a.entries)if(!entry.fileName.startsWith('BinData/'))assert.deepEqual(await a.read(entry),await b.read(entry.fileName),entry.fileName);
    assert.equal(b.entries[0].fileName,'mimetype');assert.equal(b.entries[0].compressionMethod,0);
    const png=await sharp(await b.read('BinData/mark.png')).metadata();assert.equal(png.hasAlpha,true);assert.ok(png.width<=2200);
  }finally{a.close();b.close();}
  const second=await optimizeFile(input,{outputFolder:folder});assert.notEqual(result.path,second.path);
});
test('no images produces a valid non-growing document',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-empty-')),input=await fixture(base,folder),result=await optimizeFile(input);
  assert.equal(result.images,0);assert.ok(result.after<=result.before);assert.notEqual(result.path,input);
});
test('transparent pixels, EXIF orientation and density survive image optimization',async()=>{
  const png=await sharp({create:{width:3300,height:400,channels:4,background:{r:1,g:117,b:74,alpha:.3}}}).png({compressionLevel:0}).toBuffer();
  const result=await optimizeImage(png,PRESETS.small);assert.ok(result.buffer.length<png.length);const meta=await sharp(result.buffer).metadata();assert.ok(meta.hasAlpha);const pixel=await sharp(result.buffer).extract({left:0,top:0,width:1,height:1}).raw().toBuffer();assert.ok(pixel[3]>70&&pixel[3]<85);
  const jpg=await sharp({create:{width:3400,height:2000,channels:3,background:'#12704d'}}).withMetadata({orientation:6,density:300}).jpeg({quality:100}).toBuffer();
  const optimized=await optimizeImage(jpg,PRESETS.small);const after=await sharp(optimized.buffer).metadata();assert.equal(after.orientation,6);assert.equal(after.density,300);
});
test('unsupported vector payload preserved and described',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-vector-'));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>';
  const input=await fixture({...base,'Contents/content.hpf':'<package><manifest><item id="i" href="BinData/vector.svg" media-type="image/svg+xml"/></manifest></package>','BinData/vector.svg':svg},folder);
  const result=await optimizeFile(input);assert.equal(result.changed,0);const saved=await openArchive(result.path);try{assert.equal((await saved.read('BinData/vector.svg')).toString(),svg);}finally{saved.close();}
});
test('missing image, broken XML, non-HWPX and signed documents are rejected without an output',async()=>{
  for(const entries of [
    {...base,'Contents/content.hpf':'<package><manifest><item id="a" href="BinData/missing.jpg" media-type="image/jpeg"/></manifest></package>'},
    {...base,'Contents/section0.xml':'<sec><p></sec>'},
    {...base,mimetype:'application/zip'},
    {...base,'META-INF/signatures.xml':'<signature/>'},
    {...base,'Contents/section0.xml':'<!DOCTYPE sec [<!ENTITY e SYSTEM "file:///test">]><sec>&e;</sec>'}
  ]){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-invalid-')),input=await fixture(entries,folder);await assert.rejects(optimizeFile(input));assert.deepEqual(await fs.readdir(folder),['input.hwpx']);}
});
test('cancel during optimization cleans temp output and keeps the source',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-cancel-')),input=path.resolve(__dirname,'../assets/samples/쎈Lite_이미지_예제.hwpx');let canceled=false;
  await assert.rejects(optimizeFile(input,{outputFolder:folder,isCanceled:()=>canceled,onProgress:()=>{canceled=true;}}),e=>e.code==='CANCELED');assert.deepEqual(await fs.readdir(folder),[]);
});
test('CRC damage is rejected, not silently copied',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lite-crc-')),input=await fixture(base,folder),bytes=await fs.readFile(input);const index=bytes.indexOf(Buffer.from('application/hwp+zip'));bytes[index]=88;await fs.writeFile(input,bytes);await assert.rejects(optimizeFile(input),/손상/);
});
