import {canEdit,requireEdit} from './auth/auth-ui.mjs';
import {startAuth} from './auth-setup.mjs';
import {issueKey,visibleIssues,groupIssues,displayChange} from './issue-view.mjs';
'use strict';
(()=>{
const $=id=>document.getElementById(id),api=window.doc,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let issues=[],selected=null,busy=false,model=null,settings={aiNoticeSeen:true},before='',undo=[],doc=null,block=null,lastBlock=0,edits=new Map(),mode='text',pasteText='',savedEdits=new Map();
let formats=new Map(),official=null,officialUndo=null,officialAIRunning=false;
const editStamp=(i,t)=>JSON.stringify([t,formats.get(i)||null]);
let ignored=new Set();const documentAI=new Map();
function aiStatus(message){$('ai-status').textContent=message||'';$('ai-status').hidden=!message;}
function aiLabel(){$('ai-scan').textContent=model?.installed?(mode==='document'?'문서 전체 AI 검사':'글 전체 AI 검사'):'AI 검사 켜기 (선택)';}
const checked=r=>{if(r?.error)throw Error(r.error);return r;};
function notice(message){$('notice').textContent=message||'';$('notice').hidden=!message;}
const action=fn=>async(...args)=>{try{await fn(...args);}catch(e){notice(e.message);if($('official-dialog').open)$('official-summary').textContent=e.message;}};
function changed(){const text=$('text-input').value;$('char-count').textContent=`${text.length.toLocaleString()}자`;$('after').textContent=text;$('before').textContent=before;$('undo').disabled=!undo.length;if(mode==='document'&&block!==null&&doc){const original=doc.blocks[block].editOriginal??doc.blocks[block].text;if(documentAI.has(block)&&documentAI.get(block).text!==text){documentAI.delete(block);doc.aiSummary='문서 내용이 바뀌었습니다. 수정한 문단은 AI 재검사가 필요합니다.';aiStatus(doc.aiSummary);doc.blocks[block].issues=[];}if(text===original&&!formats.has(block))edits.delete(block);else edits.set(block,text);$('save-document').disabled=!edits.size||busy;renderBlocks();}else{pasteText=text;aiStatus('');}}
function invalidate(){issues=[];selected=null;renderIssues();$('highlights').hidden=true;notice('');}
document.addEventListener('sen-auth-change',()=>setBusy(busy));
$('text-input').addEventListener('pointerdown',()=>{if(mode==='document'&&!canEdit())requireEdit();});
$('text-input').addEventListener('input',()=>{changed();invalidate();});
function setBusy(value){busy=value;for(const id of ['official-open','official-undo','scan','mode-text','mode-document','open-document','sample','clipboard','save-document','save-text','save-html','undo','apply-all'])$(id).disabled=value;$('text-input').readOnly=value||(mode==='document'&&(doc?.blocks[block]?.editable===false||!canEdit()));$('ai-scan').disabled=value;document.querySelectorAll('.doc-block').forEach(b=>b.disabled=value);for(const id of ['apply-one','ignore-one','previous-issue','next-issue'])if($(id))$(id).disabled=value||(id==='apply-one'&&mode==='document'&&doc?.blocks[block]?.editable===false);$('undo').disabled=value||!undo.length;$('save-document').disabled=value||!edits.size;$('apply-all').disabled=value||!issues.some(i=>i.auto&&i.source==='rule')||(mode==='document'&&doc?.blocks[block]?.editable===false);}
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
async function inspect(kept=null){if(busy)return;const text=$('text-input').value;if(!text.trim())return notice('검사할 글을 넣어 주세요.');const cached=mode==='document'?documentAI.get(block):null;kept??=cached?.text===text?cached.issues.filter(i=>i.source==='ai'):[];setBusy(true);const started=performance.now();try{const r=checked(await api.scan(text));issues=[...r.issues,...kept.filter(k=>!r.issues.some(p=>typeof p.suggestion==='string'&&p.start<k.end&&k.start<p.end))].filter(i=>!ignored.has(issueKey(i))).sort((a,b)=>a.start-b.start);selected=null;$('time').textContent=`기본 검사 ${Math.round(performance.now()-started)}ms`;renderIssues();if(mode==='document'&&doc){doc.blocks[block].issues=issues;if(kept.length)documentAI.set(block,{text,issues:kept,stats:cached?.text===text?cached.stats:null});renderBlocks();}notice(issues.length?`${groupIssues(issues).length}가지 수정안을 찾았습니다. 같은 표현은 묶어서 표시합니다.`:'기본 검사에서 뚜렷한 오류를 찾지 못했습니다.');}finally{setBusy(false);}}
$('scan').onclick=action(()=>inspect());$('apply-all').onclick=action(()=>applyIssues(issues.filter(i=>i.auto&&i.source==='rule')));$('issue-filter').onchange=renderIssues;
$('undo').onclick=action(async()=>{if(!requireEdit())return;checked(await window.desktop.authorizeEdit());if(!undo.length)return;$('text-input').value=undo.pop();changed();invalidate();});
$('copy').onclick=action(async()=>{if(!requireEdit())return;checked(await api.copy($('text-input').value));notice('현재 글을 복사했습니다.');});
for(const [id,type] of [['save-text','txt'],['save-html','html']])$(id).onclick=action(async()=>{if(!requireEdit())return;const r=checked(await api.saveText($('text-input').value,type));if(r.ok)notice(`저장했습니다: ${r.path}`);});
function setText(text){before=text;undo=[];ignored=new Set();$('text-input').value=text;changed();invalidate();}
function textMode(){mode='text';block=null;$('document-panel').hidden=true;document.querySelector('.editor-layout').classList.remove('document-mode');$('mode-text').classList.add('active');$('mode-document').classList.remove('active');$('block-location').textContent='';$('edit-hint').hidden=true;$('clipboard').hidden=false;setBusy(false);setText(pasteText);aiLabel();aiStatus('');}
$('mode-text').onclick=textMode;
const officialStamp=()=>mode==='text'?$('text-input').value:JSON.stringify([...edits].map(([i,t])=>[i,editStamp(i,t)]));
async function refreshOfficial(){
 if(!official||busy)return;setBusy(true);$('official-apply').disabled=true;
 try{
  const r=checked(await api.official(official.input,official.overrides));official.result=r;
  $('official-summary').textContent=`항목 ${r.rows.length}개 · 변경 ${r.changed}개 · 확인 필요 ${r.rows.filter(x=>x.reason).length}개${mode==='document'?' · 문단 서식 포함':''}`;
  $('official-rows').innerHTML=r.rows.length?r.rows.map(row=>`<div class="official-row"><label>${esc(row.location)}<select aria-label="${esc(row.location)} 항목 단계" data-official-level="${row.index}" ${row.reason&&row.reason===row.originalReason?'disabled':''}><option value="">유지</option>${['1.','가.','1)','가)','(1)','(가)','①','㉮'].map((m,i)=>`<option value="${i+1}" ${row.level===i+1?'selected':''}>${i+1}단계 ${m}</option>`).join('')}</select></label><div><small>현재</small><pre>${esc(row.before)}</pre></div><div><small>${row.changed?'정리 후':'유지'}</small><pre>${esc(row.reason?row.before:row.preview??row.after)}</pre></div>${row.reason?`<p class="official-reason">${esc(row.reason)}</p>`:''}</div>`).join(''):'<p>정리할 항목 번호가 없습니다. 1., 가., 1), 가) 등으로 시작하는 문단을 넣어 주세요.</p>';
  $('official-rows').querySelectorAll('[data-official-level]').forEach(select=>select.onchange=action(async()=>{official.aiResult=null;$('official-ai-accept').hidden=true;$('official-ai-proposals').replaceChildren();official.overrides[select.dataset.officialLevel]=select.value?Number(select.value):null;await refreshOfficial();}));
  $('official-skipped').hidden=!r.warnings.length;$('official-skipped').querySelector('ul').innerHTML=r.warnings.map(w=>`<li>${esc(w.text.slice(0,65))} — ${esc(w.reason)}</li>`).join('');
  $('official-apply').disabled=!r.changed;
 }catch(e){official.result=null;throw e;}finally{setBusy(false);}
}
$('official-open').onclick=action(async()=>{
 if(busy)return;
 if(mode==='document'&&!/\.hwpx$/i.test(doc?.name||''))return notice('공문 항목 정리는 텍스트와 HWPX에서 사용할 수 있습니다.');
 official={mode,doc,stamp:officialStamp(),input:mode==='text'?$('text-input').value:{edits:[...edits].map(([index,text])=>({index,text}))},overrides:{}};
 $('official-ai-status').textContent='모델이 준비되면 애매한 항목만 검토합니다. 한 번에 최대 24개, 추론 시간 최대 2분입니다.';$('official-ai-proposals').replaceChildren();$('official-ai-accept').hidden=true;
 await refreshOfficial();if(official.result)$('official-dialog').showModal();
});
$('official-apply').onclick=action(async()=>{
 if(busy||!official?.result||!requireEdit())return;checked(await window.desktop.authorizeEdit());
 if(mode!==official.mode||doc!==official.doc||officialStamp()!==official.stamp)throw Error('내용이 바뀌었습니다. 공문 항목 정리를 다시 실행해 주세요.');
 const rows=official.result.rows.filter(r=>r.changed);
 if(mode==='document'&&new Set([...edits.keys(),...rows.map(r=>r.blockIndex??r.index)]).size>100)throw Error('한 번에 100개 문단·셀까지 저장할 수 있습니다. 문서를 나누어 정리해 주세요.');
 const snapshot={mode,doc,text:$('text-input').value,edits:new Map(edits),formats:new Map(formats)};
 if(mode==='text'){undo.push($('text-input').value);$('text-input').value=official.result.text;changed();invalidate();}
 else{
  for(const row of rows){const i=row.blockIndex??row.index,p=row.paragraph??0;doc.blocks[i].editOriginal=row.original;const values=(edits.get(i)??row.original).split('\n');values[p]=row.after;edits.set(i,values.join('\n'));const old=formats.get(i);const entries=(Array.isArray(old)?old:old?[old]:[]).filter(f=>(f.paragraph??0)!==p);entries.push({...row.format,paragraph:p});formats.set(i,entries);documentAI.delete(i);doc.blocks[i].issues=[];}
  if(block!==null)$('text-input').value=edits.get(block)??doc.blocks[block].editOriginal??doc.blocks[block].text;
  undo=[];changed();invalidate();renderBlocks();
 }
 officialUndo={...snapshot,stamp:officialStamp()};$('official-undo').hidden=false;$('official-dialog').close();setBusy(false);
 notice(`${rows.length}개 항목을 정리했습니다.${mode==='document'?' 교정본 저장을 누르면 문단 서식까지 저장됩니다.':' 복사하거나 TXT로 저장할 수 있습니다.'}`);
});
$('official-ai').onclick=action(async()=>{
 if(busy||!official)return;
 if(!model?.installed){$('official-dialog').close();await openModels();return;}
 officialAIRunning=true;official.aiResult=null;setBusy(true);$('official-ai').disabled=true;$('official-apply').disabled=true;$('official-ai-accept').hidden=true;$('official-ai-cancel').hidden=false;
 $('official-rows').querySelectorAll('select').forEach(s=>s.disabled=true);$('official-ai-status').textContent='로컬 모델에서 구조를 검토하고 있습니다…';$('official-ai-proposals').replaceChildren();
 const requestStamp=officialStamp(),overrideStamp=JSON.stringify(official.overrides);
 try{
  const result=checked(await api.officialAI(official.input,official.overrides));
  if(officialStamp()!==requestStamp||JSON.stringify(official.overrides)!==overrideStamp)throw Error('내용이나 단계가 바뀌었습니다. 구조 검토를 다시 실행해 주세요.');
  official.aiResult=result;official.aiStamp=requestStamp;official.aiOverrideStamp=overrideStamp;
  const st=result.stats;$('official-ai-status').textContent=`AI 구조 검토 ${st.cancelled?'중단':st.failed||st.unprocessed?'일부 완료':'완료'} · 검토 ${st.completed}/${st.total}${st.resolvedByRules?` · 규칙으로 해결 ${st.resolvedByRules}`:''} · 실패 ${st.failed} · 미검토 ${st.unprocessed} · 판단 보류 ${st.abstained} · 제안 ${result.proposals.length}개`;
  $('official-ai-proposals').innerHTML=result.proposals.map((p,i)=>`<label class="official-ai-proposal"><input type="checkbox" data-proposal="${i}" checked><span>${esc(p.before.slice(0,100))} → ${p.level}단계 <small>${esc({indent:'들여쓰기 근거',marker:'기호 근거',meaning:'문맥 재검토 통과'}[p.evidence])}</small></span></label>`).join('');
  $('official-ai-accept').hidden=!result.proposals.length;
 }catch(e){$('official-ai-status').textContent='구조 검토 실패: '+e.message;throw e;}
 finally{officialAIRunning=false;setBusy(false);$('official-ai').disabled=false;$('official-ai-cancel').hidden=true;$('official-apply').disabled=!official.result?.changed;$('official-rows').querySelectorAll('select').forEach(s=>{const row=official.result?.rows.find(r=>String(r.index)===s.dataset.officialLevel);s.disabled=Boolean(row?.originalReason);});}
});
$('official-ai-cancel').onclick=action(()=>api.cancelAI());
$('official-dialog').addEventListener('close',()=>{if(officialAIRunning)void api.cancelAI();});
api.onOfficialProgress(p=>{if(officialAIRunning)$('official-ai-status').textContent=`AI 구조 검토 ${p.current}/${p.total} · 완료 ${p.completed} · 실패 ${p.failed}`;});
$('official-ai-accept').onclick=action(async()=>{
 if(busy||!official?.aiResult)return;
 if(officialStamp()!==official.aiStamp||JSON.stringify(official.overrides)!==official.aiOverrideStamp)throw Error('검토 이후 내용이 변경되었습니다. 다시 검토해 주세요.');
 for(const input of $('official-ai-proposals').querySelectorAll('input:checked')){const p=official.aiResult.proposals[Number(input.dataset.proposal)];official.overrides[String(p.index)]=p.level;}
 official.aiResult=null;$('official-ai-accept').hidden=true;$('official-ai-proposals').replaceChildren();await refreshOfficial();$('official-ai-status').textContent='선택한 제안을 미리보기에 반영했습니다. 변경 사항 적용 전에 확인하세요.';
});
$('official-undo').onclick=action(async()=>{
 if(!officialUndo||!requireEdit())return;checked(await window.desktop.authorizeEdit());
 if(mode!==officialUndo.mode||doc!==officialUndo.doc||officialStamp()!==officialUndo.stamp)throw Error('항목 정리 후 내용이 변경되었습니다. 이후 수정 내용을 먼저 되돌려 주세요.');
 edits=new Map(officialUndo.edits);formats=new Map(officialUndo.formats);
 $('text-input').value=mode==='text'?officialUndo.text:edits.get(block)??doc.blocks[block].editOriginal??doc.blocks[block].text;
 documentAI.clear();if(doc){doc.aiSummary='';for(const b of doc.blocks)b.issues=[];}undo=[];officialUndo=null;$('official-undo').hidden=true;changed();invalidate();setBusy(false);notice('항목 정리를 되돌렸습니다.');
});
$('clipboard').onclick=action(async()=>{const r=checked(await api.clipboard());pasteText=r.text;textMode();});
$('sample').onclick=()=>{pasteText='학부모님께 안내드립니다.\n내일 체험학습에 참여할수있습니다. 준비물을 꼼꼼이 확인해 주세요.\n회의가 일찍 됬어요. 금새 돌아올께요.\n오늘은 왠지 기분이 좋습니다. 깍두기를 담갔어요.';textMode();notice('일부 오류와 맞는 표현이 섞인 예문입니다.');};
function hasUnsaved(){return edits.size>0&&([...edits].some(([i,t])=>savedEdits.get(i)!==editStamp(i,t))||[...savedEdits.keys()].some(i=>!edits.has(i)));}
function documentMode(){mode='document';$('document-panel').hidden=false;document.querySelector('.editor-layout').classList.add('document-mode');$('mode-text').classList.remove('active');$('mode-document').classList.add('active');$('clipboard').hidden=true;aiLabel();aiStatus(doc?.aiSummary);}
async function openDoc(){if(hasUnsaved())return notice('아직 저장하지 않은 문서 수정 내용이 있습니다. 교정본을 저장한 뒤 다른 문서를 불러오세요.');const r=checked(await api.openDocument());if(r.canceled)return;doc=r;formats=new Map();officialUndo=null;$('official-undo').hidden=true;documentAI.clear();edits=new Map();savedEdits=new Map();block=null;documentMode();$('document-name').textContent=r.name;$('document-warning').textContent=(r.warnings||[]).join('\n');renderBlocks();const first=r.blocks.findIndex(b=>b.issues.length);await selectBlock(first<0?0:first);notice(`문서 전체 기본 검사에서 ${r.blocks.reduce((n,b)=>n+b.issues.length,0)}개 수정 후보를 찾았습니다. AI 검사는 아직 실행하지 않았습니다.`);}
$('mode-document').onclick=action(async()=>{if(doc){documentMode();await selectBlock(lastBlock);}else await openDoc();});$('open-document').onclick=action(openDoc);
function renderBlocks(){if(!doc)return;$('document-blocks').innerHTML=doc.blocks.map((b,n)=>`<button class="doc-block ${block===n?'active':''}" data-block="${n}" ${busy?'disabled':''}><small>${esc(b.location)}</small><span>${esc(edits.get(n)??b.text)}</span>${edits.has(n)?`<b>${savedEdits.get(n)===editStamp(n,edits.get(n))?'교정본에 저장됨':'수정됨 · 저장 전'}</b>`:b.issues.length?`<b>확인 ${b.issues.length}개</b>`:''}${documentAI.has(n)?`<small>${documentAI.get(n).stats?`AI ${documentAI.get(n).stats.completed}/${documentAI.get(n).stats.total}구간 · 실패 ${documentAI.get(n).stats.failed} · 미검사 ${documentAI.get(n).stats.unprocessed}`:'AI 재검사 필요'}</small>`:''}</button>`).join('');$('document-blocks').querySelectorAll('[data-block]').forEach(b=>b.onclick=action(()=>selectBlock(Number(b.dataset.block))));}
async function selectBlock(index){if(busy)return;setBusy(true);try{const r=checked(await api.prepareBlock(index));block=index;lastBlock=index;doc.blocks[index].editable=r.editable;doc.blocks[index].editOriginal=r.text;setText(edits.get(index)??r.text);before=r.text;$('before').textContent=before;$('block-location').textContent=doc.blocks[index].location;$('edit-hint').hidden=false;$('edit-hint').textContent=r.hint;}finally{setBusy(false);}renderBlocks();await inspect();}
$('save-document').onclick=action(async()=>{if(!requireEdit())return;setBusy(true);try{const r=checked(await api.saveDocument([...edits].map(([index,text])=>({index,text,format:formats.get(index)}))));if(r.ok){savedEdits=new Map([...edits].map(([i,t])=>[i,editStamp(i,t)]));renderBlocks();notice(`교정본을 저장했습니다: ${r.path}${r.recalculate?'\n엑셀에서 열어 수식을 다시 계산하세요.':''}${r.stalePreview?'\n한글에서 열어 미리보기를 갱신하세요.':''}\n원본은 그대로 보존했습니다.`);}}finally{setBusy(false);}});
async function dismissRecommendation(){if(!settings.aiNoticeSeen)settings=checked(await api.saveSettings({aiNoticeSeen:true}));$('ai-recommendation').hidden=true;}
async function openModels(){await dismissRecommendation();renderModel(checked(await api.modelInfo()));if(!$('model-dialog').open)$('model-dialog').showModal();}
$('ai-recommendation-open').onclick=action(openModels);$('ai-recommendation-skip').onclick=action(dismissRecommendation);
const mb=n=>`${(n/1024**2).toFixed(1)}MB`;
function renderModel(info){model=info;const working=['downloading','verifying','importing'].includes(info.phase);$('model-badge').textContent=info.installed?'로컬 AI 준비됨':'기본 검사 사용 중';$('ai-scan').disabled=busy;aiLabel();
 $('ai-recommendation').hidden=Boolean(info.installed)||settings.aiNoticeSeen;
 if(!$('model-options').children.length)$('model-options').innerHTML=info.models.filter(m=>m.enabled).map(m=>`<label class="model-option"><input type="radio" name="model" value="${m.id}" ${m.id===info.recommended?'checked':''}> ${esc(m.name)}<small>약 400MB · CPU에서 실행</small></label>`).join('');
 $('memory-info').textContent=`이 PC의 메모리: ${info.memoryGB}GB · 검사 속도는 PC 성능에 따라 달라집니다.`;$('model-status').textContent=info.message;$('model-progress').value=info.percent||0;$('download-details').textContent=info.total?`${mb(info.received)} / ${mb(info.total)} · 남은 용량 ${mb(Math.max(0,info.total-info.received))}${info.eta?` · 약 ${Math.ceil(info.eta/60)}분 남음`:''}`:'';
 $('model-path').textContent=info.installed?`저장 위치: ${info.installed.path}`:'';$('model-download').disabled=working||Boolean(info.installed)||busy;$('model-download').textContent=info.phase==='paused'?'다운로드 재개':info.phase==='error'?'다운로드 재시도':'AI 모델 다운로드';$('model-pause').hidden=info.phase!=='downloading';$('model-import').disabled=working||busy;$('model-delete').disabled=working||busy||(!info.installed&&!['paused','error'].includes(info.phase));document.querySelector('#model-dialog .danger-zone').hidden=!info.installed&&!['paused','error'].includes(info.phase);
}
$('open-models').onclick=action(openModels);api.onModel(renderModel);api.onNavigate(()=>void openModels());
$('model-download').onclick=action(async()=>{if(!requireEdit())return;const id=document.querySelector('[name=model]:checked').value;renderModel(checked(await api.downloadModel(id)));});$('model-pause').onclick=action(async()=>renderModel(checked(await api.pauseModel())));
$('model-import').onclick=action(async()=>{if(!requireEdit())return;const r=checked(await api.importModel());if(!r.canceled)renderModel(r);});$('model-skip').onclick=()=>{$('model-dialog').close();};
$('model-delete').onclick=()=>{if(!requireEdit())return;$('delete-dialog').showModal();};$('confirm-delete').onclick=action(async()=>{if(!requireEdit())return;const r=checked(await api.deleteModel());$('delete-dialog').close();renderModel(r);notice(`모델을 삭제해 ${mb(r.freed)}의 저장 공간을 확보했습니다.`);});
$('ai-scan').onclick=action(async()=>{
 if(busy)return;if(!model?.installed)return openModels();
 const whole=mode==='document',text=$('text-input').value;
 const input=whole?{blocks:doc.blocks.map((b,index)=>({index,text:edits.get(index)??b.editOriginal??b.text}))}:text;
 if(!(whole?input.blocks.some(b=>b.text.trim()):text.trim()))return notice('검사할 글을 넣어 주세요.');
 setBusy(true);$('ai-cancel').hidden=false;const started=performance.now();
 aiStatus(`${whole?'문서 전체':'글 전체'} AI 검사 준비 중`);notice('로컬 AI 모델을 준비하고 있습니다. 긴 문서는 시간이 걸립니다.');
 try{
  const r=checked(await api.ai(input));
  if(whole){
   documentAI.clear();for(const b of r.blocks){documentAI.set(b.index,b);doc.blocks[b.index].issues=b.issues;}
   issues=(documentAI.get(block)?.issues||[]).filter(i=>!ignored.has(issueKey(i)));renderBlocks();
  }else{if(text!==$('text-input').value)throw Error('글이 변경되어 AI 제안을 표시하지 않았습니다.');issues=r.issues.filter(i=>!ignored.has(issueKey(i)));}
  selected=null;renderIssues();
  const st=r.stats,count=(whole?r.blocks.flatMap(b=>b.issues):r.issues).filter(i=>i.source==='ai').length;
  const state=st.cancelled?'중단':st.failed&&!st.completed?'실패':st.failed||st.unprocessed?'일부만 완료':st.total?'완료':'검사 대상 없음';
  const summary=`${whole?'문서 전체':'글 전체'} AI 검사 ${state} · 실제 검사 ${st.completed}/${st.total}구간 · 실패 ${st.failed} · 미검사 ${st.unprocessed} · AI 제안 ${count}곳`;
  if(whole)doc.aiSummary=summary;aiStatus(summary);$('time').textContent=`AI ${((performance.now()-started)/1000).toFixed(1)}초`;
  notice(`${summary}\n긴 문장은 나누어 검사합니다. ${whole?'문단·셀을 선택하면 해당 결과를 볼 수 있습니다. ':''}${count?'제안을 확인한 뒤 하나씩 적용하세요.':'표시할 AI 제안이 없습니다. 오류가 전혀 없다는 뜻은 아닙니다.'}${r.warnings.length?'\n'+r.warnings.join('\n'):''}`);
 }catch(e){aiStatus('AI 검사를 완료하지 못했습니다: '+e.message);if(whole)doc.aiSummary=$('ai-status').textContent;throw e;}
 finally{setBusy(false);$('ai-cancel').hidden=true;}
});
$('ai-cancel').onclick=action(async()=>{await api.cancelAI();notice('AI 검사를 중단하고 있습니다. 완료한 결과는 보존합니다.');});
api.onAI(p=>{if(!busy||$('ai-cancel').hidden)return;const message=`${mode==='document'?`문서 ${p.block}/${p.blocks} 문단·셀 · `:''}AI 검사 ${p.current}/${p.total}구간 · 완료 ${p.completed} · 실패 ${p.failed}`;aiStatus(message);notice(message);});

document.querySelectorAll('[data-route]').forEach(b=>b.onclick=action(()=>api.navigate(b.dataset.route)));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('open-guide').onclick=()=>$('guide-dialog').showModal();for(const id of ['minimize','maximize','close'])$(id).onclick=()=>api[id]();
function update(s){$('app-version').textContent=s.current;$('update-message').textContent=`현재 ${s.current} · ${s.message}`;$('update-progress').value=s.progress||0;$('update-download').hidden=s.phase!=='available'||s.mode!=='installed';$('update-install').hidden=s.phase!=='ready';}
$('open-update').onclick=action(async()=>{update(checked(await api.updateState()));$('update-dialog').showModal();});$('update-check').onclick=action(async()=>update(checked(await api.checkUpdate())));$('update-download').onclick=action(async()=>update(checked(await api.downloadUpdate())));$('update-install').onclick=action(()=>api.installUpdate());$('update-release').onclick=action(()=>api.openRelease());$('license-toggle').onclick=action(async()=>{const box=$('license-text');if(!box.textContent)box.textContent=checked(await api.licenseText())||'이용약관을 불러오지 못했습니다. 설치 폴더의 LICENSE.txt를 확인해 주세요.';box.hidden=!box.hidden;$('license-toggle').textContent=box.hidden?'이용약관 보기':'이용약관 닫기';$('license-toggle').setAttribute('aria-expanded',String(!box.hidden));});api.onUpdate(update);
void action(async()=>{await startAuth();settings=checked(await api.settings());renderModel(checked(await api.modelInfo()));update(checked(await api.updateState()));document.documentElement.dataset.build='bdeba563895a';document.documentElement.dataset.ready='true';})();
})();
