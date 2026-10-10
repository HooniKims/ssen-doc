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
