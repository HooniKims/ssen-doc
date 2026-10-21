'use strict';
// External UI fixture: real updater state machine, simulated release server/download.
const path=require('node:path'),{EventEmitter}=require('node:events');
const root=process.env.SSENDOC_AUTH_APP_ROOT||path.resolve(__dirname,'../..');
const modulePath=require.resolve(path.join(root,'app/updater.cjs')),original=require(modulePath).createUpdater;
require.cache[modulePath].exports.createUpdater=options=>{
 const engine=new EventEmitter(),fixture=globalThis.__updateFixture={starts:0,downloads:0,installs:0,version:'9.8.7',engine};
 engine.checkForUpdates=async()=>engine.emit('update-available',{version:fixture.version,releaseNotes:'# 변경 내용\n- 공문 항목 번호를 미리 보고 정리할 수 있습니다.\n- 표와 자동 문단 번호를 유지합니다.',files:[{url:'SsenDoc-Setup.exe',size:183207497}]});
 engine.downloadUpdate=async()=>{fixture.downloads++;engine.emit('download-progress',{percent:45});await new Promise(r=>setTimeout(r,120));engine.emit('update-downloaded',{version:fixture.version});};
 engine.quitAndInstall=()=>fixture.installs++;
 const updater=original({...options,app:{isPackaged:true,getVersion:()=>require(path.join(root,'package.json')).version},isInstalled:process.env.SSENDOC_UPDATE_ZIP!=='1',loadAutoUpdater:()=>engine,
  fetchRelease:async()=>({ok:true,json:async()=>({tag_name:'v'+fixture.version,body:'- ZIP 새 버전 안내',assets:[{name:`SsenDoc-${fixture.version}-x64.zip`,size:227817378}]})})});
 fixture.updater=updater;const start=updater.start;updater.start=()=>{fixture.starts++;start();};return updater;
};
require('./auth-launch.cjs');
