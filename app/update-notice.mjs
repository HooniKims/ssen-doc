// Shared by all three workspaces; update decisions and dismissal live in the main process.
export function mountUpdateNotice(versionButton) {
 const api=[window.doc,window.moa,window.lite].find(value=>value?.updateState);
 if(!api)return;
 const $=id=>document.getElementById(id),dialog=$('update-dialog');
 const dot=document.createElement('span');dot.id='sen-update-dot';dot.hidden=true;dot.setAttribute('aria-hidden','true');versionButton.append(dot);
 const notice=document.createElement('section');notice.id='sen-update-notice';notice.hidden=true;notice.setAttribute('aria-labelledby','sen-update-title');
 notice.innerHTML='<button type="button" id="sen-update-close" aria-label="업데이트 알림 닫기">×</button><strong id="sen-update-title" role="status" aria-live="polite"></strong><ul id="sen-update-notes"></ul><p id="sen-update-hint"></p><div class="sen-update-actions"><button type="button" class="primary" id="sen-update-now">업데이트</button><button type="button" id="sen-update-later">나중에</button><button type="button" id="sen-update-skip" class="sen-update-skip">이 버전 건너뛰기</button></div>';
 document.body.append(notice);
 dialog.classList.add('sen-update-dialog');dialog.querySelector('h2').textContent='쎈Doc 업데이트';
 const summary=document.createElement('section');summary.className='sen-update-summary';
 summary.innerHTML='<dl><div><dt>지금 버전</dt><dd id="sen-update-current"></dd></div><div><dt>상태</dt><dd id="sen-update-state"></dd></div><div><dt>마지막 확인</dt><dd id="sen-update-checked"></dd></div></dl><ul id="sen-update-detail-notes"></ul><p id="sen-update-size"></p>';
 dialog.querySelector('h2').after(summary);$('sen-update-state').append($('update-message'));
 if($('update-version'))$('update-version').hidden=true;
 const details=document.createElement('section');details.className='sen-update-details';
 details.innerHTML='<label class="sen-update-auto"><input id="sen-update-auto" type="checkbox"> 자동으로 확인하기 <small>(시작 15초 뒤, 4시간마다)</small></label><button type="button" id="sen-update-detail-skip" class="sen-update-skip" hidden>이 버전 건너뛰기</button><p id="sen-update-error" role="alert" hidden></p>';
 dialog.append(details);
 const primaryActions=document.createElement('div');primaryActions.className='sen-update-primary-actions';
 for(const id of ['update-download','update-install','update-action'])if($(id))primaryActions.append($(id));
 primaryActions.append($('sen-update-detail-skip'));
 const checkRow=document.createElement('div');checkRow.className='sen-update-check-row';
 const checkButton=$('update-check')||document.createElement('button');
 if(!checkButton.id){checkButton.id='sen-update-check';checkButton.type='button';checkButton.onclick=()=>void act(()=>api.checkUpdate());}
 checkButton.textContent='지금 확인';checkButton.classList.remove('primary');checkRow.append(checkButton);
 summary.after($('update-progress'),primaryActions,checkRow,details);
 const privacy=document.createElement('p');privacy.className='sen-update-privacy';privacy.textContent='업데이트 확인 때는 버전 정보만 주고받아요. 문서 내용은 보내지 않아요.';details.append(privacy);
 dialog.querySelector('#settings-update-heading')?.setAttribute('hidden','');
 dialog.querySelector('.update-note')?.setAttribute('hidden','');
 dialog.querySelector('p.small.muted')?.setAttribute('hidden','');
 let state,busy=false;
 function notes(element,lines){element.replaceChildren(...lines.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));element.hidden=!lines.length;}
 function render(value){
  if(!value||value.error)return;state=value;
  const available=Boolean(value.available)&&value.available!==value.skippedVersion&&value.phase!=='latest'&&value.phase!=='disabled';
  dot.hidden=!available;
  versionButton.title=available?`새 버전 ${value.available} · 업데이트 보기`:'버전 · 업데이트 확인';
  versionButton.setAttribute('aria-label',`현재 버전 ${value.current}${available?`, 새 버전 ${value.available} 있음`:''} · 업데이트 보기`);
  notice.hidden=!value.notificationVisible;
  $('sen-update-title').textContent=`쎈Doc ${value.available} 업데이트가 있어요`;
  const lines=Array.isArray(value.releaseNotes)?value.releaseNotes:[];
  notes($('sen-update-notes'),lines);notes($('sen-update-detail-notes'),lines);
  const size=Number.isFinite(value.downloadBytes)&&value.downloadBytes>0?`${value.mode==='zip'?'ZIP':'설치'} 파일 약 ${Math.ceil(value.downloadBytes/1024/1024)}MB`:'';
  $('sen-update-size').textContent=size;$('sen-update-size').hidden=!size||!value.available;
  $('sen-update-hint').textContent=value.phase==='ready'?'다시 시작하면 적용돼요. 작업을 저장해 주세요. 쎈Doc이 잠깐 닫혔다가 새 버전으로 다시 열립니다.':size||(value.mode==='zip'?'배포 페이지에서 새 ZIP 파일을 받아 교체하세요.':'업데이트를 받는 동안 문서 작업을 계속할 수 있어요.');
  $('sen-update-now').textContent=value.phase==='ready'?'다시 시작해서 적용':value.mode==='zip'?'새 ZIP 받기':'업데이트';
  $('sen-update-skip').hidden=value.phase==='ready';
  $('sen-update-current').textContent=value.current;
  $('sen-update-checked').textContent=value.checkedAt?new Date(value.checkedAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'아직 확인하지 않았습니다.';
  $('sen-update-auto').checked=value.autoCheck!==false;
  $('update-progress').hidden=value.phase!=='downloading';
  if($('update-action'))$('update-action').hidden=!['available','ready','downloading','installing'].includes(value.phase);
  if($('update-download')){$('update-download').textContent='업데이트';$('update-download').classList.add('primary');$('update-download').classList.remove('secondary');}
  $('update-release').hidden=value.mode!=='zip';
  $('sen-update-detail-skip').hidden=!value.available||value.available===value.skippedVersion||['ready','installing'].includes(value.phase);
  for(const id of ['sen-update-now','sen-update-skip','sen-update-detail-skip','sen-update-auto'])$(id).disabled=busy;
  checkButton.disabled=busy||['disabled','checking','downloading','ready','installing'].includes(value.phase);
 }
 async function act(fn){if(busy)return;busy=true;if(state)render(state);$('sen-update-error').hidden=true;try{const result=await fn();if(result?.error)throw Error(result.error);render(await api.updateState());}catch(error){$('sen-update-error').textContent=error.message||'업데이트 요청을 처리하지 못했습니다.';$('sen-update-error').hidden=false;}finally{busy=false;if(state)render(state);}}
 function open(){( $('open-settings')||$('open-update')).click();void act(()=>api.dismissUpdate());}
 versionButton.onclick=open;
 $('sen-update-close').onclick=$('sen-update-later').onclick=()=>void act(()=>api.dismissUpdate());
 $('sen-update-skip').onclick=$('sen-update-detail-skip').onclick=()=>void act(()=>api.skipUpdate());
 $('sen-update-auto').onchange=e=>{const checked=e.target.checked;void act(()=>api.setAutoUpdate(checked));};
 $('sen-update-now').onclick=()=>{
  const current=state;if(!current)return;
  ($('open-settings')||$('open-update')).click();
  void act(async()=>{await api.dismissUpdate();return current.phase==='ready'?api.installUpdate():current.mode==='zip'?api.openRelease():api.downloadUpdate();});
 };
 api.onUpdate(render);void api.updateState().then(render).catch(()=>{});
}
