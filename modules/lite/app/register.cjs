'use strict';
const BUILD_TAG='e98eadad162b';
module.exports=function registerModule(host, contents,registerIPC){
const ipcMain={handle:(channel,fn)=>registerIPC('lite:'+channel,fn)};
const {app,dialog,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
let win,activeWorker,outputFolder=null,demoDirectory;
const registered=new Map(),outputs=new Map();
const safe=fn=>async(event,...args)=>{
  if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('허용되지 않은 요청입니다.');
  try{return await fn(...args);}catch(e){return {error:e.message||'작업을 완료하지 못했습니다.'};}
};
async function register(paths){
  if(activeWorker)throw Error('현재 작업이 끝난 뒤 파일을 추가해 주세요.');
  if(!Array.isArray(paths)||paths.length>50)throw Error('한 번에 최대 50개 파일을 추가할 수 있습니다.');
  const files=[],errors=[];
  for(const p of paths){
    if(typeof p!=='string'||!path.isAbsolute(p))continue;
    const name=path.basename(p);
    try{
      if(path.extname(p).toLowerCase()!=='.hwpx')throw Error('HWPX 파일만 지원합니다. HWP는 한글에서 HWPX로 저장해 주세요.');
      const real=await fs.realpath(p),info=await fs.stat(real);
      if(!info.isFile()||info.size>500*1024*1024)throw Error('500MB 이하 파일만 지원합니다.');
      const id=crypto.createHash('sha256').update(real.toLowerCase()).digest('hex').slice(0,20);
      if(!registered.has(id)&&registered.size>=50)throw Error('최대 50개까지 추가할 수 있습니다.');
      registered.set(id,real);files.push({id,name,size:info.size,path:real});
    }catch(e){errors.push(`${name}: ${e.message}`);}
  }
  return {files,errors};
}
function batch(files,settings){return new Promise((resolve,reject)=>{
  const nativePath=app.isPackaged?path.join(process.resourcesPath,'native/ssen-hwpx.exe'):path.join(__dirname,'../native/bin/ssen-hwpx.exe');
  const worker=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{files,options:{...settings,outputFolder,nativePath}},resourceLimits:{maxOldGenerationSizeMb:768}});
  activeWorker=worker;let settled=false;
  function finish(error,result){if(settled)return;settled=true;if(activeWorker===worker)activeWorker=null;error?reject(error):resolve(result);}
  worker.on('message',message=>{
    if(message.type==='progress')win.webContents.send('lite:task:progress',message);
    if(message.type==='result'){
      if(message.result.ok)outputs.set(message.result.id,message.result.path);
      win.webContents.send('lite:task:result',message.result);
    }
    if(message.type==='done')finish(null,message);
    if(message.type==='fatal')finish(Error(message.error));
  });
  worker.once('error',e=>finish(e));worker.once('exit',()=>{if(!settled)finish(Error('작업이 중단되었습니다. 파일을 나누어 다시 시도해 주세요.'));});
});}

win={webContents:contents};
  ipcMain.handle('files:select',safe(async()=>{const r=await dialog.showOpenDialog(host,{title:'가볍게 만들 HWPX 문서',properties:['openFile','multiSelections'],filters:[{name:'한글 문서',extensions:['hwpx']}]});return r.canceled?{files:[],errors:[]}:register(r.filePaths);}));
  ipcMain.handle('files:add',safe(register));
  ipcMain.handle('files:remove',safe(id=>{if(activeWorker)throw Error('처리 중에는 목록을 바꿀 수 없습니다.');registered.delete(id);outputs.delete(id);return {ok:true};}));
  ipcMain.handle('files:clear',safe(()=>{if(activeWorker)throw Error('처리 중에는 목록을 바꿀 수 없습니다.');registered.clear();outputs.clear();return {ok:true};}));
  ipcMain.handle('files:demo',safe(async()=>{
    if(!demoDirectory){demoDirectory=await fs.mkdtemp(path.join(app.getPath('temp'),'ssen-lite-example-'));const source=path.join(__dirname,'../assets/samples');for(const name of await fs.readdir(source))if(name.endsWith('.hwpx'))await fs.writeFile(path.join(demoDirectory,name),await fs.readFile(path.join(source,name)),{flag:'wx'});}
    return register((await fs.readdir(demoDirectory)).filter(n=>n.endsWith('.hwpx')&&!n.includes('_가볍게')).map(n=>path.join(demoDirectory,n)));
  }));
  ipcMain.handle('folder:choose',safe(async()=>{if(activeWorker)throw Error('처리 중에는 저장 위치를 바꿀 수 없습니다.');const r=await dialog.showOpenDialog(host,{title:'결과를 저장할 폴더',properties:['openDirectory','createDirectory']});if(!r.canceled)outputFolder=r.filePaths[0];return {path:outputFolder};}));
  ipcMain.handle('folder:reset',safe(()=>{if(activeWorker)throw Error('현재 작업이 끝난 뒤 바꿔 주세요.');outputFolder=null;return {path:null};}));
  ipcMain.handle('task:start',safe(async(ids,preset)=>{
    if(activeWorker)throw Error('현재 작업이 진행 중입니다.');
    if(!Array.isArray(ids)||!ids.length||ids.length>50||!ids.every(id=>registered.has(id)))throw Error('처리할 파일을 다시 선택해 주세요.');
    const settings=require('../src/settings.cjs').validateSettings(preset);
    return batch([...new Set(ids)].map(id=>({id,path:registered.get(id)})),settings);
  }));
  ipcMain.handle('task:cancel',safe(()=>{activeWorker?.postMessage('cancel');return {ok:true};}));
  ipcMain.handle('result:show',safe(async id=>{const file=outputs.get(id);if(!file)throw Error('저장된 결과가 없습니다.');await fs.access(file);shell.showItemInFolder(file);return {ok:true};}));
  ipcMain.handle('result:open',safe(async id=>{const file=outputs.get(id);if(!file)throw Error('저장된 결과가 없습니다.');const error=await shell.openPath(file);if(error)throw Error('문서를 열지 못했습니다. HWPX 연결 프로그램을 확인해 주세요.');return {ok:true};}));

// Cancel first so the optimizer removes its temporary files; terminate only if it hangs.
return {busy:()=>Boolean(activeWorker),stop:()=>{const w=activeWorker;if(!w)return Promise.resolve();return new Promise(resolve=>{const timer=setTimeout(()=>void w.terminate(),10000);w.once('exit',()=>{clearTimeout(timer);resolve();});w.postMessage('cancel');});}};
};
