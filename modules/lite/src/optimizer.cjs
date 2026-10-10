'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createWriteStream,constants}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const sharp=require('sharp'),yazl=require('yazl');
const {XMLSerializer}=require('@xmldom/xmldom');
const {openArchive,parseXml,LIMITS}=require('./archive.cjs');
const {parseManifest,resolveItem}=require('./manifest.cjs');
sharp.cache({memory:64,files:0,items:20});sharp.concurrency(2);
const PRESETS=Object.freeze({high:{edge:3200,quality:90},balanced:{edge:2200,quality:82},small:{edge:1400,quality:70}});
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function checkCancel(isCanceled){if(isCanceled?.()){const e=Error('작업을 중지했습니다.');e.code='CANCELED';throw e;}}
async function optimizeImage(buffer,preset,{convertOpaquePng=false}={}){
  const options={limitInputPixels:80*1000*1000,failOn:'warning'};
  const metadata=await sharp(buffer,options).metadata();
  if(!['jpeg','png'].includes(metadata.format))return {buffer,reason:'JPEG·PNG 외 형식은 원본 유지'};
  if(metadata.pages>1)return {buffer,reason:'여러 프레임 이미지는 원본 유지'};
  // Preserve orientation and density; the HWPX drawing/crop coordinate system is untouched.
  const convert=convertOpaquePng&&metadata.format==='png'&&(!metadata.hasAlpha||(await sharp(buffer,options).stats()).isOpaque);
  let image=sharp(buffer,options).keepMetadata().timeout({seconds:45});
  if(preset.edge)image=image.resize({width:preset.edge,height:preset.edge,fit:'inside',withoutEnlargement:true});
  const candidate=await (metadata.format==='jpeg'||convert?image.jpeg({quality:preset.quality,chromaSubsampling:'4:4:4',mozjpeg:true}):image.png({compressionLevel:9,palette:false})).toBuffer();
  const dimensions={beforeWidth:metadata.width,beforeHeight:metadata.height,width:metadata.width,height:metadata.height,format:metadata.format,originalFormat:metadata.format};
  if(candidate.length>=buffer.length)return {buffer,reason:'이미 최적화되어 원본 유지',...dimensions};
  const after=await sharp(candidate,options).metadata();
  if(after.format!==(convert?'jpeg':metadata.format)||(!convert&&Boolean(after.hasAlpha)!==Boolean(metadata.hasAlpha)))throw Error('이미지 형식 검증에 실패했습니다.');
  return {buffer:candidate,...dimensions,width:after.width,height:after.height,format:after.format,converted:convert,reason:convert?'불투명 PNG → JPEG · 용량 줄임':'용량 줄임'};
}
async function uniqueCommit(temp,folder,stem){
  for(let n=0;n<10000;n++){
    const destination=path.join(folder,`${stem}_가볍게${n?'_'+n:''}.hwpx`);
    try{await fs.link(temp,destination);return destination;}catch(e){if(e.code==='EEXIST')continue;if(['EPERM','ENOTSUP','EXDEV','EACCES'].includes(e.code)){
      try{await fs.copyFile(temp,destination,constants.COPYFILE_EXCL);return destination;}catch(copyError){if(copyError.code==='EEXIST')continue;throw copyError;}
    }throw e;}
  }throw Error('사용 가능한 결과 파일 이름이 없습니다.');
}
async function optimizeFile(input,{preset='balanced',profile,convertOpaquePng=false,outputFolder,nativePath,isCanceled,onProgress=()=>{}}={}){
  if(!PRESETS[preset])throw Error('올바른 품질 설정을 선택해 주세요.');
  if(profile&&(!Number.isInteger(profile.quality)||profile.quality<1||profile.quality>100||(profile.edge!==null&&(!Number.isInteger(profile.edge)||profile.edge<1))))throw Error('올바르지 않은 이미지 설정입니다.');
  const info=await fs.stat(input);
  if(!info.isFile()||info.size>LIMITS.file)throw Error('500MB 이하 HWPX 파일만 처리할 수 있습니다.');
  const folder=outputFolder||path.dirname(input);await fs.access(folder,constants.W_OK);
  const archive=await openArchive(input),temp=path.join(folder,`.ssenlite-${crypto.randomUUID()}.tmp`);
  let output,writing;
  const records=[],originalHashes=new Map(),imageCache=new Map(),renames=new Map();let cachedBytes=0;
  try{
    checkCancel(isCanceled);
    const mime=(await archive.read('mimetype')).toString('utf8').trim();
    if(mime!=='application/hwp+zip')throw Error('HWPX 파일 형식이 아닙니다.');
    const manifest=await archive.read('Contents/content.hpf');parseXml(manifest,'content.hpf');
    const items=await parseManifest(manifest,nativePath),imagePaths=new Set(),ids=new Map();
    for(const item of items){
      if(ids.has(item.id))throw Error('문서 파일 목록에 중복 ID가 있습니다.');
      const target=resolveItem(item.href,archive.byName);ids.set(item.id,target);
      if(/^image\//i.test(item.mediaType)){if(!target)throw Error('참조된 이미지 파일이 없습니다.');imagePaths.add(target);}
    }
    // Unlisted images are not modified; OLE payloads and embedded documents stay intact.
    const list=[archive.byName.get('mimetype'),...archive.entries.filter(e=>e.fileName!=='mimetype')];
    output=new yazl.ZipFile();
    writing=pipeline(output.outputStream,createWriteStream(temp,{flags:'wx'}));
    writing.catch(()=>{});
    for(let i=0;i<list.length;i++){
      checkCancel(isCanceled);
      const entry=list[i],name=entry.fileName;
      if(name.endsWith('/')){output.addEmptyDirectory(name);continue;}
      const original=await archive.read(entry);originalHashes.set(name,hash(original));
      if(/\.(xml|hpf)$/i.test(name)){
        const doc=parseXml(original,name);
        for(const node of Array.from(doc.getElementsByTagName('*'))){
          if(node.hasAttribute('binaryItemIDRef')){const ref=node.getAttribute('binaryItemIDRef');if(ref&&!ids.get(ref))throw Error(`이미지 참조를 찾을 수 없습니다: ${ref}`);}
        }
      }
      // Write the manifest after image conversion decisions are known.
      if(name==='Contents/content.hpf')continue;
      let data=original;
      if(imagePaths.has(name)){
        onProgress({image:records.length+1,imageTotal:imagePaths.size,name,phase:'optimizing'});
        try{
          const fingerprint=originalHashes.get(name);
          let result=imageCache.get(fingerprint);
          if(!result){
            result=await optimizeImage(original,profile||PRESETS[preset],{convertOpaquePng});
            // Some HWPX writers embed identical bytes under many image IDs.
            // Reuse the encoding, but retain every original package entry and reference.
            if(result.buffer.length<original.length&&result.buffer.length<=64*1024*1024){
              while(cachedBytes+result.buffer.length>64*1024*1024&&imageCache.size){const oldest=imageCache.keys().next().value;cachedBytes-=imageCache.get(oldest).buffer.length;imageCache.delete(oldest);}
              imageCache.set(fingerprint,result);cachedBytes+=result.buffer.length;
            }
          }
          data=result.buffer;
          if(result.converted){
            let suffix='.ssenlite.jpg';for(let n=1;archive.byName.has(name+suffix)||[...renames.values()].includes(name+suffix);n++)suffix=`.ssenlite-${n}.jpg`;
            renames.set(name,name+suffix);
          }
          records.push({name,before:original.length,after:data.length,changed:data!==original,reason:result.reason||'용량 줄임',...Object.fromEntries(Object.entries(result).filter(([k])=>!['buffer','reason'].includes(k)))});
        }catch(e){records.push({name,before:original.length,after:original.length,changed:false,reason:'이미지를 읽지 못해 원본 유지'});}
      }
      // Reuse original bytes for all content, styles, OLE, scripts, previews, and unsupported media.
      output.addBuffer(data,renames.get(name)||name,{compressionLevel:name==='mimetype'?0:6,mtime:entry.getLastModDate()});
    }
    let nextManifest=manifest;
    if(renames.size){
      const doc=parseXml(manifest,'content.hpf');
      const itemById=new Map(items.map(item=>[item.id,item]));
      for(const node of Array.from(doc.getElementsByTagName('*'))){
        if(node.localName!=='item')continue;
        const item=itemById.get(node.getAttribute('id')),old=item&&ids.get(item.id);
        if(renames.has(old)){node.setAttribute('href',item.href+renames.get(old).slice(old.length));node.setAttribute('media-type','image/jpeg');}
      }
      nextManifest=Buffer.from(new XMLSerializer().serializeToString(doc));
    }
    output.addBuffer(nextManifest,'Contents/content.hpf',{compressionLevel:6,mtime:archive.byName.get('Contents/content.hpf').getLastModDate()});
    output.end();await writing;writing=null;archive.close();
    checkCancel(isCanceled);onProgress({phase:'verifying',image:records.length,imageTotal:imagePaths.size});
    const candidate=await openArchive(temp);
    try{
      const changed=new Set(records.filter(r=>r.changed).map(r=>renames.get(r.name)||r.name));
      if(candidate.entries.length!==archive.entries.length)throw Error('저장 결과의 파일 수가 다릅니다.');
      for(const entry of candidate.entries){
        checkCancel(isCanceled);if(entry.fileName.endsWith('/'))continue;
        const data=await candidate.read(entry);
        const expected=entry.fileName==='Contents/content.hpf'?hash(nextManifest):originalHashes.get(entry.fileName);
        if(!changed.has(entry.fileName)&&hash(data)!==expected)throw Error('문서 원본 내용 보존 검증에 실패했습니다.');
      }
      if(renames.size){
        const updated=await parseManifest(await candidate.read('Contents/content.hpf'),nativePath);
        if(updated.length!==items.length)throw Error('이미지 목록 검증에 실패했습니다.');
        for(let i=0;i<items.length;i++){
          const before=items[i],after=updated[i],old=ids.get(before.id),renamed=renames.get(old);
          if(after.id!==before.id||after.mediaType!==(renamed?'image/jpeg':before.mediaType)||after.href!==(renamed?before.href+renamed.slice(old.length):before.href))throw Error('이미지 참조 검증에 실패했습니다.');
          if(/^image\//.test(after.mediaType)&&!resolveItem(after.href,candidate.byName))throw Error('변환한 이미지를 찾을 수 없습니다.');
        }
      }
    }finally{candidate.close();}
    const current=await fs.stat(input);
    if(current.size!==info.size||current.mtimeMs!==info.mtimeMs||current.ino!==info.ino)throw Error('처리 중 원본이 변경되었습니다. 문서를 닫고 다시 시도해 주세요.');
    let size=(await fs.stat(temp)).size;
    if(size>=info.size){await fs.copyFile(input,temp);size=info.size;renames.clear();records.forEach(r=>{if(r.changed){r.after=r.before;r.changed=false;r.converted=false;r.reason='전체 용량 감소가 없어 원본 유지';r.width=r.beforeWidth;r.height=r.beforeHeight;r.format=r.originalFormat;}});}
    checkCancel(isCanceled);
    const saved=await uniqueCommit(temp,folder,path.basename(input,path.extname(input)));
    return {path:saved,name:path.basename(input),before:info.size,after:size,saved:info.size-size,images:records.length,changed:records.filter(r=>r.changed).length,converted:renames.size,records,preset};
  }finally{
    archive.close();
    if(writing){output.outputStream.destroy();await writing.catch(()=>{});}
    await fs.unlink(temp).catch(()=>{});
  }
}
module.exports={PRESETS,optimizeImage,optimizeFile,uniqueCommit};
