'use strict';
const { _electron,expect }=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {sha256}=require('../src/ai/model-manager.cjs'),catalog=require('../src/ai/models.json').models[0];
(async()=>{
 const profile=path.resolve('_workspace/model-lifecycle-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const packaged=process.argv.includes('--packaged');if(packaged)env.SSENDOC_AUTH_APP_ROOT=path.resolve(process.env.SSENDOC_RELEASE_DIR||'release','win-unpacked/resources/app.asar');const app=await _electron.launch({args:[path.resolve('tests/fixtures/auth-launch.cjs')],env});
 const importOnly=process.argv.includes('--import-only');
 const report={packaged,mode:importOnly?'direct import; network lifecycle not tested':'download lifecycle',authentication:"external mock fixture; real shared account untouched",started:new Date().toISOString(),checks:[]};
 try{
  await expect.poll(()=>app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url(),{timeout:30000}).toBeTruthy();
  const page=app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');if(await page.locator('#model-dialog').isVisible())await page.locator('#model-skip').click();await page.locator('#open-models').click();
  if(importOnly){
   await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},path.resolve('_workspace/ai-verification/models',catalog.filename));
   await page.locator('#model-import').click();await expect(page.locator('#model-delete')).toBeEnabled({timeout:60000});
   const imported=await page.evaluate(()=>window.doc.modelInfo());assert.equal(await sha256(imported.installed.path),catalog.sha256);report.checks.push('real GGUF direct import and SHA-256 verified');
   await page.locator('#model-skip').click();await page.locator('#text-input').fill('할수있어요.');await page.locator('#ai-scan').click();await expect(page.locator('#ai-cancel')).toBeHidden({timeout:90000});
   const notice=await page.locator('#notice').innerText();assert.match(notice,/AI 검사가 끝났습니다/);assert.doesNotMatch(notice,/시간 초과|중지했습니다|응답 형식|직접 확인/);report.checks.push({cpuInferenceNotice:notice});
   await page.locator('#open-models').click();await page.locator('#model-delete').click();await page.locator('#confirm-delete').click();await expect(page.locator('#model-delete')).toBeDisabled();assert.equal((await fs.readdir(path.join(profile,'models'))).filter(f=>f.endsWith('.gguf')).length,0);report.checks.push('real model deleted after unloading');
   report.completed=new Date().toISOString();await fs.writeFile('docs/MODEL-IMPORT'+(packaged?'-PACKAGED':'')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));return;
  }
  await page.locator('#model-download').click();
  await expect.poll(()=>page.evaluate(async()=> (await window.doc.modelInfo()).received),{timeout:90000}).toBeGreaterThan(1024*1024);
  await page.locator('#model-pause').click();await expect(page.locator('#model-download')).toHaveText('다운로드 재개');
  const paused=await page.evaluate(()=>window.doc.modelInfo());assert.equal(paused.phase,'paused');report.checks.push({pauseBytes:paused.received});
  await page.locator('#model-download').click();await expect.poll(()=>page.evaluate(async()=>Boolean((await window.doc.modelInfo()).installed)),{timeout:240000}).toBe(true);
  let info=await page.evaluate(()=>window.doc.modelInfo());assert.equal(await sha256(info.installed.path),catalog.sha256);report.checks.push('real download, pause, resume, SHA-256 verified');
  await page.locator('#model-skip').click();await page.locator('#text-input').fill('할수있어요.');await page.locator('#ai-scan').click();await expect(page.locator('#ai-cancel')).toBeHidden({timeout:90000});
  const notice=await page.locator('#notice').innerText();assert.match(notice,/AI 검사가 끝났습니다/);assert.doesNotMatch(notice,/시간 초과|중지했습니다|응답 형식|직접 확인/);report.checks.push({cpuInferenceNotice:notice});
  await page.locator('#open-models').click();await page.locator('#model-delete').click();await page.locator('#confirm-delete').click();await expect(page.locator('#model-delete')).toBeDisabled();assert.equal((await fs.readdir(path.join(profile,'models'))).filter(f=>f.endsWith('.gguf')).length,0);report.checks.push('real model deleted after unloading');
  await page.locator('#model-download').click();await expect.poll(()=>page.evaluate(async()=>Boolean((await window.doc.modelInfo()).installed)),{timeout:240000}).toBe(true);info=await page.evaluate(()=>window.doc.modelInfo());assert.equal(await sha256(info.installed.path),catalog.sha256);report.checks.push('redownload after deletion verified');
  await page.screenshot({path:'docs/ui-real-model'+(packaged?'-packaged':'')+'.png'});
  await page.locator('#model-delete').click();await page.locator('#confirm-delete').click();await expect(page.locator('#model-delete')).toBeDisabled();
  await app.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},path.resolve('_workspace/ai-verification/models',catalog.filename));
  await page.locator('#model-import').click();await expect(page.locator('#model-delete')).toBeEnabled({timeout:60000});info=await page.evaluate(()=>window.doc.modelInfo());assert.equal(await sha256(info.installed.path),catalog.sha256);report.checks.push('real GGUF direct import verified');
  report.completed=new Date().toISOString();await fs.writeFile('docs/MODEL-LIFECYCLE'+(packaged?'-PACKAGED':'')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
