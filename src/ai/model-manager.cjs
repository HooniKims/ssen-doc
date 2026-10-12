'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const catalog=require('./models.json').models;
async function sha256(file){const hash=crypto.createHash('sha256');for await(const b of sync.createReadStream(file))hash.update(b);return hash.digest('hex');}
function permitted(url){const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='huggingface.co'||u.hostname.endsWith('.huggingface.co')||u.hostname.endsWith('.hf.co'));}
function request(url,{offset=0,signal}={},redirects=0){return new Promise((resolve,reject)=>{
 if(!permitted(url)||redirects>8)return reject(Error('허용되지 않은 모델 다운로드 주소입니다.'));
 const req=https.get(url,{signal,headers:offset?{Range:`bytes=${offset}-`}:{}},res=>{
  if([301,302,303,307,308].includes(res.statusCode)){res.resume();return request(new URL(res.headers.location,url).href,{offset,signal},redirects+1).then(resolve,reject);}
  if(![200,206].includes(res.statusCode)){res.resume();return reject(Error(`모델 서버 응답: ${res.statusCode}. 재시도하거나 GGUF 파일을 직접 지정하세요.`));}
  resolve(res);
 });req.setTimeout(30000,()=>req.destroy(Error('다운로드 응답 시간이 초과되었습니다. 재시도할 수 있습니다.')));req.on('error',reject);
});}
class ModelManager{
 constructor(directory,{onChange=()=>{},transport=request,freeSpace=async p=>{const s=await fs.statfs(p);return s.bavail*s.bsize;}}={}){this.directory=directory;this.onChange=onChange;this.transport=transport;this.freeSpace=freeSpace;this.state={phase:'idle',received:0,total:0,percent:0,eta:null,message:'AI는 기본 꺼짐입니다.'};this.active=null;this.controller=null;this.installed=null;}
 update(patch){Object.assign(this.state,patch);this.onChange({...this.state});}
 async init(){await fs.mkdir(this.directory,{recursive:true});let recorded=false;try{const m=JSON.parse(await fs.readFile(path.join(this.directory,'installed.json'),'utf8'));recorded=true;if(path.basename(m.filename)!==m.filename||!m.filename.endsWith('.gguf'))throw Error();const p=path.join(this.directory,m.filename);const stat=await fs.stat(p);if(stat.size!==m.bytes)throw Error();if(await sha256(p)!==m.sha256)throw Error();this.installed=m;this.update({phase:'ready',message:'모델 준비 완료',received:m.bytes,total:m.bytes,percent:100});}catch{this.installed=null;if(recorded){this.update({phase:'error',message:'설치된 모델 파일이 손상되었거나 없습니다. 모델을 삭제한 뒤 다시 받아 주세요.'});return this.info();}const m=catalog.find(m=>m.enabled);const part=await fs.stat(path.join(this.directory,m.filename+'.part')).catch(()=>null);if(part)this.update({phase:'paused',received:part.size,total:m.bytes,percent:part.size/m.bytes*100,message:'이전에 받던 모델이 있습니다. 다운로드를 재개할 수 있습니다.'});}return this.info();}
 info(){return {...this.state,installed:this.installed?{...this.installed,path:this.modelPath()}:null,models:catalog,recommended:'qwen3-0.6b',memoryGB:Math.round(require('node:os').totalmem()/1024**3)};}
 modelPath(){return this.installed?path.join(this.directory,this.installed.filename):null;}
 async commit(meta){const temp=path.join(this.directory,'installed.json.tmp');await fs.writeFile(temp,JSON.stringify(meta));await fs.rename(temp,path.join(this.directory,'installed.json'));this.installed=meta;this.update({phase:'ready',percent:100,received:meta.bytes,total:meta.bytes,eta:0,message:'모델 다운로드 및 검증 완료'});}
 download(id='qwen3-0.6b'){
  if(this.active)throw Error('모델 작업이 진행 중입니다.');const model=catalog.find(m=>m.id===id&&m.enabled);if(!model)throw Error('사용할 수 없는 모델입니다.');
  this.controller=new AbortController();this.active=this.runDownload(model,this.controller.signal).finally(()=>{this.active=null;this.controller=null;});return this.active;
 }
 async runDownload(m,signal){
  const part=path.join(this.directory,m.filename+'.part'),file=path.join(this.directory,m.filename);
  try{
   await fs.mkdir(this.directory,{recursive:true});let offset=await fs.stat(part).then(s=>s.size).catch(()=>0);
   if(offset>m.bytes){await fs.rm(part,{force:true});offset=0;}
   if(await this.freeSpace(this.directory)<(m.bytes-offset)+128*1024**2)throw Error('모델 저장 공간이 부족합니다. 128MB의 추가 여유 공간이 필요합니다.');
   this.update({phase:'downloading',received:offset,total:m.bytes,percent:offset/m.bytes*100,eta:null,message:'모델을 내려받고 있습니다. 기본 검사는 계속 사용할 수 있습니다.'});
   if(offset<m.bytes){
    const response=await this.transport(m.url,{offset,signal});
    if(response.statusCode===206){const r=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range']||'');if(!r||Number(r[1])!==offset||Number(r[3])!==m.bytes){response.destroy();throw Error('이어받기 응답이 올바르지 않습니다.');}}
    else offset=0;
    const handle=await fs.open(part,offset?'a':'w');const started=Date.now(),initial=offset;let notified=0;
    try{for await(const chunk of response){if(signal.aborted)throw Error('PAUSED');if(offset+chunk.length>m.bytes){response.destroy();throw Error('예상 모델 크기를 초과했습니다.');}let position=0;while(position<chunk.length){const r=await handle.write(chunk,position,chunk.length-position);position+=r.bytesWritten;}offset+=chunk.length;
      if(Date.now()-notified>200){const rate=(offset-initial)/Math.max(.1,(Date.now()-started)/1000);this.update({received:offset,percent:offset/m.bytes*100,eta:rate?(m.bytes-offset)/rate:null});notified=Date.now();}
    }}finally{await handle.close();}
   }
   if(signal.aborted)throw Error('PAUSED');if(offset!==m.bytes)throw Error('다운로드가 끝나지 않았습니다. 재개를 눌러 주세요.');
   this.update({phase:'verifying',received:offset,percent:100,message:'SHA-256으로 모델 파일을 확인하고 있습니다.'});
   if(await sha256(part)!==m.sha256){await fs.rm(part,{force:true});throw Error('체크섬이 다릅니다. 손상된 파일을 지웠습니다. 재시도하여 다시 다운로드하세요.');}
   if(signal.aborted)throw Error('PAUSED');await fs.rename(part,file);await this.commit({id:m.id,name:m.name,filename:m.filename,bytes:m.bytes,sha256:m.sha256,license:m.license});return this.info();
  }catch(e){this.update({phase:signal.aborted?'paused':'error',message:signal.aborted?'다운로드를 일시정지했습니다. 재개할 수 있습니다.':e.message});throw e;}
 }
 async pause(){this.controller?.abort();if(this.active)await this.active.catch(()=>{});return this.info();}
 async importFile(source){
  if(this.active)throw Error('모델 작업이 진행 중입니다.');
  const task=(async()=>{const info=await fs.stat(source);if(!source.toLowerCase().endsWith('.gguf')||!info.isFile()||info.size<32||info.size>4*1024**3)throw Error('4GB 이하의 유효한 GGUF 모델 파일을 선택하세요.');
   const handle=await fs.open(source,'r');const header=Buffer.alloc(8);try{await handle.read(header,0,8,0);}finally{await handle.close();}
   if(header.toString('ascii',0,4)!=='GGUF'||![2,3].includes(header.readUInt32LE(4)))throw Error('지원하는 GGUF 파일이 아닙니다.');
   if(await this.freeSpace(this.directory)<info.size+128*1024**2)throw Error('모델을 복사할 여유 공간이 부족합니다.');
   this.update({phase:'importing',message:'선택한 모델을 복사하고 검증합니다.'});const digest=await sha256(source),known=catalog.find(m=>m.sha256===digest);
   const filename=known?.filename||`imported-${digest.slice(0,16)}.gguf`,destination=path.join(this.directory,filename);
   if(path.resolve(source)!==path.resolve(destination)){await fs.copyFile(source,destination+'.part');if(await sha256(destination+'.part')!==digest)throw Error('모델 복사 검증에 실패했습니다.');await fs.rename(destination+'.part',destination);}
   await this.commit({id:known?.id||'imported',name:known?.name||path.basename(source),filename,bytes:info.size,sha256:digest,license:known?.license||'직접 지정 모델: 사용 조건을 확인해 주세요.'});return this.info();})();
  this.active=task;try{return await task;}catch(e){this.update({phase:'error',message:e.message});throw e;}finally{this.active=null;}
 }
 async delete(){if(this.active)throw Error('모델 작업을 마친 뒤 삭제해 주세요.');const names=await fs.readdir(this.directory);let freed=0;for(const name of names){if(!/^(?:Qwen3-0\.6B-Q4_K_M|imported-[a-f0-9]{16})\.gguf(?:\.part)?$/.test(name)&&!/^installed\.json(?:\.tmp)?$/.test(name))continue;const file=path.join(this.directory,name);const s=await fs.lstat(file);if(s.isFile()){freed+=s.size;await fs.unlink(file);}}
  this.installed=null;this.update({phase:'idle',received:0,total:0,percent:0,eta:null,message:'모델을 삭제했습니다. 기본 검사는 계속 사용할 수 있습니다.'});return {...this.info(),freed};}
}
module.exports={ModelManager,sha256,permitted,request};
