'use strict';
// External test launcher, excluded from app.asar. Never reads/writes a real shared account.
const path=require('node:path'),fs=require('node:fs');
const {app}=require('electron');
const root=process.env.SSENDOC_AUTH_APP_ROOT||path.resolve(__dirname,'../..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
app.getAppPath=()=>root;app.getVersion=()=>version;
if(process.env.SSENDOC_AUTH_APP_ROOT){Object.defineProperty(app,'isPackaged',{get:()=>true});Object.defineProperty(process,'resourcesPath',{value:path.dirname(root)});process.env.SSENDOC_TEST_AUTOMATION='1';}
let canEdit=process.env.SSENDOC_AUTH_LOCKED!=='1';
const summary=()=>({ready:true,canEdit,verdict:canEdit?'OK':'LOGIN',hasLicense:canEdit,accountPresent:canEdit,loggedIn:canEdit,registered:canEdit,plan:canEdit?'edu_free':null,unlimited:true,email:'',diagnostics:[],devices:[],edu:canEdit?{status:'active',expiresAt:Math.floor(Date.now()/1000)+365*86400}:null,lastFailure:null});
globalThis.__authFixture={authorizeCalls:0,appId:null};
const {ModelManager}=require(path.join(root,'src/ai/model-manager.cjs'));
const originalDownload=ModelManager.prototype.download;globalThis.__authFixture.modelDownloadCalls=0;
ModelManager.prototype.download=function(...args){globalThis.__authFixture.modelDownloadCalls++;return originalDownload.apply(this,args);};
const file=require.resolve(path.join(root,'app/auth/auth-native.cjs'));
require.cache[file]={id:file,filename:file,loaded:true,exports:{createNativeAuth:({app:id})=>{
  globalThis.__authFixture.appId=id;
  return {summary,act:async action=>{if(action==='logout')canEdit=false;return {ok:true,state:summary()};},authorize:async()=>{globalThis.__authFixture.authorizeCalls++;if(!canEdit)throw Error('LOGIN');return true;}};
}}};
require(path.join(root,'app/main.cjs'));
