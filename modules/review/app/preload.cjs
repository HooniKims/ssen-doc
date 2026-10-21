const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('moa',{
  selectFiles:()=>ipcRenderer.invoke('review:files:select'),
  addDropped:files=>ipcRenderer.invoke('review:files:add',Array.from(files).map(f=>webUtils.getPathForFile(f))),
  demo:()=>ipcRenderer.invoke('review:files:demo'),
  scan:(ids,year)=>ipcRenderer.invoke('review:scan',ids,year),
  openSource:id=>ipcRenderer.invoke('review:source:open',id),
  prepareEdit:(id,location)=>ipcRenderer.invoke('review:document:prepare-edit',id,location),
  saveEdit:(token,text)=>ipcRenderer.invoke('review:document:save-edit',token,text),
  exportReport:(type,statuses)=>ipcRenderer.invoke('review:report:export',type,statuses),
  exportSamples:()=>ipcRenderer.invoke('review:samples:export'),
  dismissUpdate:()=>ipcRenderer.invoke('update:dismiss'),skipUpdate:()=>ipcRenderer.invoke('update:skip'),setAutoUpdate:value=>ipcRenderer.invoke('update:auto-check',value),
  updateState:()=>ipcRenderer.invoke('update:state'),
  checkUpdate:()=>ipcRenderer.invoke('update:check'),
  downloadUpdate:()=>ipcRenderer.invoke('update:download'),
  installUpdate:()=>ipcRenderer.invoke('update:install'),
  openRelease:()=>ipcRenderer.invoke('update:release'),
  onUpdate:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('update:state',listener);return ()=>ipcRenderer.removeListener('update:state',listener);},
  minimize:()=>ipcRenderer.send('window:minimize'),
  maximize:()=>ipcRenderer.send('window:maximize'),
  close:()=>ipcRenderer.send('window:close'),
});

contextBridge.exposeInMainWorld('doc',{navigate:view=>ipcRenderer.invoke('doc:navigate',view),models:()=>ipcRenderer.invoke('doc:navigate','models')});

contextBridge.exposeInMainWorld('desktop',{
 authInfo:()=>ipcRenderer.invoke('auth:info'),
 authCommand:(action,args={})=>ipcRenderer.invoke('auth-command',action,args),
 authorizeEdit:()=>ipcRenderer.invoke('edit:authorize'),
 onAuthState:callback=>{const fn=(_e,s)=>callback(s);ipcRenderer.on('auth-state',fn);return()=>ipcRenderer.removeListener('auth-state',fn);},
 onAuthRequired:callback=>{const fn=()=>callback();ipcRenderer.on('auth-required',fn);return()=>ipcRenderer.removeListener('auth-required',fn);},
 copyText:text=>ipcRenderer.invoke('copy-text',text),
 openExternal:url=>ipcRenderer.invoke('open-external',url)
});
