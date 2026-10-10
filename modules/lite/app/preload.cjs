const {contextBridge,ipcRenderer,webUtils}=require('electron');
const listen=(channel,callback)=>{const fn=(_event,value)=>callback(value);ipcRenderer.on(channel,fn);return ()=>ipcRenderer.removeListener(channel,fn);};
contextBridge.exposeInMainWorld('lite',{
  selectFiles:()=>ipcRenderer.invoke('lite:files:select'),
  addDropped:files=>ipcRenderer.invoke('lite:files:add',Array.from(files).map(file=>webUtils.getPathForFile(file))),
  removeFile:id=>ipcRenderer.invoke('lite:files:remove',id),clear:()=>ipcRenderer.invoke('lite:files:clear'),demo:()=>ipcRenderer.invoke('lite:files:demo'),
  chooseFolder:()=>ipcRenderer.invoke('lite:folder:choose'),resetFolder:()=>ipcRenderer.invoke('lite:folder:reset'),
  start:(ids,preset)=>ipcRenderer.invoke('lite:task:start',ids,preset),cancel:()=>ipcRenderer.invoke('lite:task:cancel'),
  showResult:id=>ipcRenderer.invoke('lite:result:show',id),openResult:id=>ipcRenderer.invoke('lite:result:open',id),
  onProgress:callback=>listen('lite:task:progress',callback),onResult:callback=>listen('lite:task:result',callback),
  updateState:()=>ipcRenderer.invoke('update:state'),checkUpdate:()=>ipcRenderer.invoke('update:check'),downloadUpdate:()=>ipcRenderer.invoke('update:download'),installUpdate:()=>ipcRenderer.invoke('update:install'),openRelease:()=>ipcRenderer.invoke('update:release'),onUpdate:callback=>listen('update:state',callback),
  minimize:()=>ipcRenderer.send('window:minimize'),maximize:()=>ipcRenderer.send('window:maximize'),close:()=>ipcRenderer.send('window:close')
});

contextBridge.exposeInMainWorld('doc',{navigate:view=>ipcRenderer.invoke('doc:navigate',view),models:()=>ipcRenderer.invoke('doc:navigate','models')});
