import {canEdit,requireEdit} from './auth/auth-ui.mjs';
import {startAuth} from './auth-setup.mjs';
import {issueKey,visibleIssues,groupIssues,displayChange} from './issue-view.mjs';
'use strict';
(()=>{
const $=id=>document.getElementById(id),api=window.doc,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let issues=[],selected=null,busy=false,model=null,settings={aiNoticeSeen:true},before='',undo=[],doc=null,block=null,lastBlock=0,edits=new Map(),mode='text',pasteText='',savedEdits=new Map();
let ignored=new Set();
const checked=r=>{if(r?.error)throw Error(r.error);return r;};
function notice(message){$('notice').textContent=message||'';$('notice').hidden=!message;}
const action=fn=>async(...args)=>{try{await fn(...args);}catch(e){notice(e.message);}};
function changed(){const text=$('text-input').value;$('char-count').textContent=`${text.length.toLocaleString()}자`;$('after').textContent=text;$('before').textContent=before;$('undo').disabled=!undo.length;if(mode==='document'&&block!==null&&doc){const original=doc.blocks[block].editOriginal??doc.blocks[block].text;if(text===original)edits.delete(block);else edits.set(block,text);$('save-document').disabled=!edits.size||busy;renderBlocks();}else pasteText=text;}
function invalidate(){issues=[];selected=null;renderIssues();$('highlights').hidden=true;}
document.addEventListener('sen-auth-change',()=>setBusy(busy));
$('text-input').addEventListener('pointerdown',()=>{if(mode==='document'&&!canEdit())requireEdit();});
$('text-input').addEventListener('input',()=>{changed();invalidate();});
function setBusy(value){busy=value;for(const id of ['scan','mode-text','mode-document','open-document','sample','clipboard','save-document','save-text','save-html','undo','apply-all'])$(id).disabled=value;$('text-input').readOnly=value||(mode==='document'&&(doc?.blocks[block]?.editable===false||!canEdit()));$('ai-scan').disabled=value;$('undo').disabled=value||!undo.length;$('save-document').disabled=value||!edits.size;$('apply-all').disabled=value||!issues.some(i=>i.auto&&i.source==='rule')||(mode==='document'&&doc?.blocks[block]?.editable===false);}
async function applyIssues(changes){if(!requireEdit())return;checked(await window.desktop.authorizeEdit());if(busy||(mode==='document'&&doc?.blocks[block]?.editable===false))return;let text=$('text-input').value;const old=text;let end=text.length;for(const i of [...changes].sort((a,b)=>b.start-a.start)){if(i.end>end||text.slice(i.start,i.end)!==i.original||typeof i.suggestion!=='string')throw Error('본문이 바뀌었습니다. 다시 검사해 주세요.');text=text.slice(0,i.start)+i.suggestion+text.slice(i.end);end=i.start;}if(text===old)return;
 // Keep the other AI suggestions: the rule rescan does not run the model again.
 const kept=issues.filter(i=>i.source==='ai'&&!changes.some(c=>c.id===i.id||c.start<i.end&&i.start<c.end)).map(i=>{const delta=changes.filter(c=>c.end<=i.start).reduce((n,c)=>n+c.suggestion.length-(c.end-c.start),0);return {...i,start:i.start+delta,end:i.end+delta};}).filter(i=>text.slice(i.start,i.end)===i.original);
 undo.push(old);$('text-input').value=text;changed();void inspect(kept);}
function renderIssues(){
 const shown=visibleIssues(issues,$('issue-filter').value),groups=groupIssues(shown),text=$('text-input').value;
 $('issue-count').textContent=groups.length;
 $('issue-summary').textContent=shown.length?`${groups.length}가지 수정 · ${shown.length}곳`:'근거가 있는 수정만 표시합니다.';
 $('apply-all').disabled=busy||(mode==='document'&&doc?.blocks[block]?.editable===false)||!issues.some(i=>i.auto&&i.source==='rule');
 $('issues').innerHTML=groups.length?groups.map(group=>{const i=group.find(x=>x.id===selected)||group[0],label=displayChange(i,text);return `<button class="issue ${i.source} ${selected===i.id?'selected':''}" data-issue="${esc(i.id)}"><span class="badge">${esc(i.category)}</span>${group.length>1?`<span class="repeat-count">${group.length}곳</span>`:''}<strong><del>${esc(label.original)}</del> → ${esc(label.suggestion)}</strong><small>${esc(i.reason)}</small></button>`;}).join(''):'<div class="empty"><strong>표시할 수정안이 없습니다</strong><p>이 분류에서 뚜렷한 오류를 찾지 못했습니다.</p></div>';
 $('issues').querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>{selected=b.dataset.issue;renderIssues();detail();});
 if(!shown.some(i=>i.id===selected)){selected=null;$('issue-detail').hidden=true;}
 let html='',last=0;
 for(const i of shown){if(i.start<last)continue;html+=esc(text.slice(last,i.start))+`<mark>${esc(text.slice(i.start,i.end))}</mark>`;last=i.end;}
 $('highlights').innerHTML=html+esc(text.slice(last));$('highlights').hidden=!shown.length;
}
function detail(){
 const i=issues.find(i=>i.id===selected);if(!i)return;
 const group=issues.filter(x=>issueKey(x)===issueKey(i)),position=group.findIndex(x=>x.id===i.id),reference=i.evidence;
 const text=$('text-input').value;
 $('issue-detail').hidden=false;
 $('issue-detail').innerHTML=`<h2>${esc(i.category)}</h2><p class="issue-context">${esc(text.slice(Math.max(0,i.start-35),i.start))}<mark>${esc(i.original)}</mark>${esc(text.slice(i.end,i.end+35))}</p><p>${esc(i.reason)}</p>${reference?`<details class="issue-evidence"><summary>근거 보기 · ${esc(reference.title)}</summary><p>${esc(reference.summary)}</p><p>${esc(reference.exceptions)}</p><button id="open-evidence" class="text-button">공식 자료 열기</button><small>자료 확인: ${esc(reference.reviewedAt)} · 요약 v${esc(reference.version)}</small></details>`:''}${group.length>1?`<div class="occurrences"><button id="previous-issue" class="text-button" ${position===0?'disabled':''}>이전 위치</button><span>${position+1} / ${group.length}곳</span><button id="next-issue" class="text-button" ${position===group.length-1?'disabled':''}>다음 위치</button></div>`:''}<div class="actions"><button id="apply-one" class="button primary">이 위치 적용</button><button id="ignore-one" class="button secondary">이 표현 무시</button></div>`;
 $('apply-one').disabled=mode==='document'&&doc?.blocks[block]?.editable===false;
 $('apply-one').onclick=action(()=>applyIssues([i]));
 $('ignore-one').onclick=()=>{const key=issueKey(i);ignored.add(key);issues=issues.filter(x=>issueKey(x)!==key);selected=null;renderIssues();};
 if($('open-evidence'))$('open-evidence').onclick=action(()=>window.desktop.openExternal(reference.source));
 for(const [id,delta] of [['previous-issue',-1],['next-issue',1]])if($(id))$(id).onclick=()=>{selected=group[position+delta].id;renderIssues();detail();};
 $('text-input').focus();$('text-input').setSelectionRange(i.start,i.end);
}
async function inspect(kept=[]){if(busy)return;const text=$('text-input').value;if(!text.trim())return notice('검사할 글을 넣어 주세요.');setBusy(true);const started=performance.now();try{const r=checked(await api.scan(text));issues=[...r.issues,...kept.filter(k=>!r.issues.some(p=>typeof p.suggestion==='string'&&p.start<k.end&&k.start<p.end))].filter(i=>!ignored.has(issueKey(i))).sort((a,b)=>a.start-b.start);selected=null;$('time').textContent=`기본 검사 ${Math.round(performance.now()-started)}ms`;renderIssues();notice(issues.length?`${groupIssues(issues).length}가지 수정안을 찾았습니다. 같은 표현은 묶어서 표시합니다.`:'기본 검사에서 뚜렷한 오류를 찾지 못했습니다.');}finally{setBusy(false);}}
$('scan').onclick=action(()=>inspect());$('apply-all').onclick=action(()=>applyIssues(issues.filter(i=>i.auto&&i.source==='rule')));$('issue-filter').onchange=renderIssues;
$('undo').onclick=action(async()=>{if(!requireEdit())return;checked(await window.desktop.authorizeEdit());if(!undo.length)return;$('text-input').value=undo.pop();changed();invalidate();});
$('copy').onclick=action(async()=>{if(!requireEdit())return;checked(await api.copy($('text-input').value));notice('현재 글을 복사했습니다.');});
for(const [id,type] of [['save-text','txt'],['save-html','html']])$(id).onclick=action(async()=>{if(!requireEdit())return;const r=checked(await api.saveText($('text-input').value,type));if(r.ok)notice(`저장했습니다: ${r.path}`);});
function setText(text){before=text;undo=[];ignored=new Set();$('text-input').value=text;changed();invalidate();}
function textMode(){mode='text';block=null;$('document-panel').hidden=true;document.querySelector('.editor-layout').classList.remove('document-mode');$('mode-text').classList.add('active');$('mode-document').classList.remove('active');$('block-location').textContent='';$('edit-hint').hidden=true;$('clipboard').hidden=false;setBusy(false);setText(pasteText);}
$('mode-text').onclick=textMode;
$('clipboard').onclick=action(async()=>{const r=checked(await api.clipboard());pasteText=r.text;textMode();});
$('sample').onclick=()=>{pasteText='학부모님께 안내드립니다.\n내일 체험학습에 참여할수있습니다. 준비물을 꼼꼼이 확인해 주세요.\n회의가 일찍 됬어요. 금새 돌아올께요.\n오늘은 왠지 기분이 좋습니다. 깍두기를 담갔어요.';textMode();notice('일부 오류와 맞는 표현이 섞인 예문입니다.');};
function hasUnsaved(){return edits.size>0&&([...edits].some(([i,t])=>savedEdits.get(i)!==t)||[...savedEdits.keys()].some(i=>!edits.has(i)));}
function documentMode(){mode='document';$('document-panel').hidden=false;document.querySelector('.editor-layout').classList.add('document-mode');$('mode-text').classList.remove('active');$('mode-document').classList.add('active');$('clipboard').hidden=true;}
async function openDoc(){if(hasUnsaved())return notice('아직 저장하지 않은 문서 수정 내용이 있습니다. 교정본을 저장한 뒤 다른 문서를 불러오세요.');const r=checked(await api.openDocument());if(r.canceled)return;doc=r;edits=new Map();savedEdits=new Map();block=null;documentMode();$('document-name').textContent=r.name;$('document-warning').textContent=(r.warnings||[]).join('\n');renderBlocks();const first=r.blocks.findIndex(b=>b.issues.length);await selectBlock(first<0?0:first);notice(`문서 전체에서 ${r.blocks.reduce((n,b)=>n+b.issues.length,0)}개 수정 후보를 찾았습니다. 문단·셀을 선택해 확인하세요.`);}
$('mode-document').onclick=action(async()=>{if(doc){documentMode();await selectBlock(lastBlock);}else await openDoc();});$('open-document').onclick=action(openDoc);
function renderBlocks(){if(!doc)return;$('document-blocks').innerHTML=doc.blocks.map((b,n)=>`<button class="doc-block ${block===n?'active':''}" data-block="${n}" ${busy?'disabled':''}><small>${esc(b.location)}</small><span>${esc(edits.get(n)??b.text)}</span>${edits.has(n)?`<b>${savedEdits.get(n)===edits.get(n)?'교정본에 저장됨':'수정됨 · 저장 전'}</b>`:b.issues.length?`<b>확인 ${b.issues.length}개</b>`:''}</button>`).join('');$('document-blocks').querySelectorAll('[data-block]').forEach(b=>b.onclick=action(()=>selectBlock(Number(b.dataset.block))));}
async function selectBlock(index){if(busy)return;setBusy(true);try{const r=checked(await api.prepareBlock(index));block=index;lastBlock=index;doc.blocks[index].editable=r.editable;doc.blocks[index].editOriginal=r.text;setText(edits.get(index)??r.text);before=r.text;$('before').textContent=before;$('block-location').textContent=doc.blocks[index].location;$('edit-hint').hidden=false;$('edit-hint').textContent=r.hint;}finally{setBusy(false);}renderBlocks();await inspect();}
$('save-document').onclick=action(async()=>{if(!requireEdit())return;setBusy(true);try{const r=checked(await api.saveDocument([...edits].map(([index,text])=>({index,text}))));if(r.ok){savedEdits=new Map(edits);renderBlocks();notice(`교정본을 저장했습니다: ${r.path}${r.recalculate?'\n엑셀에서 열어 수식을 다시 계산하세요.':''}${r.stalePreview?'\n한글에서 열어 미리보기를 갱신하세요.':''}\n원본은 그대로 보존했습니다.`);}}finally{setBusy(false);}});
async function dismissRecommendation(){if(!settings.aiNoticeSeen)settings=checked(await api.saveSettings({aiNoticeSeen:true}));$('ai-recommendation').hidden=true;}
async function openModels(){await dismissRecommendation();renderModel(checked(await api.modelInfo()));if(!$('model-dialog').open)$('model-dialog').showModal();}
$('ai-recommendation-open').onclick=action(openModels);$('ai-recommendation-skip').onclick=action(dismissRecommendation);
const mb=n=>`${(n/1024**2).toFixed(1)}MB`;
function renderModel(info){model=info;const working=['downloading','verifying','importing'].includes(info.phase);$('model-badge').textContent=info.installed?'로컬 AI 준비됨':'기본 검사 사용 중';$('ai-scan').disabled=busy;$('ai-scan').textContent=info.installed?'AI로 추가 검사':'AI 검사 켜기 (선택)';
 $('ai-recommendation').hidden=Boolean(info.installed)||settings.aiNoticeSeen;
 if(!$('model-options').children.length)$('model-options').innerHTML=info.models.filter(m=>m.enabled).map(m=>`<label class="model-option"><input type="radio" name="model" value="${m.id}" ${m.id===info.recommended?'checked':''}> ${esc(m.name)}<small>약 400MB · CPU에서 실행</small></label>`).join('');
 $('memory-info').textContent=`이 PC의 메모리: ${info.memoryGB}GB · 검사 속도는 PC 성능에 따라 달라집니다.`;$('model-status').textContent=info.message;$('model-progress').value=info.percent||0;$('download-details').textContent=info.total?`${mb(info.received)} / ${mb(info.total)} · 남은 용량 ${mb(Math.max(0,info.total-info.received))}${info.eta?` · 약 ${Math.ceil(info.eta/60)}분 남음`:''}`:'';
 $('model-path').textContent=info.installed?`저장 위치: ${info.installed.path}`:'';$('model-download').disabled=working||Boolean(info.installed)||busy;$('model-download').textContent=info.phase==='paused'?'다운로드 재개':info.phase==='error'?'다운로드 재시도':'AI 모델 다운로드';$('model-pause').hidden=info.phase!=='downloading';$('model-import').disabled=working||busy;$('model-delete').disabled=working||busy||(!info.installed&&!['paused','error'].includes(info.phase));document.querySelector('#model-dialog .danger-zone').hidden=!info.installed&&!['paused','error'].includes(info.phase);
}
$('open-models').onclick=action(openModels);api.onModel(renderModel);api.onNavigate(()=>void openModels());
$('model-download').onclick=action(async()=>{if(!requireEdit())return;const id=document.querySelector('[name=model]:checked').value;renderModel(checked(await api.downloadModel(id)));});$('model-pause').onclick=action(async()=>renderModel(checked(await api.pauseModel())));
$('model-import').onclick=action(async()=>{if(!requireEdit())return;const r=checked(await api.importModel());if(!r.canceled)renderModel(r);});$('model-skip').onclick=()=>{$('model-dialog').close();};
$('model-delete').onclick=()=>{if(!requireEdit())return;$('delete-dialog').showModal();};$('confirm-delete').onclick=action(async()=>{if(!requireEdit())return;const r=checked(await api.deleteModel());$('delete-dialog').close();renderModel(r);notice(`모델을 삭제해 ${mb(r.freed)}의 저장 공간을 확보했습니다.`);});
$('ai-scan').onclick=action(async()=>{if(busy)return;if(!model?.installed)return openModels();setBusy(true);$('ai-cancel').hidden=false;notice('로컬 AI 모델을 준비하고 있습니다. 첫 실행은 시간이 걸릴 수 있습니다.');try{const text=$('text-input').value;const r=checked(await api.ai(text));if(text!==$('text-input').value)throw Error('글이 변경되어 AI 제안을 표시하지 않았습니다.');issues=r.issues.filter(i=>!ignored.has(issueKey(i)));selected=null;renderIssues();notice(`규정 근거를 참고한 AI 검사가 끝났습니다. 지원하는 오류 유형만 보수적으로 제안합니다.${r.warnings.length?'\n'+r.warnings.join('\n'):''}`);}finally{setBusy(false);$('ai-cancel').hidden=true;}});
$('ai-cancel').onclick=action(()=>api.cancelAI());api.onAI(p=>notice(`AI 추가 검사 ${p.current} / ${p.total} 문장 · 이 PC에서 처리 중`));
document.querySelectorAll('[data-route]').forEach(b=>b.onclick=action(()=>api.navigate(b.dataset.route)));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('open-guide').onclick=()=>$('guide-dialog').showModal();for(const id of ['minimize','maximize','close'])$(id).onclick=()=>api[id]();
function update(s){$('app-version').textContent=s.current;$('update-message').textContent=`현재 ${s.current} · ${s.message}`;$('update-progress').value=s.progress||0;$('update-download').hidden=s.phase!=='available'||s.mode!=='installed';$('update-install').hidden=s.phase!=='ready';}
$('open-update').onclick=action(async()=>{update(checked(await api.updateState()));$('update-dialog').showModal();});$('update-check').onclick=action(async()=>update(checked(await api.checkUpdate())));$('update-download').onclick=action(async()=>update(checked(await api.downloadUpdate())));$('update-install').onclick=action(()=>api.installUpdate());$('update-release').onclick=action(()=>api.openRelease());$('license-toggle').onclick=action(async()=>{const box=$('license-text');if(!box.textContent)box.textContent=checked(await api.licenseText())||'이용약관을 불러오지 못했습니다. 설치 폴더의 LICENSE.txt를 확인해 주세요.';box.hidden=!box.hidden;$('license-toggle').textContent=box.hidden?'이용약관 보기':'이용약관 닫기';$('license-toggle').setAttribute('aria-expanded',String(!box.hidden));});api.onUpdate(update);
void action(async()=>{await startAuth();settings=checked(await api.settings());renderModel(checked(await api.modelInfo()));update(checked(await api.updateState()));document.documentElement.dataset.build='bdeba563895a';document.documentElement.dataset.ready='true';})();
})();
