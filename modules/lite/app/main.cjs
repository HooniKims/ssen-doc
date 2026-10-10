'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const {createUpdater,RELEASE_URL}=require('./updater.cjs');
let win,activeWorker,updater,outputFolder=null,demoDirectory,closing=false;
const registered=new Map(),outputs=new Map();
if(process.env.LITE_TEST_DATA)app.setPath('userData',process.env.LITE_TEST_DATA);
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
    if(message.type==='progress')win.webContents.send('task:progress',message);
    if(message.type==='result'){
      if(message.result.ok)outputs.set(message.result.id,message.result.path);
      win.webContents.send('task:result',message.result);
    }
    if(message.type==='done')finish(null,message);
    if(message.type==='fatal')finish(Error(message.error));
  });
  worker.once('error',e=>finish(e));worker.once('exit',()=>{if(!settled)finish(Error('작업이 중단되었습니다. 파일을 나누어 다시 시도해 주세요.'));});
});}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  win=new BrowserWindow({width:1360,height:900,minWidth:1040,minHeight:720,show:false,frame:false,backgroundColor:'#F2F0EB',icon:path.join(__dirname,'../assets/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:!app.isPackaged}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile(path.join(__dirname,'index.html'));win.once('ready-to-show',()=>{if(!process.env.LITE_TEST_HIDDEN)win.show();});
  win.on('close',event=>{if(activeWorker){event.preventDefault();if(closing)return;closing=true;dialog.showMessageBox(win,{type:'info',title:'문서를 처리하고 있어요',message:'작업을 중지한 뒤 창을 닫을 수 있습니다.',detail:'이미 저장된 결과는 유지됩니다.',buttons:['계속 처리','작업 중지'],defaultId:0,cancelId:0,noLink:true}).then(r=>{if(r.response===1)activeWorker?.postMessage('cancel');}).finally(()=>{closing=false;});}});
  updater=createUpdater({app,isInstalled:require('node:fs').existsSync(path.join(path.dirname(app.getPath('exe')),'Uninstall 쎈Lite.exe'))||require('node:fs').existsSync(path.join(path.dirname(app.getPath('exe')),'Uninstall SsenLite.exe')),loadAutoUpdater:()=>require('electron-updater').autoUpdater,onChange:state=>{if(!win.isDestroyed())win.webContents.send('update:state',state);}});
  ipcMain.handle('files:select',safe(async()=>{const r=await dialog.showOpenDialog(win,{title:'가볍게 만들 HWPX 문서',properties:['openFile','multiSelections'],filters:[{name:'한글 문서',extensions:['hwpx']}]});return r.canceled?{files:[],errors:[]}:register(r.filePaths);}));
  ipcMain.handle('files:add',safe(register));
  ipcMain.handle('files:remove',safe(id=>{if(activeWorker)throw Error('처리 중에는 목록을 바꿀 수 없습니다.');registered.delete(id);outputs.delete(id);return {ok:true};}));
  ipcMain.handle('files:clear',safe(()=>{if(activeWorker)throw Error('처리 중에는 목록을 바꿀 수 없습니다.');registered.clear();outputs.clear();return {ok:true};}));
  ipcMain.handle('files:demo',safe(async()=>{
    if(!demoDirectory){demoDirectory=await fs.mkdtemp(path.join(app.getPath('temp'),'ssen-lite-example-'));const source=path.join(__dirname,'../assets/samples');for(const name of await fs.readdir(source))if(name.endsWith('.hwpx'))await fs.writeFile(path.join(demoDirectory,name),await fs.readFile(path.join(source,name)),{flag:'wx'});}
    return register((await fs.readdir(demoDirectory)).filter(n=>n.endsWith('.hwpx')&&!n.includes('_가볍게')).map(n=>path.join(demoDirectory,n)));
  }));
  ipcMain.handle('folder:choose',safe(async()=>{if(activeWorker)throw Error('처리 중에는 저장 위치를 바꿀 수 없습니다.');const r=await dialog.showOpenDialog(win,{title:'결과를 저장할 폴더',properties:['openDirectory','createDirectory']});if(!r.canceled)outputFolder=r.filePaths[0];return {path:outputFolder};}));
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
  ipcMain.handle('update:state',safe(()=>updater.state));ipcMain.handle('update:check',safe(()=>updater.check()));ipcMain.handle('update:download',safe(()=>updater.download()));
  ipcMain.handle('update:release',safe(async()=>{await shell.openExternal(RELEASE_URL);return {ok:true};}));
  ipcMain.handle('update:install',safe(async()=>{
    if(activeWorker)throw Error('문서 처리가 끝난 뒤 업데이트를 설치해 주세요.');
    if(updater.state.phase!=='ready')return {ok:false};
    const r=await dialog.showMessageBox(win,{type:'question',title:'업데이트 설치',message:'쎈Lite를 재시작할까요?',detail:'저장된 문서는 유지됩니다. 현재 파일 목록은 초기화됩니다.',buttons:['돌아가기','재시작하여 설치'],defaultId:0,cancelId:0,noLink:true});return {ok:r.response===1&&updater.install()};
  }));
  for(const [channel,fn] of Object.entries({'window:minimize':()=>win.minimize(),'window:maximize':()=>win.isMaximized()?win.unmaximize():win.maximize(),'window:close':()=>win.close()}))ipcMain.on(channel,e=>{if(e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame)fn();});
  if(!process.env.LITE_TEST_DATA)updater.start();
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>updater?.stop());
