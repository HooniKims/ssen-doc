'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,dialog,clipboard,shell,session}=require('electron');
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),{Worker}=require('node:worker_threads');
const {ModelManager}=require('../src/ai/model-manager.cjs'),{LocalAI}=require('../src/ai/local-ai.cjs'),{merge}=require('../src/merge.cjs'),{scan}=require('../src/rules/rule-engine.cjs');
const {saveCopy}=require('../modules/review/src/edit-storage.cjs');
const {createUpdater,RELEASE_URL}=require('./updater.cjs');
if(process.env.SSENDOC_TEST_DATA)app.setPath('userData',process.env.SSENDOC_TEST_DATA);
app.setName('쎈doc');app.setAppUserModelId('kr.hoonikim.ssendoc');
let host,current='spell',manager,updater,settings={aiNoticeSeen:false,userWords:[]},documentSession=null,worker,taskId=0,closing=false;
const views=new Map(),modules=[],pending=new Map(),ai=new LocalAI();
function allowed(e){return [...views.values()].some(v=>e.sender===v.webContents&&e.senderFrame===v.webContents.mainFrame);}
const safe=fn=>async(e,...args)=>{if(!allowed(e))throw Error('허용되지 않은 요청입니다.');try{return await fn(...args);}catch(err){return {error:err.message};}};
function send(channel,value){for(const v of views.values())if(!v.webContents.isDestroyed())v.webContents.send(channel,value);}
function launchWorker(){worker=new Worker(path.join(__dirname,'worker.cjs'));worker.on('message',r=>{const p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.ok?p.resolve(r):p.reject(Error(r.error));});worker.on('error',e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();});const ownWorker=worker;worker.on('exit',()=>{if(worker!==ownWorker)return;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('검사 작업이 중단되었습니다.'));}pending.clear();worker=null;});}
function task(action,data){if(pending.size)throw Error('검사·문서 작업이 진행 중입니다. 잠시 뒤 다시 시도하세요.');if(!worker)launchWorker();return new Promise((resolve,reject)=>{const id=++taskId;const timer=setTimeout(()=>{pending.delete(id);reject(Error('문서 처리 시간이 초과되었습니다.'));const old=worker;worker=null;void old?.terminate();},120000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,action,data});});}
function validText(text){if(typeof text!=='string'||text.length>100000)throw Error('100,000자 이하의 글을 입력해 주세요.');return text;}
async function persist(){const file=path.join(app.getPath('userData'),'settings.json');await fs.writeFile(file+'.tmp',JSON.stringify(settings));await fs.rename(file+'.tmp',file);}
function show(name){if(name==='models'){show('spell');views.get('spell').webContents.send('doc:settings',true);return;}if(!views.has(name))throw Error('지원하지 않는 화면입니다.');current=name;for(const [key,v] of views)v.setVisible(key===name);host.contentView.addChildView(views.get(name));resize();views.get(name).webContents.focus();}
function resize(){const [width,height]=host.getContentSize();for(const v of views.values())v.setBounds({x:0,y:0,width,height});}
app.whenReady().then(async()=>{
 await fs.mkdir(app.getPath('userData'),{recursive:true});try{const loaded=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'settings.json'),'utf8'));settings={aiNoticeSeen:loaded.aiNoticeSeen===true,userWords:Array.isArray(loaded.userWords)?loaded.userWords.filter(w=>typeof w==='string'&&/^[가-힣]{2,30}$/.test(w)).slice(0,5000):[]};}catch{}
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,cb)=>cb({cancel:true}));
 host=new BrowserWindow({width:1440,height:960,minWidth:1120,minHeight:760,frame:false,show:false,backgroundColor:'#F2F0EB',icon:path.join(__dirname,'../assets/icon.ico'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 host.webContents.setWindowOpenHandler(()=>({action:'deny'}));host.webContents.on('will-navigate',e=>e.preventDefault());
 for(const name of ['spell','review','lite']){
  const dir=name==='spell'?__dirname:path.join(__dirname,'../modules',name,'app');const view=new WebContentsView({webPreferences:{preload:path.join(dir,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:!app.isPackaged||process.env.SSENDOC_TEST_AUTOMATION==='1'}});views.set(name,view);host.contentView.addChildView(view);view.setVisible(name==='spell');view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',e=>e.preventDefault());view.webContents.on('will-attach-webview',e=>e.preventDefault());
  if(name!=='spell')modules.push(require(path.join(dir,'register.cjs'))(host,view.webContents));
 }
 updater=createUpdater({app,isInstalled:require('../src/install-mode.cjs').isInstalledExecutable(app.getPath('exe')),loadAutoUpdater:()=>require('electron-updater').autoUpdater,onChange:s=>send('update:state',s)});
 manager=new ModelManager(path.join(app.getPath('userData'),'models'),{onChange:()=>send('model:state',manager.info())});
 ipcMain.handle('doc:navigate',safe(view=>{show(view);return {ok:true};}));
 ipcMain.handle('settings:read',safe(()=>settings));ipcMain.handle('settings:write',safe(async patch=>{if(patch?.aiNoticeSeen===true)settings.aiNoticeSeen=true;await persist();return settings;}));
 ipcMain.handle('dictionary:add',safe(async word=>{if(typeof word!=='string'||!/^\p{Script=Hangul}{2,30}$/u.test(word))throw Error('한글 단어 2~30자를 입력하세요.');settings.userWords=[...new Set([...settings.userWords,word])].slice(-5000);await persist();return {ok:true};}));
 ipcMain.handle('spell:scan',safe(text=>task('scan',{text:validText(text),userWords:settings.userWords})));
 ipcMain.handle('clipboard:read',safe(async()=>({text:await clipboard.readText()})));ipcMain.handle('clipboard:write',safe(async text=>{await clipboard.writeText(validText(text));return {ok:true};}));
 ipcMain.handle('spell:open-document',safe(async()=>{const result=await dialog.showOpenDialog(host,{title:'맞춤법을 검사할 문서',properties:['openFile'],filters:[{name:'학교 문서',extensions:['hwpx','xlsx']}]});if(result.canceled)return {canceled:true};const filePath=await fs.realpath(result.filePaths[0]);const data=await task('document',{filePath});documentSession={filePath,hash:data.hash};return data;}));
 ipcMain.handle('spell:prepare',safe(index=>{if(!documentSession||!Number.isInteger(index))throw Error('문서를 다시 불러와 주세요.');return task('prepare',{...documentSession,expectedHash:documentSession.hash,index});}));
 ipcMain.handle('spell:save-document',safe(async edits=>{if(!documentSession)throw Error('먼저 문서를 불러와 주세요.');const original={...documentSession};const ext=path.extname(original.filePath);const r=await dialog.showSaveDialog(host,{title:'교정한 문서 사본 저장',defaultPath:original.filePath.slice(0,-ext.length)+'_교정본'+ext,filters:[{name:ext.slice(1),extensions:[ext.slice(1)]}]});if(r.canceled)return {canceled:true};const result=await task('save-document',{filePath:original.filePath,expectedHash:original.hash,edits});const saved=await saveCopy(r.filePath,original.filePath,[original.filePath],result.buffer);return {ok:true,path:saved,recalculate:result.recalculate,stalePreview:result.stalePreview};}));
 ipcMain.handle('spell:save-text',safe(async(text,type='txt')=>{validText(text);if(!['txt','html'].includes(type))throw Error('TXT 또는 HTML로 저장하세요.');const r=await dialog.showSaveDialog(host,{title:'교정문 저장',defaultPath:'쎈doc_교정문.'+type,filters:[{name:type,extensions:[type]}]});if(r.canceled)return {canceled:true};if(!r.filePath.toLowerCase().endsWith('.'+type))throw Error('파일 확장자를 확인하세요.');await fs.writeFile(r.filePath,require('../src/report.cjs').report(text,type),'utf8');return {ok:true,path:r.filePath};}));
 ipcMain.handle('model:info',safe(()=>manager.info()));
 ipcMain.handle('model:download',safe(async id=>{if(ai.busy)throw Error('AI 검사 후 모델을 변경하세요.');await ai.unload();void manager.download(id).catch(()=>{});return manager.info();}));
 ipcMain.handle('model:pause',safe(()=>manager.pause()));
 ipcMain.handle('model:import',safe(async()=>{if(ai.busy||manager.active)throw Error('모델 작업이 끝난 뒤 선택하세요.');const r=await dialog.showOpenDialog(host,{title:'모델 파일 직접 지정',properties:['openFile'],filters:[{name:'GGUF 모델',extensions:['gguf']}]});if(r.canceled)return {canceled:true};await ai.unload();return manager.importFile(r.filePaths[0]);}));
 ipcMain.handle('model:delete',safe(async()=>{await ai.unload();return manager.delete();}));
 ipcMain.handle('spell:ai',safe(async text=>{validText(text);if(manager.active)throw Error('모델 준비가 끝난 뒤 검사하세요.');const result=await ai.inspect(manager.modelPath(),text,p=>send('ai:progress',p));return {...result,issues:merge(scan(text),result.issues)};}));
 ipcMain.handle('spell:cancel-ai',safe(()=>{ai.cancel();return {ok:true};}));
 ipcMain.handle('update:state',safe(()=>updater.state));ipcMain.handle('update:check',safe(()=>updater.check()));ipcMain.handle('update:download',safe(()=>updater.download()));
 ipcMain.handle('update:release',safe(async()=>{await shell.openExternal(RELEASE_URL);return {ok:true};}));
 ipcMain.handle('update:install',safe(async()=>{if(ai.busy||manager.active||pending.size||modules.some(m=>m.busy()))throw Error('현재 작업을 마친 뒤 업데이트하세요.');const r=await dialog.showMessageBox(host,{type:'question',message:'검사 결과와 수정 내용을 저장하셨나요?',detail:'재시작하면 저장하지 않은 글과 문서 수정 내용은 사라집니다.',buttons:['돌아가기','재시작하여 설치'],defaultId:0,cancelId:0});return {ok:r.response===1&&updater.install()};}));
 for(const [channel,fn] of Object.entries({'window:minimize':()=>host.minimize(),'window:maximize':()=>host.isMaximized()?host.unmaximize():host.maximize(),'window:close':()=>host.close()}))ipcMain.on(channel,e=>{if(allowed(e))fn();});
 host.on('resize',resize);host.on('close',e=>{if(closing)return;e.preventDefault();void dialog.showMessageBox(host,{type:'question',message:'쎈doc을 닫을까요?',detail:'저장하지 않은 글과 문서 수정 내용은 사라집니다. 진행 중인 모델 다운로드는 다음에 재개할 수 있습니다.',buttons:['계속 사용','닫기'],defaultId:0,cancelId:0}).then(async r=>{if(r.response===1){closing=true;ai.cancel();await manager.pause();host.close();}});});
 host.on('closed',()=>{for(const v of views.values())if(!v.webContents.isDestroyed())v.webContents.close();});
 await manager.init();
 for(const [name,view] of views)await view.webContents.loadFile(name==='spell'?path.join(__dirname,'index.html'):path.join(__dirname,'../modules',name,'app/index.html'));
 show('spell');if(!process.env.SSENDOC_TEST_HIDDEN)host.show();
});
app.on('window-all-closed',()=>{worker?.terminate();for(const m of modules)m.stop();updater?.stop();app.quit();});
