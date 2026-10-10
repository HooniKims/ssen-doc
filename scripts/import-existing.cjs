'use strict';
// One-time, local source import. The integrated app never reads sibling projects at runtime.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function copy(source,dest){
 if(fs.statSync(source).isDirectory()){fs.mkdirSync(dest,{recursive:true});for(const entry of fs.readdirSync(source))copy(path.join(source,entry),path.join(dest,entry));}
 else {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,fs.readFileSync(source));}
}
for(const [name,folder] of [['review','쎈Pick'],['lite','쎈zip']]){
 const source=path.resolve(root,'..',folder),dest=path.join(root,'modules',name);
 for(const sub of ['app','src','assets','tests','build'])copy(path.join(source,sub),path.join(dest,sub));
 if(name==='lite'){
  fs.mkdirSync(path.join(dest,'native/bin'),{recursive:true});
  for(const sub of ['Cargo.toml','Cargo.lock','src'])copy(path.join(source,'native',sub),path.join(dest,'native',sub));
  copy(path.join(source,'native/bin/ssen-hwpx.exe'),path.join(dest,'native/bin/ssen-hwpx.exe'));
 }
 let main=fs.readFileSync(path.join(source,'app/main.cjs'),'utf8');
 let head=main.slice(0,main.indexOf('app.whenReady().then(()=>{'));
 head=head.replace(/const \{app,BrowserWindow,ipcMain,dialog,shell,session\}=require\('electron'\);/,'const {app,dialog,shell}=require(\'electron\');');
 head=head.replace(/const \{createUpdater,RELEASE_URL\}=require\('\.\/updater.cjs'\);\r?\n/,'');
 head=head.replace(/if\(process\.env\.(?:MOA|LITE)_TEST_DATA\).*\r?\n/,'');
 const start=main.indexOf("  ipcMain.handle('files:select'");
 const end=main.indexOf(name==='lite'?"  ipcMain.handle('update:state'":"  for(const [channel,fn]");
 let handlers=main.slice(start,end);
 fs.writeFileSync(path.join(dest,'app/register.cjs'),`'use strict';\nmodule.exports=function registerModule(host, contents){\nconst ipcMain={handle:(channel,fn)=>require('electron').ipcMain.handle('${name}:'+channel,fn)};\n${head}\nwin={webContents:contents};\n${handlers}\nreturn {busy:()=>Boolean(activeWorker${name==='review'?'||editSaving':''}),stop:()=>activeWorker?.terminate()};\n};\n`);
 let preload=fs.readFileSync(path.join(source,'app/preload.cjs'),'utf8');
 preload=preload.replace(/ipcRenderer\.invoke\('([^']+)'/g,(_,ch)=>`ipcRenderer.invoke('${/^(update:)/.test(ch)?ch:name+':'+ch}'`);
 // All transport is namespaced except common updater and window controls.
 preload=preload.replace(/listen\('(task:[^']+)'/g,`listen('${name}:$1'`);
 if(name==='lite'){
  let reg=fs.readFileSync(path.join(dest,'app/register.cjs'),'utf8').replace(/webContents\.send\('(task:[^']+)'/g,`webContents.send('${name}:$1'`);
  fs.writeFileSync(path.join(dest,'app/register.cjs'),reg);
 }
 preload+=`\ncontextBridge.exposeInMainWorld('doc',{navigate:view=>ipcRenderer.invoke('doc:navigate',view),models:()=>ipcRenderer.invoke('doc:navigate','models')});\n`;
 fs.writeFileSync(path.join(dest,'app/preload.cjs'),preload);
 let html=fs.readFileSync(path.join(source,'app/index.html'),'utf8');
 html=html.replace(/<title>[^<]*<\/title>/,'<title>쎈doc</title>').replaceAll('쎈Pick','쎈doc').replaceAll('쎈Lite','쎈doc');
 html=html.replace('<nav>',`<nav><button class="nav-item doc-route" data-route="spell">맞춤법 검사</button><button class="nav-item doc-route ${name==='review'?'active':''}" data-route="review">문서 대조</button><button class="nav-item doc-route ${name==='lite'?'active':''}" data-route="lite">용량 줄이기</button><button class="nav-item" id="doc-models">AI 모델 관리</button>`);
 html=html.replace('id="nav-review"','hidden id="nav-review"');
 html=html.replace('</body>','<script src="doc-navigation.js"></script></body>');
 fs.writeFileSync(path.join(dest,'app/index.html'),html);
 fs.writeFileSync(path.join(dest,'app/doc-navigation.js'),`document.querySelectorAll('.doc-route').forEach(b=>b.onclick=()=>window.doc.navigate(b.dataset.route));document.getElementById('doc-models').onclick=()=>window.doc.models();\n`);
 fs.appendFileSync(path.join(dest,'app/styles.css'),'\n[hidden]{display:none!important} .sidebar nav{gap:6px} .doc-route.active{background:#d8ece2;color:#173d33} .brand small{font-size:12px}\n');
}
copy(path.join(root,'modules/review/assets'),path.join(root,'assets'));
copy(path.join(root,'modules/review/build'),path.join(root,'build'));
let installer=fs.readFileSync(path.join(root,'build/installer.nsh'),'utf8').replaceAll('쎈Pick','쎈doc').replace('쎈doc · 문서 대조','쎈doc · 학교 문서 도구').replace('학교의 여러 문서에서$\\r$\\n날짜·인원·장소·금액의$\\r$\\n차이를 찾아드립니다.','맞춤법 검사 · 문서 대조$\\r$\\n용량 줄이기를 한곳에서$\\r$\\n사용하세요.');
fs.writeFileSync(path.join(root,'build/installer.nsh'),installer);
const p=JSON.parse(fs.readFileSync(path.join(root,'../쎈zip/package.json'),'utf8'));
p.name='ssen-doc';p.version='1.0.0';p.description='학교 문서 맞춤법 검사·문서 대조·용량 줄이기';p.engines={node:'>=24'};
p.dependencies={...p.dependencies,diff:'^9.0.0',fflate:'^0.8.3','node-llama-cpp':'3.22.1'};
p.devDependencies['dictionary-ko']='2.0.0';
p.scripts={start:'electron .',test:'node --test tests/*.test.cjs modules/review/tests/*.test.cjs modules/lite/tests/*.test.cjs','test:ui':'playwright test','test:ai':'node scripts/test-local-ai.cjs','build:native':'node scripts/build-native.cjs',dist:'npm run build:native && electron-builder --win nsis zip --x64 --publish never'};
p.build={...p.build,appId:'kr.hoonikim.ssendoc',productName:'쎈doc',files:['app/**/*','src/**/*','assets/**/*','modules/*/app/**/*','modules/*/src/**/*','modules/*/assets/**/*','package.json'],extraResources:[{from:'modules/lite/native/bin',to:'native',filter:['*.exe']}],asarUnpack:['node_modules/sharp/**/*','node_modules/@img/**/*','node_modules/node-llama-cpp/bins/**/*','node_modules/@node-llama-cpp/**/*'],publish:{provider:'github',owner:'HooniKims',repo:'ssen-doc',releaseType:'release'},win:{icon:'assets/icon.ico',executableName:'SsenDoc',artifactName:'SsenDoc-${version}-${arch}.${ext}'},nsis:{...p.build.nsis,artifactName:'SsenDoc-Setup-${version}.exe',shortcutName:'쎈doc'}};
fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(p,null,2)+'\n');
