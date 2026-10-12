import {icon} from './sen-icons.mjs';

// Shared presentation only. Commands remain on the original buttons and IPC paths.
const root=new URL('../',import.meta.url),$=s=>document.querySelector(s);
const header=$('.titlebar'),actions=document.createElement('div');actions.className='sen-header-actions';
const logo=document.createElement('img');logo.src=new URL('assets/logo.svg',root);logo.alt='쎈Doc';logo.className='sen-logo';
const brand=$('.sidebar .brand')||document.createElement('div');brand.className='brand sen-brand';brand.replaceChildren(logo);
const version=$('#app-version')||document.createElement('span');version.classList.add('sen-version');
const settings=document.createElement('button');settings.id='sen-settings';settings.type='button';settings.textContent='설정';settings.onclick=()=>($('#open-settings')||$('#open-update')).click();
const controls=document.createElement('div');controls.className='window-actions';
for(const id of ['minimize','maximize','close']){const b=$('#'+id);b.textContent={minimize:'최소화',maximize:'최대화',close:'닫기'}[id];controls.append(b);}
actions.append(settings,controls);header.replaceChildren(brand,version,actions);header.classList.add('app-header');
const oldHeader=$('.page-header'),tools=document.createElement('div');tools.className='sen-page-tools';
const workflow=oldHeader?.querySelector('.workflow'),newTask=$('#new-task');if(workflow)tools.append(workflow);if(newTask)tools.append(newTask);
if(tools.children.length)($('.heading-row')||$('.heading')).append(tools);
oldHeader?.setAttribute('hidden','');
const scanBar=$('#scan')?.closest('.actions'),editor=$('.editor-panel');if(scanBar&&editor){scanBar.classList.add('sen-scan-bar');editor.querySelector('.panel-head').after(scanBar);}
document.documentElement.dataset.senDesign='1.0';
const buttonIcons={minimize:'down',maximize:'open',close:'x','sen-settings':'gear',scan:'search',start:'play',cancel:'stop',sample:'file',demo:'file',clipboard:'paste',copy:'copy',undo:'undo','ai-scan':'search','ai-cancel':'stop','apply-all':'check','apply-one':'check','ignore-one':'x','open-document':'folder','save-document':'download','save-text':'download','save-html':'download','mode-text':'paste','mode-document':'file','open-models':'download','doc-models':'download','open-guide':'bulb','nav-guide':'bulb','open-settings':'gear','open-update':'refresh','new-task':'plus','pick-empty':'folder','pick-more':'plus',export:'download','update-release':'open','update-check':'refresh','update-action':'refresh','update-download':'download','update-install':'refresh','model-download':'download','model-import':'folder','model-delete':'trash','model-pause':'stop','confirm-delete':'trash','ai-recommendation-open':'download','ai-recommendation-skip':'x','model-skip':'x','authButton':'shield','authClose':'x','authRefresh':'refresh','authSend':'shield','authVerify':'check','authLogout':'x','authRegister':'plus','authDevicesButton':'eye','authViewOnly':'eye','choose-folder':'folder','reset-folder':'undo','mark-reviewed':'check','edit-save':'download','edit-cancel':'x','edit-source':'open'};
const routes={spell:'edit',review:'file',lite:'image'},symbols=/^[＋+×✕✓↗↓⚙?▤─□]\s*|\s*[↗]$/g;
let changing=false,queued=false,lastNotice='',toastTimer;
const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;decorate();});}});
function decorate(){
 if(changing)return;changing=true;observer.disconnect();
 for(const b of document.querySelectorAll('button')){
  b.classList.add('btn');
  const content=b.matches('.issue,.issue-card,.doc-block,.file-name,.export-option');if(content)b.classList.add('sen-content-button');
  if(b.querySelector('svg')){for(const svg of b.querySelectorAll('svg')){svg.setAttribute('stroke-width','2');svg.classList.add('sen-icon');}continue;}
  let name=buttonIcons[b.id]||routes[b.dataset.route]||({remove:'trash',details:'eye',open:'open',show:'folder'}[b.dataset.action])||(b.hasAttribute('data-remove')?'trash':b.hasAttribute('data-close')?'x':b.hasAttribute('data-edit')?'edit':b.hasAttribute('data-open')?'open':b.matches('.dialog-close')?'x':content?'file':'check');
  b.querySelectorAll('[data-icon],.nav-glyph').forEach(n=>n.remove());
  for(const node of [...b.childNodes])if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace(symbols,'');
  if(!b.textContent.trim())b.append(document.createTextNode(b.matches('.file-remove,.remove-file')?'제거':b.id==='pick-more'?'파일 추가':b.matches('.dialog-close')?'닫기':'닫기'));
  b.insertAdjacentHTML('afterbegin',icon(name));
 }
 for(const n of document.querySelectorAll('.upload-symbol'))if(!n.querySelector('svg'))n.innerHTML=icon('folder');
 for(const tag of document.querySelectorAll('.badge,.tag,.issue-status,.target-result')){
  if(tag.querySelector('svg'))continue;
  const text=tag.textContent,good=/완료|달성|안전/.test(text),warn=/확인|권장|오류|초과/.test(text);
  tag.dataset.tone=good?'ok':warn?'warn':'info';tag.insertAdjacentHTML('afterbegin',icon(good?'checkCircle':warn?'warn':'info'));
 }
 for(const s of document.querySelectorAll('.summary-status')){
  const anchor=s.querySelector('#scan-status');
  if(!s.querySelector('.sen-status-icon')){const span=document.createElement('span');span.className='sen-status-icon';span.innerHTML=icon('info');s.prepend(span);}
 }
 const notice=$('#notice');if(notice?.textContent&&notice.textContent!==lastNotice){lastNotice=notice.textContent;if(/복사했습니다|저장했습니다|불러왔|삭제해/.test(lastNotice))showToast(lastNotice);}
 observer.observe(document.body,{childList:true,subtree:true});changing=false;
}
function showToast(message){let toast=$('#toast');if(!toast){toast=document.createElement('div');toast.id='toast';toast.className='toast';toast.setAttribute('role','status');document.body.append(toast);}toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,2500);}
document.addEventListener('click',e=>{const dialog=e.target;if(!(dialog instanceof HTMLDialogElement)||!dialog.open)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
decorate();
