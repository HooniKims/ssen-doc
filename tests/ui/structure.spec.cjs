'use strict';
const {test,expect,_electron}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
let app,page,profile;
test.beforeEach(async()=>{
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'ssendoc-structure-ui-'));const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({args:[path.resolve('tests/fixtures/ai-launch.cjs')],env});
 await expect.poll(()=>app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url(),{timeout:30000}).toBeTruthy();
 page=app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
 await app.evaluate(()=>{
  const {ModelManager,LocalAI}=globalThis.__aiTestClasses,info=ModelManager.prototype.info,review=LocalAI.prototype.reviewStructure;
  ModelManager.prototype.info=function(){return {...info.call(this),installed:{path:'test.gguf',bytes:32},phase:'ready'};};ModelManager.prototype.modelPath=()=> 'test.gguf';
  globalThis.__structureMode='normal';globalThis.__structureCalls=0;
  LocalAI.prototype.reviewStructure=function(...args){this.loadRuntime=async()=>({getLlama:async()=>({loadModel:async()=>({dispose:async()=>{},createContext:async()=>({dispose:async()=>{},getSequence:()=>({clearHistory:async()=>{}})})}),createGrammarForJsonSchema:async s=>s}),QwenChatWrapper:class{},LlamaChatSession:class{dispose(){}async prompt(text,options){
   globalThis.__structureCalls++;
   if(globalThis.__structureMode==='cancel')await new Promise((resolve,reject)=>{if(options.signal.aborted)return reject(Error('aborted'));options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
   if(globalThis.__structureMode==='invalid')return '{"choice":"level99"}';
   return options.grammar.properties.confirmed?'{"confirmed":true}':'{"choice":"level2"}';
  }}});return review.apply(this,args);};
 });
 await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
});
test.afterEach(async()=>{await app?.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app?.close();});
const input='1. 행사 안내\n  - 대상: 학생\n  - 장소: 강당';
test('structure harness proposes, previews and applies only after selection; undo restores input',async()=>{
 await page.locator('#text-input').fill(input);await page.locator('#official-open').click();await page.locator('#official-ai').click();
 await expect(page.locator('#official-ai-status')).toContainText('제안 2개');await expect(page.locator('#text-input')).toHaveValue(input);
 await page.locator('#official-ai-accept').click();await expect(page.locator('#official-rows')).toContainText('가. 대상');await expect(page.locator('#text-input')).toHaveValue(input);
 await page.screenshot({path:'_workspace/structure-preview.png'});
 await page.locator('#official-apply').click();await expect(page.locator('#text-input')).toHaveValue('1. 행사 안내\n  가. 대상: 학생\n  나. 장소: 강당');
 await page.locator('#official-undo').click();await expect(page.locator('#text-input')).toHaveValue(input);
});
test('cancel and invalid output never become edits or a clean result',async()=>{
 await page.locator('#text-input').fill(input);await page.locator('#official-open').click();await app.evaluate(()=>globalThis.__structureMode='cancel');await page.locator('#official-ai').click();
 await expect.poll(()=>app.evaluate(()=>globalThis.__structureCalls)).toBeGreaterThan(0);await page.locator('#official-ai-cancel').click();await expect(page.locator('#official-ai-status')).toContainText('중단');await expect(page.locator('#official-ai-accept')).toBeHidden();
 await app.evaluate(()=>globalThis.__structureMode='invalid');await page.locator('#official-ai').click();await expect(page.locator('#official-ai-status')).toContainText('실패 2');await expect(page.locator('#official-ai-accept')).toBeHidden();await expect(page.locator('#text-input')).toHaveValue(input);
});
for(const native of [false,true])test(`table ${native?'native numbering':'manual markers'} applies all cell paragraphs and saves intact`,async()=>{
 const bytes=require('../fixtures/official-advanced.cjs').advanced({native}),file=path.join(profile,'table.hwpx'),output=path.join(profile,'table-fixed.hwpx');await fs.writeFile(file,bytes);
 await app.evaluate(({dialog},v)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[v.file]});dialog.showSaveDialog=async()=>({canceled:false,filePath:v.output});},{file,output});
 await page.locator('#mode-document').click();await expect(page.locator('#text-input')).toHaveValue('일반 본문');await page.locator('#official-open').click();await expect(page.locator('#official-summary')).toContainText('변경 5개');await page.locator('#official-apply').click();await page.locator('#save-document').click();
 await expect.poll(()=>fs.stat(output).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);expect(await fs.readFile(file)).toEqual(bytes);
 const {officialRows}=require('../../modules/review/src/document-edit.cjs'),{formatRows}=require('../../src/official-format.cjs');const result=officialRows(await fs.readFile(output),output);
 expect(formatRows(result).changed).toBe(0);expect(result.filter(r=>r.native).length).toBe(native?5:0);
 await page.locator('[data-block="1"]').click();await expect(page.locator('#text-input')).toHaveValue(native?'운영 계획\n대상\n일정':'1. 운영 계획\n가. 대상\n나. 일정');
});
