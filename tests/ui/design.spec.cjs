'use strict';
const {test,expect,_electron}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
test('series design: local fonts, consistent controls, minimum window and dialogs',async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ssendoc-design-')),env={...process.env,SSENDOC_TEST_DATA:profile,SSENDOC_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({args:[path.resolve(__dirname,'../fixtures/auth-launch.cjs')],env}),errors=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{
  await expect.poll(()=>app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'))?.url()).toBeTruthy();
  const spell=app.windows().find(p=>p.url().endsWith('/app/index.html')&&!p.url().includes('/modules/'));await spell.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  for(const size of [[1280,800],[1024,700]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),size);
   for(const route of ['spell','review','lite']){
    await spell.evaluate(route=>window.doc.navigate(route),route);await expect.poll(()=>app.windows().find(p=>route==='spell'?p===spell:p.url().includes('/modules/'+route+'/'))?.url()).toBeTruthy();
    const page=route==='spell'?spell:app.windows().find(p=>p.url().includes('/modules/'+route+'/'));
    await page.waitForSelector('.sen-logo');await page.evaluate(async()=>{await document.fonts.ready;document.querySelector('main').scrollTop=0;});
    const style=await page.evaluate(()=>{
     const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden',body=getComputedStyle(document.body),main=document.querySelector('main');
     return {canvas:body.backgroundColor,family:body.fontFamily,header:document.querySelector('.titlebar').getBoundingClientRect().height,mainWidth:main.clientWidth,scrollWidth:main.scrollWidth,windowWidth:innerWidth,
      fontLoaded:['300 16px "Cafe24 PRO Slim"','700 19px "Cafe24 PRO Slim"','400 15px "Hakgyoansim Jayeon"'].every(f=>document.fonts.check(f,'맞춤법 검사')),
      unlabelled:[...document.querySelectorAll('button')].filter(visible).filter(b=>!b.textContent.trim()).map(b=>b.id),
      missingIcons:[...document.querySelectorAll('button')].filter(visible).filter(b=>!b.querySelector('svg')).map(b=>b.id),
      invalidButtons:[...document.querySelectorAll('button.btn:not(.sen-content-button)')].filter(visible).filter(b=>getComputedStyle(b).borderRadius!=='8px').map(b=>b.id),
      overflow:[...document.querySelectorAll('.heading,.heading-row,.panel,.summary-strip,.ai-recommendation')].filter(visible).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.id||e.className)};
    });
    expect(style.canvas).toBe('rgb(242, 240, 235)');expect(style.family).toContain('Cafe24 PRO Slim');expect(style.header).toBe(72);expect(style.fontLoaded).toBe(true);
    expect(style.scrollWidth).toBeLessThanOrEqual(style.mainWidth+1);expect(style.unlabelled).toEqual([]);expect(style.missingIcons).toEqual([]);expect(style.invalidButtons).toEqual([]);expect(style.overflow).toEqual([]);
    await page.screenshot({path:`docs/design-${route}-${size[0]}.png`});
    await page.locator('#sen-settings').click();await expect(page.locator('#update-dialog')).toBeVisible();
    const box=await page.locator('#update-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size[0]);expect(box.y+box.height).toBeLessThanOrEqual(size[1]);
    await page.screenshot({path:`docs/design-${route}-settings-${size[0]}.png`});await page.keyboard.press('Escape');await expect(page.locator('#update-dialog')).toBeHidden();
   }
  }
  await spell.evaluate(()=>window.doc.navigate('spell'));
  await spell.locator('#ai-recommendation-skip').click();
  await spell.locator('#text-input').fill('내일 체험학습에 참여할수있습니다. 회의가 됬어요.');await spell.locator('#scan').click();
  await expect(spell.locator('#issue-count')).not.toHaveText('0');
  for(const route of ['spell','review','lite']){
   await spell.evaluate(route=>window.doc.navigate(route),route);
   const page=route==='spell'?spell:app.windows().find(p=>p.url().includes('/modules/'+route+'/'));
   if(route!=='spell'){
    await page.locator('#demo').click();await page.locator(route==='review'?'#scan':'#start').click();
    if(route==='review')await expect(page.locator('#scan-status')).toHaveText('검사가 끝났어요');
    else await expect(page.locator('.result-actions')).toBeVisible({timeout:90000});
   }
   const overflow=await page.evaluate(()=>{const m=document.querySelector('main');return m.scrollWidth-m.clientWidth;});expect(overflow).toBeLessThanOrEqual(1);
   await page.evaluate(()=>document.querySelector('main').scrollTop=0);
   await page.screenshot({path:`docs/design-${route}-result-1024.png`});
  }
  await spell.evaluate(()=>window.doc.navigate('spell'));await spell.evaluate(()=>window.desktop.authCommand('logout'));
  await spell.locator('#authButton').click();await expect(spell.locator('#authDialog')).toBeVisible();
  const authStyle=await spell.evaluate(()=>{const d=document.querySelector('#authDialog'),b=d.getBoundingClientRect();return {right:b.right,bottom:b.bottom,buttons:[...d.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({radius:getComputedStyle(e).borderRadius,font:getComputedStyle(e).fontFamily}))};});
  expect(authStyle.right).toBeLessThanOrEqual(1024);expect(authStyle.bottom).toBeLessThanOrEqual(700);
  expect(authStyle.buttons.every(b=>b.radius==='8px'&&b.font.includes('Hakgyoansim Jayeon'))).toBe(true);
  await spell.screenshot({path:'docs/design-auth-1024.png'});await spell.mouse.click(10,10);await expect(spell.locator('#authDialog')).toBeHidden();
  const bar=await spell.locator('#authBar').boundingBox();expect(bar.x).toBe(0);expect(bar.width).toBe(1024);
  expect(errors).toEqual([]);
 }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.removeAllListeners('close');w.destroy();}}).catch(()=>{});await app.close();}
});
