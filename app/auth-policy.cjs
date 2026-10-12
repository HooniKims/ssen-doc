'use strict';
const ACTIONS = new Set(['init','sync','send','login','trial','refresh','register','redeem','eduSend','eduVerify','devices','deactivate','logout']);
// Every IPC must be classified. New channels fail closed until reviewed here.
const GATED = new Set([
  'edit:authorize','dictionary:add','clipboard:write','spell:save-document','spell:save-text',
  'model:download','model:import','model:delete',
  'review:document:prepare-edit','review:document:save-edit','review:report:export','review:samples:export',
  'lite:folder:choose','lite:folder:reset','lite:task:start'
]);
const OPEN = new Set([
  'auth-command','auth:info','copy-text','open-external','doc:navigate','settings:read','settings:write',
  'spell:scan','clipboard:read','spell:open-document','spell:prepare','model:info','model:pause',
  'spell:ai','spell:cancel-ai','update:state','update:check','update:download','update:release','update:install','license:text',
  'review:files:select','review:files:add','review:files:demo','review:scan','review:source:open',
  'lite:files:select','lite:files:add','lite:files:remove','lite:files:clear','lite:files:demo',
  'lite:task:cancel','lite:result:show','lite:result:open'
]);
function createRegistrar({ipcMain,auth,allowed,onDenied}) {
  return (channel,handler) => {
    if (!GATED.has(channel) && !OPEN.has(channel)) throw Error(`Unclassified IPC: ${channel}`);
    ipcMain.handle(channel,async(event,...args)=>{
      if(!allowed(event)) throw Error('허용되지 않은 요청입니다.');
      if(GATED.has(channel)) {
        try { await auth.authorize(); }
        catch { onDenied(event); return {error:'이용권을 확인한 뒤 다시 시도해 주세요.',code:'AUTH_REQUIRED'}; }
      }
      return handler(event,...args);
    });
  };
}
function validCommand(action,args) {
  if(!ACTIONS.has(action)) throw Error('허용되지 않은 인증 요청입니다.');
  if(args===null||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>4096) throw Error('인증 입력을 확인해 주세요.');
}
function diagnosticReport(auth,version) {
  // Never copy arbitrary renderer text through this ungated diagnostics channel.
  const s=auth.summary();
  return JSON.stringify({app:'SsenDoc',version,copyright:'© 2026 상명초 김승현, 등촌중 김형훈',lastFailure:s.lastFailure||null,events:s.diagnostics||[]},null,2);
}
module.exports={ACTIONS,GATED,OPEN,createRegistrar,validCommand,diagnosticReport};
