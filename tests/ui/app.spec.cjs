'use strict';
const {test,expect,_electron}=require('@playwright/test');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const {zipSync,strToU8}=require('fflate');
let electron,page,profile,errors;
test.beforeEach(async()=>{profile=await fs.mkdtemp(path.join(os.tmpdir(),'ssendoc-ui-'));const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;electron=await _electron.launch({args:[path.resolve(__dirname,'../fixtures/auth-launch.cjs')],env});errors=[];electron.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));await expect.poll(()=>electron.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url(),{timeout:30000}).toBeTruthy();page=electron.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));await page.waitForSelector('#scan');await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await expect(page.locator('#model-dialog')).toBeHidden();});
test.afterEach(async()=>{if(electron){await electron.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await electron.close().catch(()=>{});}expect(errors).toEqual([]);});
test('paste → spell and spacing → apply → copy → undo → text/HTML save',async()=>{
 const text='내일 체험학습에 참여할수있습니다. 회의가 됬어요. 왠지 기분이 좋고 깍두기를 먹어요.';
 await electron.evaluate(({clipboard},t)=>clipboard.writeText(t),text);await page.locator('#clipboard').click();await expect(page.locator('#text-input')).toHaveValue(text);await page.locator('#scan').click();await expect(page.locator('#issue-count')).not.toHaveText('0');await expect(page.locator('#model-dialog')).toBeHidden();await page.locator('#apply-all').click();const corrected='내일 체험학습에 참여할 수 있습니다. 회의가 됐어요. 왠지 기분이 좋고 깍두기를 먹어요.';await expect(page.locator('#text-input')).toHaveValue(corrected);await page.locator('#copy').click();expect(await electron.evaluate(({clipboard})=>clipboard.readText())).toBe(corrected);await page.locator('#undo').click();await expect(page.locator('#text-input')).toHaveValue(text);
 const output=path.join(profile,'corrected.txt');await electron.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},output);await page.locator('#save-text').click();await expect.poll(()=>fs.readFile(output,'utf8').catch(()=>null)).toBe(text);await page.screenshot({path:'docs/ui-spelling.png',fullPage:true});
});
test('document discovery → paragraph correction → save copy keeps source bytes',async()=>{
 const file=path.join(profile,'문서.hwpx'),output=path.join(profile,'문서_교정본.hwpx');const bytes=Buffer.from(zipSync({mimetype:[strToU8('application/hwp+zip'),{level:0}],'Contents/section0.xml':strToU8('<hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p><hp:run charPrIDRef="4"><hp:t>회의가 됬어요. 참석할수있습니다.</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>왠지 기분이 좋다.</hp:t></hp:run></hp:p></hs:sec>'),'Contents/header.xml':strToU8('<head keep="true"/>')}));await fs.writeFile(file,bytes);
 await electron.evaluate(({dialog},v)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[v.file]});dialog.showSaveDialog=async()=>({canceled:false,filePath:v.output});},{file,output});
 await page.locator('#mode-document').click();await expect(page.locator('#text-input')).toHaveValue('회의가 됬어요. 참석할수있습니다.');await expect(page.locator('#apply-all')).toBeEnabled();await page.locator('#apply-all').click();await expect(page.locator('#text-input')).toHaveValue('회의가 됐어요. 참석할 수 있습니다.');await expect(page.locator('#save-document')).toBeEnabled();await page.locator('#save-document').click();await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);expect(await fs.readFile(file)).toEqual(bytes);const {parseDocument}=require('../../modules/review/src/documents.cjs');expect(parseDocument(await fs.readFile(output),output).blocks[0].text).toBe('회의가 됐어요. 참석할 수 있습니다.');await page.screenshot({path:'docs/ui-document-spelling.png',fullPage:true});
});
test('unified navigation retains state; real comparison and image compression',async()=>{
 await page.locator('#text-input').fill('임시 작성 중인 글');await page.locator('[data-route=review]').click();await expect.poll(()=>electron.windows().some(p=>p.url().includes('/modules/review/')),{timeout:30000}).toBe(true);const review=electron.windows().find(p=>p.url().includes('/modules/review/'));await review.locator('#demo').click();await review.locator('#scan').click();await expect(review.locator('#scan-status')).toHaveText('검사가 끝났어요');await expect(review.locator('#issue-badge')).not.toHaveText('0');await review.screenshot({path:'docs/ui-review.png',fullPage:true});await review.locator('[data-route=lite]').click();await expect.poll(()=>electron.windows().some(p=>p.url().includes('/modules/lite/')),{timeout:30000}).toBe(true);const lite=electron.windows().find(p=>p.url().includes('/modules/lite/'));await lite.locator('#demo').click();await lite.locator('#start').click();await expect(lite.locator('.result-actions')).toBeVisible({timeout:90000});await expect(lite.locator('.file-error')).toHaveCount(0);await lite.screenshot({path:'docs/ui-lite.png',fullPage:true});await lite.locator('[data-route=spell]').click();await expect(page.locator('#text-input')).toHaveValue('임시 작성 중인 글');
});
test('settings dialog shows copyright and toggles the license text',async()=>{
 await page.locator('#open-update').click();await expect(page.locator('#update-dialog .app-copy')).toContainText('© 2026 상명초 김승현, 등촌중 김형훈');await expect(page.locator('#license-text')).toBeHidden();
 await page.locator('#license-toggle').click();await expect(page.locator('#license-text')).toBeVisible();await expect(page.locator('#license-text')).toContainText('쎈doc 이용약관');await expect(page.locator('#license-text')).toContainText('김승현');await expect(page.locator('#license-toggle')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#license-toggle')).toHaveText('이용약관 닫기');await page.screenshot({path:'docs/ui-license.png'});
 await page.locator('#license-toggle').click();await expect(page.locator('#license-text')).toBeHidden();await expect(page.locator('#license-toggle')).toHaveText('이용약관 보기');
});
test('renderer network blocked and AI management controls are present',async()=>{
 const blocked=await page.evaluate(async()=>{try{await fetch('https://example.com/?text=synthetic-test');return false;}catch{return true;}});expect(blocked).toBe(true);await page.locator('#open-models').click();await expect(page.locator('#model-download')).toBeEnabled();await expect(page.locator('#model-import')).toBeEnabled();await expect(page.locator('#model-delete')).toBeDisabled();await expect(page.locator('#model-options input')).toHaveCount(1);await expect(page.locator('#model-options input')).toHaveValue('qwen3-0.6b');await expect(page.locator('#model-options input')).toBeChecked();await expect(page.locator('#model-dialog')).toContainText('약 400MB');await expect(page.locator('#model-dialog')).not.toContainText('EXAONE');await page.screenshot({path:'docs/ui-models.png',fullPage:true});
});
test('local AI stays optional on startup, basic scan, skip and reload',async()=>{
 await expect(page.locator('#model-dialog')).toBeHidden();await expect(page.locator('#ai-scan')).toHaveText('AI 검사 켜기 (선택)');
 await expect(page.locator('#ai-recommendation')).toBeVisible();await expect(page.locator('#ai-recommendation')).toContainText('선택 사항');await page.screenshot({path:'docs/ui-ai-recommendation.png',fullPage:true});
 await page.locator('#text-input').fill('회의가 됬어요.');await page.locator('#scan').click();await expect(page.locator('#issue-count')).not.toHaveText('0');
 await expect(page.locator('#model-dialog')).toBeHidden();expect(await appDownloadCalls()).toBe(0);
 await page.locator('#ai-recommendation-open').click();await expect(page.locator('#model-dialog')).toBeVisible();await expect(page.locator('#model-dialog')).toContainText('선택 사항');
 await expect(page.locator('#model-download')).toBeEnabled();await expect(page.locator('#model-skip')).toBeVisible();expect(await appDownloadCalls()).toBe(0);
 await page.screenshot({path:'docs/ui-ai-optional.png',fullPage:true});await page.locator('#model-skip').click();
 await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await expect(page.locator('#model-dialog')).toBeHidden();expect(await appDownloadCalls()).toBe(0);
 expect((await page.evaluate(()=>window.doc.modelInfo())).phase).toBe('idle');
 await expect(page.locator('#ai-recommendation')).toBeHidden();
});
test('skipping the initial AI recommendation persists without a download and permits later setup',async()=>{
 await expect(page.locator('#ai-recommendation')).toBeVisible();await page.locator('#ai-recommendation-skip').click();await expect(page.locator('#ai-recommendation')).toBeHidden();
 await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await expect(page.locator('#ai-recommendation')).toBeHidden();await expect(page.locator('#model-dialog')).toBeHidden();
 await page.locator('#text-input').fill('회의가 됬어요.');await page.locator('#scan').click();await expect(page.locator('#issue-count')).not.toHaveText('0');expect(await appDownloadCalls()).toBe(0);
 await page.locator('#ai-scan').click();await expect(page.locator('#model-dialog')).toBeVisible();expect(await appDownloadCalls()).toBe(0);
});
async function appDownloadCalls(){return electron.evaluate(()=>globalThis.__authFixture.modelDownloadCalls);}

test('quiet spelling shows no dictionary guesses or generic context reminders',async()=>{
 const corpus=require('../fixtures/spelling-quality.cjs');
 await page.locator('#text-input').fill(corpus.correct.join('\n'));await page.locator('#scan').click();
 await expect(page.locator('#notice')).toContainText('뚜렷한 오류를 찾지 못했습니다');
 await expect(page.locator('#issue-count')).toHaveText('0');await expect(page.locator('.issue')).toHaveCount(0);
 await expect(page.locator('#highlights')).toBeHidden();await expect(page.locator('#apply-all')).toBeDisabled();
 await expect(page.locator('#issues')).not.toContainText('사전에 없는');
});

test('quiet spelling groups repeats, navigates locations, filters highlights and remembers ignore',async()=>{
 const text='회의가 됬어요. 준비가 됬어요.';
 await page.locator('#text-input').fill(text);await page.locator('#scan').click();
 await expect(page.locator('#issue-count')).toHaveText('1');await expect(page.locator('.issue')).toHaveCount(1);
 await expect(page.locator('#issue-summary')).toHaveText('1가지 수정 · 2곳');await expect(page.locator('#highlights mark')).toHaveCount(2);
 await page.locator('.issue').click();await expect(page.locator('.occurrences')).toContainText('1 / 2곳');
 await page.locator('#next-issue').click();expect(await page.locator('#text-input').evaluate(e=>e.selectionStart)).toBe(text.lastIndexOf('됬'));
 await page.locator('#issue-filter').selectOption('grammar');await expect(page.locator('#issue-count')).toHaveText('0');
 await expect(page.locator('#highlights')).toBeHidden();await expect(page.locator('#issue-detail')).toBeHidden();
 await page.locator('#issue-filter').selectOption('spelling');await expect(page.locator('#issue-count')).toHaveText('1');
 await page.locator('.issue').click();await page.locator('#ignore-one').click();await page.locator('#scan').click();
 await expect(page.locator('#notice')).toContainText('뚜렷한 오류를 찾지 못했습니다');await expect(page.locator('.issue')).toHaveCount(0);
});

test('quiet spelling evidence is collapsible, source links are allowlisted and one occurrence applies',async()=>{
 await page.locator('#ai-recommendation-skip').click();
 await page.locator('#text-input').fill('학부모님께 안내드립니다. 회의가 됬어요. 준비가 됬어요. 참여할수있습니다.');await page.locator('#scan').click();
 await page.locator('.issue').filter({hasText:'됬'}).click();await expect(page.locator('.issue-evidence')).toContainText('한글 맞춤법 제35항');
 await expect(page.locator('#open-evidence')).toBeHidden();await page.locator('.issue-evidence summary').click();
 await electron.evaluate(({shell})=>{globalThis.__openedEvidence=null;shell.openExternal=async url=>{globalThis.__openedEvidence=url;};});
 await page.locator('#open-evidence').click();expect(await electron.evaluate(()=>globalThis.__openedEvidence)).toContain('korean.go.kr/');
 expect(await page.evaluate(()=>window.desktop.openExternal('https://example.com/'))).toEqual({error:'허용되지 않은 링크입니다.'});
 await page.locator('.issue-evidence summary').click();await page.evaluate(()=>document.querySelector('main').scrollTop=0);
 await page.screenshot({path:'_workspace/quiet-spelling-1280.png',fullPage:true});
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,700));
 await expect.poll(()=>page.evaluate(()=>window.innerWidth)).toBe(1024);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.locator('.issues-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'_workspace/quiet-spelling-1024.png',fullPage:true});
 await page.locator('#apply-one').click();await expect(page.locator('#text-input')).toHaveValue('학부모님께 안내드립니다. 회의가 됐어요. 준비가 됬어요. 참여할수있습니다.');
 await expect(page.locator('.repeat-count')).toHaveCount(0);
 await page.locator('#apply-all').click();await expect(page.locator('#text-input')).toHaveValue('학부모님께 안내드립니다. 회의가 됐어요. 준비가 됐어요. 참여할 수 있습니다.');
 await expect(page.locator('#issue-count')).toHaveText('0');
});

test('quiet spelling keeps sentence agreement separate and applies only after selection',async()=>{
 const text='저의 목표는 학생들이 안전하게 귀가합니다.';
 await page.locator('#text-input').fill(text);await page.locator('#scan').click();
 await expect(page.locator('.issue')).toHaveCount(1);await expect(page.locator('.issue')).toContainText('문장 호응');await expect(page.locator('#apply-all')).toBeDisabled();
 await page.locator('#issue-filter').selectOption('spelling');await expect(page.locator('.issue')).toHaveCount(0);await expect(page.locator('#highlights')).toBeHidden();
 await page.locator('#issue-filter').selectOption('grammar');await page.locator('.issue').click();
 await expect(page.locator('.issue-evidence')).toContainText('문장 성분의 호응');await page.locator('#apply-one').click();
 await expect(page.locator('#text-input')).toHaveValue('저의 목표는 학생들이 안전하게 귀가하는 것입니다.');await expect(page.locator('.issue')).toHaveCount(0);
});
