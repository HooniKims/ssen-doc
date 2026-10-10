'use strict';
const $=id=>document.getElementById(id),files=new Map(),results=new Map();
let busy=false,progressFile=null,finished=0,dragDepth=0;
let mode='quality',reduction=50,lastTotal=-1,targetValid=true;
const conversion={quality:false,target:true};
const totalBytes=()=>[...files.values()].reduce((n,f)=>n+f.size,0);
function syncTarget(source){
  const total=totalBytes();
  if(source==='mb')reduction=(1-Number($('target-mb').value)*1024*1024/total)*100;
  else if(source)reduction=Number($(source==='slider'?'target-slider':'target-percent').value);
  const target=total*(1-reduction/100);
  targetValid=Number.isFinite(reduction)&&reduction>0&&reduction<100&&target>=1&&(!source||$(source==='mb'?'target-mb':source==='slider'?'target-slider':'target-percent').value!=='');
  if(source!=='percent')$('target-percent').value=Number.isFinite(reduction)?Number(reduction.toFixed(2)):'';
  if(source!=='slider')$('target-slider').value=Number.isFinite(reduction)?reduction:50;
  if(source!=='mb')$('target-mb').value=targetValid?Number((target/1024/1024).toFixed(4)):'';
  $('target-before').textContent=size(total);$('target-preview').textContent=targetValid?size(target)+' 이하':'목표를 확인해 주세요';
  $('target-reduction-label').textContent=targetValid?`${Number(reduction.toFixed(2))}% 줄이기`:'';
  $('target-error').textContent='목표 용량은 0보다 크고 원래 용량보다 작아야 합니다.';$('target-error').hidden=targetValid||!total;
  $('start').disabled=!files.size||(mode==='target'&&!targetValid);lastTotal=total;
}
$('mode-options').onchange=()=>{conversion[mode]=$('convert-png').checked;mode=document.querySelector('[name=mode]:checked').value;$('convert-png').checked=conversion[mode];$('target-options').hidden=mode!=='target';$('quality-panel').hidden=mode==='target';syncTarget();};
for(const [id,source] of [['target-slider','slider'],['target-percent','percent'],['target-mb','mb']])$(id).oninput=()=>syncTarget(source);
const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${(n/1024).toFixed(1)} KB`;
const hints={high:'긴 변 3,200px · JPEG 품질 90',balanced:'긴 변 2,200px · JPEG 품질 82',small:'긴 변 1,400px · JPEG 품질 70'};
function notice(message){$('notice').textContent=message||'';$('notice').hidden=!message;}
function stage(value){document.querySelectorAll('[data-stage]').forEach(el=>{if(el.dataset.stage===value)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});}
function render(){
  const has=files.size>0;$('empty-view').hidden=has;$('workspace').hidden=!has;$('review-page').classList.toggle('has-files',has);
  $('file-count').textContent=`${files.size}개`;
  $('total-before').textContent=size([...files.values()].reduce((n,f)=>n+f.size,0));
  const completed=[...results.values()].filter(r=>r.ok),saved=completed.reduce((n,r)=>n+r.saved,0);
  $('total-saved').textContent=completed.length?size(saved):'아직 처리 전';
  $('document-list').innerHTML=[...files.values()].map(file=>{
    const result=results.get(file.id),processing=progressFile===file.id;
    const label=processing?'처리 중':result?.ok?(result.saved>0?'저장 완료':'원본 크기로 저장'):result?'처리 실패':busy?'대기 중':'준비됨';
    const targetNote=result?.ok&&result.targetBytes?`<p class="target-result ${result.targetMet?'met':'missed'}">${result.targetMet?'목표 달성':'목표 용량 초과'} · 목표 ${size(result.targetBytes)} 이하${result.targetMet?'':'<span>설정한 화질 범위에서 더 줄이기 어렵습니다. 목표 용량을 늘려 다시 시도해 보세요.</span>'}</p>`:'';
    return `<article class="document-row${processing?' processing':''}" data-id="${file.id}"><div class="document-top"><span class="document-icon">HWPX</span><div class="document-name"><b title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</b><small>${label}</small></div><div class="document-size"><span>${size(file.size)}</span>${result?.ok?` → ${size(result.after)}<strong>${result.saved>0?Math.round(result.saved/result.before*100)+'% 줄었어요':'추가 감소 없음'}</strong>`:''}</div><button class="remove-file" data-action="remove" aria-label="${escapeHtml(file.name)} 목록에서 제거" ${busy?'disabled':''}>×</button></div>${targetNote}${result?.ok?`<div class="result-actions"><small>이미지 ${result.images}개 중 ${result.changed}개 최적화</small><button class="text-button" data-action="details">처리 내역</button><button class="text-button" data-action="open">문서 열기</button><button class="text-button" data-action="show">폴더 보기</button></div>`:result?`<p class="file-error">${escapeHtml(result.error)}</p>`:''}</article>`;
  }).join('');
  for(const id of ['demo','pick-empty','pick-more','new-task','choose-folder','reset-folder'])$(id).disabled=busy;
  for(const id of ['quality-options','mode-options','target-options','convert-png'])$(id).disabled=busy;
  if(lastTotal!==totalBytes())syncTarget();
  $('start').hidden=busy;$('start').disabled=!has||(mode==='target'&&!targetValid);$('cancel').hidden=!busy;$('task-progress').hidden=!busy;
  if(!busy){progressFile=null;stage(completed.length?'done':has?'settings':'add');}
}
async function add(response){if(response.error){notice(response.error);return;}for(const file of response.files){if(!files.has(file.id))files.set(file.id,file);}notice(response.errors?.join('\n'));showPage('review');render();}
function showPage(page){$('review-page').hidden=page!=='review';$('guide-page').hidden=page!=='guide';$('nav-review').classList.toggle('active',page==='review');$('nav-guide').classList.toggle('active',page==='guide');$('page-label').textContent=page==='review'?'용량 줄이기':'사용 안내';}
async function pick(){if(!busy)await add(await window.lite.selectFiles());}
$('pick-empty').onclick=e=>{e.stopPropagation();void pick();};$('pick-more').onclick=pick;
$('drop-zone').onclick=pick;$('drop-zone').onkeydown=e=>{if(e.target===$('drop-zone')&&['Enter',' '].includes(e.key)){e.preventDefault();void pick();}};
$('demo').onclick=async()=>{await add(await window.lite.demo());};
$('nav-review').onclick=()=>showPage('review');$('nav-guide').onclick=()=>showPage('guide');document.querySelector('.brand').onclick=e=>{e.preventDefault();showPage('review');};
$('new-task').onclick=async()=>{const r=await window.lite.clear();if(r.error)return notice(r.error);files.clear();results.clear();notice('');$('run-status').textContent='선택한 품질로 새 문서를 저장합니다.';$('summary-status').textContent='처리할 준비가 되었어요';render();showPage('review');};
$('quality-options').onchange=()=>{const value=document.querySelector('[name=quality]:checked').value;$('quality-hint').textContent=hints[value]+' · 작은 이미지는 확대하지 않습니다.';};
function folder(result){if(result.error)return notice(result.error);$('folder-label').textContent=result.path||'각 원본 문서가 있는 폴더';$('reset-folder').hidden=!result.path;}
$('choose-folder').onclick=async()=>folder(await window.lite.chooseFolder());$('reset-folder').onclick=async()=>folder(await window.lite.resetFolder());
$('document-list').onclick=async e=>{
  const button=e.target.closest('[data-action]'),row=e.target.closest('[data-id]');if(!button||!row)return;
  const id=row.dataset.id,action=button.dataset.action;
  if(action==='remove'){const r=await window.lite.removeFile(id);if(r.error)return notice(r.error);files.delete(id);results.delete(id);render();}
  else if(action==='details'){
    const result=results.get(id);$('detail-file').textContent=result.path;
    $('image-details').innerHTML=result.records.length?result.records.map(r=>`<div class="image-detail"><b>${escapeHtml(r.name)}</b><p>${size(r.before)} → ${size(r.after)} · ${escapeHtml(r.reason)}${r.width?` · ${r.beforeWidth} × ${r.beforeHeight} → ${r.width} × ${r.height}px`:''}</p></div>`).join(''):'<p>문서에 처리할 이미지가 없습니다.</p>';
    $('detail-dialog').showModal();
  }else{const r=await(action==='open'?window.lite.openResult(id):window.lite.showResult(id));if(r.error)notice(r.error);}
};
$('start').onclick=async()=>{
  if(busy||!files.size||(mode==='target'&&!targetValid))return;busy=true;results.clear();finished=0;notice('');$('task-progress').value=0;$('cancel').disabled=false;$('cancel').textContent='작업 중지';$('run-status').textContent='문서를 읽고 있습니다.';$('summary-status').textContent='문서를 처리하고 있어요';render();
  try{
    const response=await window.lite.start([...files.keys()],{mode,preset:document.querySelector('[name=quality]:checked').value,targetRatio:1-reduction/100,convertOpaquePng:$('convert-png').checked});
    if(response.error){notice(response.error);$('run-status').textContent='작업을 완료하지 못했습니다.';$('summary-status').textContent='오류 안내를 확인해 주세요';}
    else {
      for(const result of response.results)results.set(result.id,result);
      const good=response.results.filter(r=>r.ok).length,bad=response.results.length-good;
      const message=response.canceled?`작업 중지 · ${good}개 저장됨`:`${good}개 저장 완료${bad?' · '+bad+'개 처리 실패':''}`;
      const missed=response.results.filter(r=>r.ok&&r.targetMet===false).length;
      $('run-status').textContent=message+(missed?` · ${missed}개 목표 용량 초과`:'');$('summary-status').textContent=$('run-status').textContent;
    }
  }catch{notice('작업을 완료하지 못했습니다. 다시 시도해 주세요.');$('run-status').textContent='작업을 완료하지 못했습니다.';$('summary-status').textContent='오류 안내를 확인해 주세요';}
  finally{busy=false;progressFile=null;render();document.querySelector('.options-scroll').scrollTop=0;}
};
$('cancel').onclick=async()=>{$('cancel').disabled=true;$('cancel').textContent='중지하고 있어요…';$('run-status').textContent='현재 작업을 정리하고 있습니다.';await window.lite.cancel();};
window.lite.onProgress(value=>{
  if(progressFile!==value.id){progressFile=value.id;render();}
  const text=value.phase.startsWith('search')?`목표 용량 조절 중 · ${value.attempt}차${value.phase==='search-verifying'?' 검증':''}`:value.phase==='verifying'?'저장 결과 검증 중':value.phase==='reading'?'문서 읽는 중':`이미지 ${value.image}/${value.imageTotal}개 처리 중`;
  $('run-status').textContent=`${value.fileIndex}/${value.fileTotal} 문서 · ${text}`;
  const fraction=value.phase==='verifying'?.95:value.phase==='optimizing'?.1+.75*(value.image-1)/Math.max(1,value.imageTotal):0;
  $('task-progress').value=(finished+fraction)/files.size*100;
});
window.lite.onResult(result=>{results.set(result.id,result);if(result.ok&&files.has(result.id))files.get(result.id).size=result.before;finished++;progressFile=null;render();$('task-progress').value=finished/files.size*100;});
window.addEventListener('dragenter',e=>{e.preventDefault();if(!busy&&Array.from(e.dataTransfer.types).includes('Files')){dragDepth++;document.body.classList.add('drag-overlay');}});
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('drag-overlay');}});
window.addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('drag-overlay');if(!busy)await add(await window.lite.addDropped(e.dataTransfer.files));});
for(const name of ['minimize','maximize','close'])$(name).onclick=()=>window.lite[name]();
render();
