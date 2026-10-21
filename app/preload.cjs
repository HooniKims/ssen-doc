'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke(name,...args);
const on=(channel,callback)=>{const listener=(_e,value)=>callback(value);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('doc',{
 official:(input,overrides)=>invoke('spell:official',input,overrides),
 officialAI:(input,overrides)=>invoke('spell:official-ai',input,overrides),onOfficialProgress:callback=>on('official:progress',callback),
 navigate:view=>invoke('doc:navigate',view),scan:text=>invoke('spell:scan',text),clipboard:()=>invoke('clipboard:read'),copy:text=>invoke('clipboard:write',text),
 openDocument:()=>invoke('spell:open-document'),prepareBlock:index=>invoke('spell:prepare',index),saveDocument:edits=>invoke('spell:save-document',edits),saveText:(text,type)=>invoke('spell:save-text',text,type),
 modelInfo:()=>invoke('model:info'),downloadModel:id=>invoke('model:download',id),pauseModel:()=>invoke('model:pause'),importModel:()=>invoke('model:import'),deleteModel:()=>invoke('model:delete'),
 ai:text=>invoke('spell:ai',text),cancelAI:()=>invoke('spell:cancel-ai'),onModel:callback=>on('model:state',callback),onAI:callback=>on('ai:progress',callback),onNavigate:callback=>on('doc:settings',callback),
 settings:()=>invoke('settings:read'),saveSettings:settings=>invoke('settings:write',settings),addWord:word=>invoke('dictionary:add',word),
 dismissUpdate:()=>ipcRenderer.invoke('update:dismiss'),skipUpdate:()=>ipcRenderer.invoke('update:skip'),setAutoUpdate:value=>ipcRenderer.invoke('update:auto-check',value),
  updateState:()=>invoke('update:state'),checkUpdate:()=>invoke('update:check'),downloadUpdate:()=>invoke('update:download'),installUpdate:()=>invoke('update:install'),openRelease:()=>invoke('update:release'),licenseText:()=>invoke('license:text'),onUpdate:callback=>on('update:state',callback),
 minimize:()=>ipcRenderer.send('window:minimize'),maximize:()=>ipcRenderer.send('window:maximize'),close:()=>ipcRenderer.send('window:close')
});

contextBridge.exposeInMainWorld('desktop',{
 authInfo:()=>ipcRenderer.invoke('auth:info'),
 authCommand:(action,args={})=>ipcRenderer.invoke('auth-command',action,args),
 authorizeEdit:()=>ipcRenderer.invoke('edit:authorize'),
 onAuthState:callback=>{const fn=(_e,s)=>callback(s);ipcRenderer.on('auth-state',fn);return()=>ipcRenderer.removeListener('auth-state',fn);},
 onAuthRequired:callback=>{const fn=()=>callback();ipcRenderer.on('auth-required',fn);return()=>ipcRenderer.removeListener('auth-required',fn);},
 copyText:text=>ipcRenderer.invoke('copy-text',text),
 openExternal:url=>ipcRenderer.invoke('open-external',url)
});
