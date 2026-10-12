'use strict';
const {test,expect,_electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {GATED}=require('../../app/auth-policy.cjs');
let app,page,profile,errors;
test.beforeEach(async({},testInfo)=>{
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'ssendoc-auth-ui-'));
 const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1',SSENDOC_AUTH_LOCKED:testInfo.title.includes('logout')?'0':'1'};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({args:[path.resolve(__dirname,'../fixtures/auth-launch.cjs')],env});errors=[];
 app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 await expect.poll(()=>app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url(),{timeout:30000}).toBeTruthy();
 page=app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));
 await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
});
test.afterEach(async()=>{if(app){await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app.close();}expect(errors).toEqual([]);});
test('auth UI, free inspection, protected correction, safe diagnostics and shared state',async()=>{
 await expect(page.locator('#authDialog')).toBeVisible();await expect(page.locator('#authTitle')).toHaveText('쎈 시리즈 이용권');
 await expect(page.locator('#authDialog')).toContainText('@senedu.kr');
 await page.screenshot({path:'docs/ui-auth.png',fullPage:true});
 await page.locator('#authClose').click();await expect(page.locator('#authBar')).toContainText('문서 열기·검사는 계속 사용할 수 있습니다.');
 const text='회의가 됬어요. 참석할수있습니다.';
 await page.locator('#text-input').fill(text);await page.locator('#scan').click();await expect(page.locator('#issue-count')).not.toHaveText('0');
 await page.screenshot({path:'docs/ui-auth-protected.png',fullPage:true});
 await page.locator('#apply-all').click();await expect(page.locator('#authDialog')).toBeVisible();await expect(page.locator('#text-input')).toHaveValue(text);
 const result=await page.evaluate(async()=>({invalid:await window.desktop.authCommand('peek'),link:await window.desktop.openExternal('https://example.com/?text=secret'),copy:await window.desktop.copyText('this must never be copied')}));
 expect(result.invalid.error).toBeTruthy();expect(result.link.error).toBeTruthy();expect(result.copy).toBe(true);
 const report=JSON.parse(await app.evaluate(({clipboard})=>clipboard.readText()));expect(report.app).toBe('SsenDoc');expect(report.events).toEqual([]);expect(report.email).toBeUndefined();
 for(const route of ['review','lite']){await page.evaluate(r=>window.doc.navigate(r),route);const target=app.windows().find(p=>p.url().includes('/modules/'+route+'/'));await expect(target.locator('#authButton')).toHaveText('작업 보호 모드');}
 expect(await app.evaluate(()=>globalThis.__authFixture.appId)).toBe('doc');
});
test('all protected main IPCs reject direct calls before dialogs, clipboard or file work',async()=>{
 const results=await app.evaluate(async({ipcMain,webContents,clipboard,dialog},names)=>{
  const sender=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/app/index.html')&&!w.getURL().includes('/modules/'));
  let dialogs=0;dialog.showSaveDialog=dialog.showOpenDialog=async()=>{dialogs++;throw Error('must not open');};await clipboard.writeText('sentinel');
  const values=[];for(const name of names){const r=await ipcMain._invokeHandlers.get(name)({sender,senderFrame:sender.mainFrame},'forged payload');values.push([name,r.code]);}
  return {values,dialogs,clipboard:await clipboard.readText(),checks:globalThis.__authFixture.authorizeCalls};
 },[...GATED]);
 expect(results.values).toEqual([...GATED].map(name=>[name,'AUTH_REQUIRED']));expect(results.dialogs).toBe(0);expect(results.clipboard).toBe('sentinel');expect(results.checks).toBe(GATED.size);
 expect((await fs.readdir(profile)).some(n=>n.endsWith('.hwpx')||n.endsWith('.txt'))).toBe(false);
});
test('renderer network stays blocked while main Chromium network works',async()=>{
 const result=await app.evaluate(async({session,net})=>{
  const http=process.getBuiltinModule('http');let requests=0;
  const server=http.createServer((_q,r)=>{requests++;r.end('network-fixture');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';let blocked=false;
  try{await session.fromPartition('ssendoc-renderer').fetch(url);}catch{blocked=true;}
  const response=await net.fetch(url);const text=await response.text();await new Promise(r=>server.close(r));return {blocked,text,requests};
 });
 expect(result).toEqual({blocked:true,text:'network-fixture',requests:1});
});
test('logout invalidates cached authorization and propagates to all three views',async()=>{
 if(await page.locator('#model-dialog').isVisible())await page.locator('#model-skip').click();
 expect(await page.evaluate(()=>window.desktop.authorizeEdit())).toEqual({ok:true});
 expect((await page.evaluate(()=>window.desktop.authCommand('logout'))).ok).toBe(true);
 expect((await page.evaluate(()=>window.doc.copy('should not be copied'))).code).toBe('AUTH_REQUIRED');
 for(const route of ['spell','review','lite']){
  await page.evaluate(r=>window.doc.navigate(r),route);
  if(route!=='spell')await expect.poll(()=>app.windows().some(p=>p.url().includes('/modules/'+route+'/')),{timeout:30000}).toBe(true);
  const target=route==='spell'?page:app.windows().find(p=>p.url().includes('/modules/'+route+'/'));
  await expect(target.locator('#authButton')).toHaveText('작업 보호 모드');
 }
});
