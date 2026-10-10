'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{_electron,expect}=require('@playwright/test');
function run(file,args){return new Promise((resolve,reject)=>{const p=spawn(file,args,{windowsHide:true,stdio:'ignore'});p.on('error',reject);p.on('exit',code=>code===0?resolve(code):reject(Error(`Installer exit ${code}`)));});}
(async()=>{
 const root=path.resolve('_workspace/install-test'),profile=path.resolve('_workspace/installed-profile');await fs.mkdir(root,{recursive:true});
 await run(path.resolve('release/SsenDoc-Setup-1.0.0.exe'),['/S','/D='+root]);
 const executable=path.join(root,'SsenDoc.exe');assert.ok((await fs.stat(executable)).size>1000000);
 const env={...process.env,SSENDOC_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.SSENDOC_TEST_HIDDEN;
 const app=await _electron.launch({executablePath:executable,args:[],env});let report;
 try{
  const view=code=>app.evaluate(async({webContents},script)=>{const w=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/app/index.html')&&!w.getURL().includes('/modules/'));return w?.executeJavaScript(script);},code);
  await expect.poll(()=>view("document.documentElement.dataset.ready==='true'").catch(()=>false),{timeout:30000}).toBe(true);
  await view("document.querySelector('#text-input').value='회의가 됬어요. 참여할수있습니다.';document.querySelector('#text-input').dispatchEvent(new Event('input'));document.querySelector('#scan').click()");
  await expect.poll(()=>view("Number(document.querySelector('#issue-count').textContent)")).toBeGreaterThan(0);
  await view("if(document.querySelector('#model-dialog').open)document.querySelector('#model-skip').click();document.querySelector('#apply-all').click()");await expect.poll(()=>view("document.querySelector('#text-input').value")).toBe('회의가 됐어요. 참여할 수 있습니다.');
  const update=await view('window.doc.updateState()');assert.equal(update.mode,'installed');const liveUpdate=await view('window.doc.checkUpdate()');
  report={date:new Date().toISOString(),installation:'NSIS silent install exit 0',executable,spellAndSpacing:'passed',testAutomationFlag:false,updateMode:update.mode,liveUpdate};
 }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app.close();}
 const uninstall=(await fs.readdir(root)).find(f=>/^Uninstall.*\.exe$/.test(f));assert.ok(uninstall);await run(path.join(root,uninstall),['/S']);await expect.poll(()=>fs.stat(executable).then(()=>true).catch(()=>false),{timeout:30000}).toBe(false);report.uninstall='exit 0; installed executable removed';await fs.writeFile('docs/INSTALL-VERIFICATION.json',JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1;});
