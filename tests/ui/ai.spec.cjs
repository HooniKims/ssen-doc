'use strict';
const {test,expect,_electron}=require('@playwright/test'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {zipSync,strToU8}=require('fflate');
let app,page,profile;
test.beforeEach(async()=>{
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'ssendoc-ai-ui-'));const env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({args:[path.resolve('tests/fixtures/ai-launch.cjs')],env});
 await expect.poll(()=>app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url(),{timeout:30000}).toBeTruthy();
 page=app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
 await app.evaluate(({app})=>{
  const {ModelManager,LocalAI}=globalThis.__aiTestClasses;
  const info=ModelManager.prototype.info;ModelManager.prototype.info=function(){return {...info.call(this),installed:{path:'test.gguf',bytes:32},phase:'ready'};};ModelManager.prototype.modelPath=()=> 'test.gguf';
  globalThis.__aiCalls=[];globalThis.__aiMode='normal';
  const inspect=LocalAI.prototype.inspect;
  LocalAI.prototype.inspect=function(...args){
   this.loadRuntime=async()=>({getLlama:async()=>({loadModel:async()=>({dispose:async()=>{},createContext:async()=>({dispose:async()=>{},getSequence:()=>({clearHistory:async()=>{}})})}),createGrammarForJsonSchema:async s=>s}),QwenChatWrapper:class{},
    LlamaChatSession:class{dispose(){}async prompt(text,options){
     if(options.grammar.properties.confirmed)return '{"confirmed":true}';
     globalThis.__aiCalls.push(text);
     if(globalThis.__aiMode==='cancel'&&globalThis.__aiCalls.length===2)await new Promise((resolve,reject)=>{if(options.signal.aborted)return reject(Error('aborted'));options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
     if(globalThis.__aiMode==='fail')throw Error('synthetic inference failure');
     return JSON.stringify({corrections:text.includes('가요요')?[{original:'학교에 가요요.',suggestion:'학교에 가요.',evidenceId:'ai-review',reason:'종결 어미 요가 중복되었습니다.'}]:[]});
    }} });return inspect.apply(this,args);
  };
 });
 await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
});
test.afterEach(async()=>{await app?.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app?.close();});
async function documentWith(lines){
 const file=path.join(profile,'synthetic.hwpx');await fs.writeFile(file,Buffer.from(zipSync({'Contents/section0.xml':strToU8('<hs:sec xmlns:hs="s" xmlns:hp="p">'+lines.map(t=>`<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`).join('')+'</hs:sec>')})));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
 await page.locator('#mode-document').click();await expect(page.locator('#text-input')).toHaveValue(lines[0]);
}
test('document AI inspects every block and preserves later block results across navigation',async()=>{
 await documentWith(['안녕하세요.','학교에 가요요.','반갑습니다.']);
 await expect(page.locator('#notice')).toContainText('AI 검사는 아직 실행하지 않았습니다');await expect(page.locator('#ai-scan')).toHaveText('문서 전체 AI 검사');
 await page.locator('#ai-scan').click();await expect(page.locator('#ai-status')).toContainText('실제 검사 3/3구간');
 expect(await app.evaluate(()=>globalThis.__aiCalls.length)).toBe(3);
 await expect(page.locator('#ai-cancel')).toBeHidden();await app.evaluate(({webContents})=>{for(const w of webContents.getAllWebContents())if(w.getURL().endsWith('/app/index.html'))w.send('ai:progress',{current:3,total:3,completed:2,failed:0,block:3,blocks:3});});await page.waitForTimeout(100);await expect(page.locator('#ai-status')).toContainText('완료 · 실제 검사 3/3구간');
 await page.locator('[data-block="1"]').click();await expect(page.locator('.issue')).toContainText('가요요');
 await page.locator('[data-block="0"]').click();await expect(page.locator('.issue')).toHaveCount(0);
 await page.locator('[data-block="1"]').click();await expect(page.locator('.issue')).toContainText('가요요');await expect(page.locator('#apply-all')).toBeDisabled();await expect(page.locator('#ai-scan')).toBeEnabled();await page.screenshot({path:'_workspace/ai-document-1.3.1.png',fullPage:true});
 await page.locator('.issue').click();await page.locator('#apply-one').click();await expect(page.locator('#text-input')).toHaveValue('학교에 가요.');await expect(page.locator('#ai-status')).toContainText('재검사');
 await page.locator('[data-block="2"]').click();await page.locator('[data-block="1"]').click();await expect(page.locator('.issue')).toHaveCount(0);
 await page.locator('#ai-scan').click();await expect(page.locator('#ai-status')).toContainText('완료 · 실제 검사 3/3구간',{timeout:15000});
 expect((await app.evaluate(()=>globalThis.__aiCalls.slice(-3)))[1]).toContain('학교에 가요.');await expect(page.locator('.issue')).toHaveCount(0);
});
test('document cancellation exposes unchecked blocks and allows a new scan',async()=>{
 await documentWith(['안녕하세요.','학교에 갑니다.','반갑습니다.']);await app.evaluate(()=>globalThis.__aiMode='cancel');
 await page.locator('#ai-scan').click();await expect(page.locator('#notice')).toContainText('AI 검사 2/3구간');await expect(page.locator('[data-block="2"]')).toBeDisabled();
 await page.locator('#ai-cancel').click();await expect(page.locator('#ai-status')).toContainText('중단 · 실제 검사 1/3구간 · 실패 0 · 미검사 2');await expect(page.locator('#ai-scan')).toBeEnabled();
 await app.evaluate(()=>globalThis.__aiMode='normal');await page.locator('#ai-scan').click();await expect(page.locator('#ai-status')).toContainText('완료 · 실제 검사 3/3구간',{timeout:15000});
});
test('failed inference is not presented as a clean completed inspection',async()=>{
 await page.locator('#text-input').fill('안녕하세요.');await app.evaluate(()=>globalThis.__aiMode='fail');await page.locator('#ai-scan').click();
 await expect(page.locator('#ai-status')).toContainText('실패 · 실제 검사 0/1구간 · 실패 1');await expect(page.locator('#notice')).toContainText('synthetic inference failure');
 await page.locator('#text-input').fill('수정한 글입니다.');await expect(page.locator('#notice')).toBeHidden();await expect(page.locator('#ai-status')).toBeHidden();
});
