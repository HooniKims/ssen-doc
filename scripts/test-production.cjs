'use strict';
// Actual executable smoke; test:ui separately covers mutations against app.asar with mock auth.
const fs=require('node:fs/promises'),path=require('node:path'),{_electron,expect}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const profile=path.resolve('_workspace/production-smoke-'+Date.now()),env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.SSENDOC_TEST_AUTOMATION;
 const app=await _electron.launch({executablePath:path.resolve(process.env.SSENDOC_RELEASE_DIR||'release','win-unpacked/SsenDoc.exe'),args:[],env});
 const view=code=>app.evaluate(async({webContents},code)=>{const w=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/app/index.html')&&!w.getURL().includes('/modules/'));return w?.executeJavaScript(code);},code);
 try{
  await expect.poll(()=>view("document.documentElement.dataset.ready==='true'").catch(()=>false),{timeout:45000}).toBe(true);
  const info=await view('window.desktop.authInfo()');assert.equal(info.app,'doc');assert.equal(info.version,require('../package.json').version);
  assert.equal(await view("document.querySelector('#model-dialog').open"),false);assert.equal((await view('window.doc.modelInfo()')).phase,'idle');
  assert.equal(await view("document.querySelector('#ai-recommendation').hidden"),false);
  await view("document.querySelector('#text-input').value='회의가 됬어요. 참석할수있습니다.';document.querySelector('#text-input').dispatchEvent(new Event('input'));document.querySelector('#scan').click()");
  await expect.poll(()=>view("Number(document.querySelector('#issue-count').textContent)")).toBeGreaterThan(0);
  const blocked=await view("Promise.all(['http://example.com','https://example.com'].map(async url=>{try{await fetch(url);return false;}catch{return true;}}))");assert.deepEqual(blocked,[true,true]);
  assert.match(await view('window.doc.licenseText()'),/공통 인증/);
  const report={version:info.version,date:new Date().toISOString(),productionExecutable:true,authentication:'real native bridge; no OTP, login or logout performed',checks:['startup with production preload and auth kit','no automatic AI dialog or download','local spelling and spacing scan','HTTP/HTTPS blocked','updated license bundled'],mutations:'covered by test:ui with external mock auth against packaged app.asar'};
  await fs.writeFile('docs/PACKAGED-UI-VERIFICATION.json',JSON.stringify(report,null,2));console.log(report);
 }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
