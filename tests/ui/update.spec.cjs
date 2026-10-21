const {test,expect,_electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
let electron,page,profile,errors;
test.beforeEach(async({},testInfo)=>{
 profile=path.resolve('_workspace/ui-update-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
 if(testInfo.title.startsWith('ZIP'))env.SSENDOC_UPDATE_ZIP='1';
 if(testInfo.title.startsWith('saved'))await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({update:{autoCheck:false,skippedVersion:'9.8.7'}}));
 electron=await _electron.launch({args:[path.resolve('tests/fixtures/update-launch.cjs')],env});errors=[];electron.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 await expect.poll(()=>electron.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url()).toBeTruthy();
 page=electron.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));
 await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
});
test('ZIP notice opens the official release without calling the installer',async()=>{
 await electron.evaluate(({shell})=>{globalThis.__openedRelease=null;shell.openExternal=async url=>{globalThis.__openedRelease=url;};});
 await check();await expect(page.locator('#sen-update-now')).toHaveText('새 ZIP 받기');await expect(page.locator('#sen-update-hint')).toContainText('ZIP 파일 약 218MB');
 await page.locator('#sen-update-now').click();
 await expect.poll(()=>electron.evaluate(()=>globalThis.__openedRelease)).toBe('https://github.com/HooniKims/ssen-doc/releases/latest');
 expect(await electron.evaluate(()=>globalThis.__updateFixture.downloads+globalThis.__updateFixture.installs)).toBe(0);
});
test('saved skip and automatic-check preferences load on startup while manual checks remain available',async()=>{
 await check();await expect(page.locator('#sen-update-notice')).toBeHidden();await expect(page.locator('#sen-update-dot')).toBeHidden();
 await page.locator('#sen-version-button').click();await expect(page.locator('#sen-update-auto')).not.toBeChecked();await expect(page.locator('#update-check')).toBeEnabled();
 await page.keyboard.press('Escape');await electron.evaluate(()=>globalThis.__updateFixture.version='9.8.8');await check();
 await expect(page.locator('#sen-update-notice')).toBeVisible();await expect(page.locator('#sen-update-dot')).toBeVisible();
});
test('network errors retain the known update badge and latest-version results clear stale notes',async()=>{
 await check();await electron.evaluate(()=>globalThis.__updateFixture.engine.emit('error',new Error('offline')));
 await expect(page.locator('#sen-update-dot')).toBeVisible();await expect(page.locator('#sen-update-notice')).toBeHidden();
 await page.locator('#sen-version-button').click();await expect(page.locator('#update-message')).toContainText('인터넷 연결');
 await electron.evaluate(()=>globalThis.__updateFixture.engine.emit('update-not-available'));
 await expect(page.locator('#sen-update-dot')).toBeHidden();await expect(page.locator('#sen-update-detail-notes')).toBeHidden();await expect(page.locator('#update-message')).toContainText('최신 버전');
});
test.afterEach(async()=>{if(electron){await electron.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await electron.close();}expect(errors).toEqual([]);});
const check=()=>electron.evaluate(()=>globalThis.__updateFixture.updater.check());
test('automatic update wiring, notice, release details and version badge across all workspaces',async()=>{
 await expect.poll(()=>electron.evaluate(()=>globalThis.__updateFixture.starts)).toBe(1);
 await expect(page.locator('#sen-update-dot')).toBeHidden();await check();
 await expect(page.locator('#sen-update-notice')).toBeVisible();await expect(page.locator('#sen-update-dot')).toBeVisible();
 await expect(page.locator('#sen-update-notice')).toContainText('9.8.7');await expect(page.locator('#sen-update-notes')).toContainText('공문 항목');await expect(page.locator('#sen-update-hint')).toContainText('175MB');
 await page.screenshot({path:'_workspace/update-notification/ssendoc-notice.png'});
 await page.locator('#sen-update-later').click();await expect(page.locator('#sen-update-notice')).toBeHidden();await expect(page.locator('#sen-update-dot')).toBeVisible();
 await check();await expect(page.locator('#sen-update-notice')).toBeHidden();
 for(const route of ['review','lite','spell']){
  await page.locator(`[data-route=${route}]`).click();
  page=electron.windows().find(p=>route==='spell'?p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'):p.url().includes(`/modules/${route}/app/index.html`));
  await expect(page.locator('#sen-update-dot')).toBeVisible();await expect(page.locator('#sen-update-notice')).toBeHidden();
  await page.locator('#sen-version-button').click();await expect(page.locator('#update-dialog')).toBeVisible();
  await expect(page.locator('#sen-update-detail-notes')).toContainText('표와 자동 문단 번호');await expect(page.locator('#sen-update-checked')).not.toContainText('아직');
  if(route==='spell')await page.screenshot({path:'_workspace/update-notification/ssendoc-update-dialog.png'});
  await page.keyboard.press('Escape');
 }
 expect(await electron.evaluate(()=>globalThis.__updateFixture.downloads)).toBe(0);
});
test('skip is persisted, later releases notify, and download never restarts without confirmation',async()=>{
 await check();await page.locator('#sen-update-skip').click();await expect(page.locator('#sen-update-dot')).toBeHidden();await expect(page.locator('#sen-update-notice')).toBeHidden();
 expect(JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8')).update.skippedVersion).toBe('9.8.7');
 await check();await expect(page.locator('#sen-update-notice')).toBeHidden();
 await electron.evaluate(()=>globalThis.__updateFixture.version='9.8.8');await check();await expect(page.locator('#sen-update-notice')).toBeVisible();
 await page.locator('#sen-update-now').click();await expect(page.locator('#update-dialog')).toBeVisible();await expect(page.locator('#update-install')).toBeVisible();
 expect(await electron.evaluate(()=>globalThis.__updateFixture.downloads)).toBe(1);expect(await electron.evaluate(()=>globalThis.__updateFixture.installs)).toBe(0);
 await page.keyboard.press('Escape');await expect(page.locator('#sen-update-now')).toHaveText('다시 시작해서 적용');await expect(page.locator('#sen-update-hint')).toContainText('작업을 저장');await expect(page.locator('#sen-update-skip')).toBeHidden();
 await page.screenshot({path:'_workspace/update-notification/ssendoc-update-ready.png'});
 await page.locator('#sen-version-button').click();await page.locator('#sen-update-auto').uncheck();
 await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8')).update.autoCheck).toBe(false);
 await electron.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});await page.locator('#update-install').click();
 expect(await electron.evaluate(()=>globalThis.__updateFixture.installs)).toBe(0);
});
test('notice fits the minimum window and release notes are rendered as text',async()=>{
 await check();
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,700));
 await electron.evaluate(()=>globalThis.__updateFixture.engine.emit('update-available',{version:'9.8.7',releaseNotes:'- <img src=x onerror=alert(1)>본문\n- **안내** [보기](https://example.com)'}));
 await expect(page.locator('#sen-update-notice')).toBeVisible();await expect(page.locator('#sen-update-notes img')).toHaveCount(0);
 const box=await page.locator('#sen-update-notice').boundingBox();expect(box.x).toBeGreaterThan(0);expect(box.x+box.width).toBeLessThanOrEqual(1024);expect(box.y+box.height).toBeLessThanOrEqual(700);
 await page.screenshot({path:'_workspace/update-notification/ssendoc-notice-1024.png'});
});
