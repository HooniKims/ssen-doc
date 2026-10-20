'use strict';
const {test,expect,_electron}=require('@playwright/test');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const {zipSync,strToU8}=require('fflate');
let electron,page,profile,errors;
test.beforeEach(async()=>{profile=await fs.mkdtemp(path.join(os.tmpdir(),'ssendoc-ui-'));const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;electron=await _electron.launch({args:[path.resolve(__dirname,'../fixtures/auth-launch.cjs')],env});errors=[];electron.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));await expect.poll(()=>electron.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url(),{timeout:30000}).toBeTruthy();page=electron.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));await page.waitForSelector('#scan');await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await expect(page.locator('#model-dialog')).toBeHidden();});
test.afterEach(async()=>{if(electron){await electron.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await electron.close().catch(()=>{});}expect(errors).toEqual([]);});

const input='1. 운영 계획\n  1) 대상\n  2) 일정\n2. 세부 내용\n  3) 준비물\n  4) 유의 사항';
const expected='1. 운영 계획\n  가. 대상\n  나. 일정\n2. 세부 내용\n  가. 준비물\n  나. 유의 사항';
test('official text preview → adjust level → apply → undo → copy',async()=>{
 await page.locator('#text-input').fill(input);await page.locator('#official-open').click();
 await expect(page.locator('#official-dialog')).toBeVisible();await expect(page.locator('#official-summary')).toContainText('변경 4개');
 await expect(page.locator('#official-title')).toHaveText('공문 항목 정리');await expect(page.locator('#official-dialog')).not.toContainText('??');
 await page.locator('[data-official-level="2"]').selectOption('3');await expect(page.locator('#official-summary')).toContainText('변경 4개');
 await expect(page.locator('.official-row').nth(2)).toContainText('1) 일정');
 await page.locator('[data-official-level="2"]').selectOption('2');await expect(page.locator('.official-row').nth(2)).toContainText('나. 일정');
 await page.screenshot({path:'_workspace/official-preview-1280.png'});
 await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,700));
 await expect.poll(()=>page.evaluate(()=>window.innerWidth)).toBe(1024);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'_workspace/official-preview-1024.png'});
 await page.locator('#official-apply').click();await expect(page.locator('#text-input')).toHaveValue(expected);
 await page.locator('#official-undo').click();await expect(page.locator('#text-input')).toHaveValue(input);
 await page.locator('#official-open').click();await page.locator('#official-apply').click();await page.locator('#copy').click();
 expect(await electron.evaluate(({clipboard})=>clipboard.readText())).toBe(expected);
});
test('official HWPX preview → style-only edits → undo → save copy',async()=>{
 const bytes=require('../fixtures/official.cjs').fixture(),file=path.join(profile,'공문.hwpx'),output=path.join(profile,'공문_교정본.hwpx');await fs.writeFile(file,bytes);
 await electron.evaluate(({dialog},v)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[v.file]});dialog.showSaveDialog=async()=>({canceled:false,filePath:v.output});},{file,output});
 await page.locator('#mode-document').click();await expect(page.locator('#text-input')).toHaveValue('1. 운영 계획');
 await page.locator('#official-open').click();await expect(page.locator('#official-summary')).toContainText('변경 6개');
 await page.locator('#official-apply').click();await expect(page.locator('#save-document')).toBeEnabled();
 await page.locator('#official-undo').click();await expect(page.locator('#save-document')).toBeDisabled();
 await page.locator('#official-open').click();await page.locator('#official-apply').click();await page.locator('#save-document').click();
 await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);
 expect(await fs.readFile(file)).toEqual(bytes);
 const {officialRows}=require('../../modules/review/src/document-edit.cjs'),{formatRows}=require('../../src/official-format.cjs');
 expect(formatRows(officialRows(await fs.readFile(output),output)).changed).toBe(0);
 await page.locator('[data-block="1"]').click();await expect(page.locator('#text-input')).toHaveValue('가. 대상');
 await expect(page.locator('[data-block="1"]')).toContainText('교정본에 저장됨');
 await page.screenshot({path:'_workspace/official-document.png'});
});
test('ambiguous lists are explained and remain unchanged until a level is chosen',async()=>{
 await page.locator('#text-input').fill('1) 상위 없음\n- 구분 불명확\n2026. 10. 20.');await page.locator('#official-open').click();
 await expect(page.locator('#official-apply')).toBeDisabled();await expect(page.locator('#official-rows')).toContainText('상위 항목이 없습니다');
 await expect(page.locator('#official-rows')).toContainText('항목 단계가 명확하지');
 await page.locator('[data-official-level="0"]').selectOption('1');await expect(page.locator('#official-apply')).toBeEnabled();
 await page.locator('#official-apply').click();await expect(page.locator('#text-input')).toHaveValue('1. 상위 없음\n- 구분 불명확\n2026. 10. 20.');
});
