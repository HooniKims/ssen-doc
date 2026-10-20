'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('_workspace/harness-quality-1.5.1'),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const before=read(path.join(root,'baseline.json')),after=read(path.join(root,'current.json')),unseen=read(path.join(root,'unseen.json'));
const old=read('_workspace/practical-quality-1.5.0/results.json'),oldParagraph=read('_workspace/practical-quality-1.5.0/paragraph.json');
assert.ok(before.completed&&after.completed&&unseen.completed);assert.equal(before.corpusHash,after.corpusHash);
const count=rows=>({correct:rows.filter(r=>r.exact).length,total:rows.length,aiProposals:rows.reduce((n,r)=>n+(r.aiIssues?.length||0),0)});
const aggregate=rows=>rows.reduce((sum,r)=>{for(const key of ['total','completed','failed','unprocessed'])sum[key]+=r.stats[key];return sum;},{total:0,completed:0,failed:0,unprocessed:0});
const fragments=['오랜만에','역할','며칠','교사로서','꼼꼼히','안 나갔습니다','바랍니다'];
const paragraph=r=>({exact:r.exact,correct:fragments.filter(s=>r.actual.includes(s)).length,total:7});
const summary={
 version:require('../package.json').version,date:new Date().toISOString(),model:after.model,synthetic:true,corpusHash:after.corpusHash,
 method:'First corpus expectations frozen before changes, then used during development; treat as regression, not independent holdout. A second unseen corpus was frozen after prompt development with no engine tuning against its results. Same model and CPU runtime. Metrics combine rules and accepted AI suggestions, not model-only accuracy. UI tests use mocks; quality results use real inference.',
 holdout:{before:{errors:count(before.spelling.filter(r=>r.suite==='holdout-error')),normal:count(before.spelling.filter(r=>r.suite==='holdout-normal'))},after:{errors:count(after.spelling.filter(r=>r.suite==='holdout-error')),normal:count(after.spelling.filter(r=>r.suite==='holdout-normal'))}},
 previous:{before:{errors:count(old.spelling.filter(r=>/^s/.test(r.id)&&r.expected!==null)),normal:count(old.spelling.filter(r=>r.normal))},after:{errors:count(after.spelling.filter(r=>r.suite==='previous'&&/^s/.test(r.id)&&r.expected!==null)),normal:count(after.spelling.filter(r=>r.suite==='previous'&&r.normal))}},
 paragraph:{before:paragraph(oldParagraph),after:paragraph(after.paragraph)},
 unseen:{errors:count(unseen.spelling.filter(r=>r.suite==='holdout-error')),normal:count(unseen.spelling.filter(r=>r.suite==='holdout-normal')),stats:aggregate(unseen.spelling),remaining:unseen.spelling.filter(r=>r.exact===false).map(r=>({text:r.text,expected:r.expected,actual:r.actual})),corpusHash:unseen.corpusHash},
 documents:after.documents.map(r=>({id:r.id,exact:r.exact,correctLevels:r.correctLevels,requiredLevels:r.requiredLevels,wrongLevels:r.wrongLevels,stats:r.structure.stats})),
 inference:{beforeHoldout:aggregate(before.spelling),after:aggregate([...after.spelling,after.paragraph,...after.documents.flatMap(r=>r.checked)])},
 remaining:after.spelling.filter(r=>r.exact===false).map(r=>({id:r.id,text:r.text,expected:r.expected,actual:r.actual})),
 semanticContradiction:after.spelling.filter(r=>r.semanticContradiction).map(r=>({id:r.id,proposals:r.aiIssues.length,actual:r.actual})),
 limitations:['Small synthetic corpus, not general accuracy.','At most one free-form suggestion or three contextual candidates per chunk; multiple basic rules can also apply.','Contextual candidates cover selected patterns only; no guarantee of all grammatical or factual errors.','Same-model rechecking is not an independent expert review.']
};
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2));
fs.writeFileSync('docs/HARNESS-QUALITY-1.5.1.json',JSON.stringify(summary,null,2));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=rows=>`${rows.correct}/${rows.total}`;
const metric=(name,a,b)=>`<tr><th>${name}</th><td>${a}</td><td>${b}</td></tr>`;
const rows=[...after.spelling.filter(r=>r.expected!==null),...unseen.spelling.map(r=>({...r,id:'최종-'+r.id}))].map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.text)}</td><td>${esc(Array.isArray(r.expected)?r.expected.join(' / '):r.expected)}</td><td>${esc(r.actual)}</td><td>${r.exact?'일치':'불일치'}</td></tr>`).join('');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>쎈Doc 1.5.1 실제 모델 검증</title><style>body{font:16px/1.7 sans-serif;margin:40px auto;max-width:1250px;padding:0 20px;color:#17212b}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{padding:10px;border:1px solid #cad2dc;text-align:left;vertical-align:top}th{background:#eff3f7}pre{white-space:pre-wrap;padding:18px;background:#f4f6f8}h1{font-size:28px}h2{margin-top:36px}</style><h1>쎈Doc 1.5.1 실제 모델 검증</h1><p>Qwen3 0.6B Q4_K_M · CPU · ${esc(summary.date)}. 입력과 기대 출력을 구현 전에 고정했습니다. 기본 규칙과 AI 제안을 모두 수락한 결과를 비교합니다. AI 제안은 앱에서 사용자 확인 후 적용합니다.</p><table><tr><th>항목</th><th>1.5.0</th><th>1.5.1</th></tr>${metric('새 오류 예문',label(summary.holdout.before.errors),label(summary.holdout.after.errors))}${metric('새 정상 예문 그대로 유지',label(summary.holdout.before.normal),label(summary.holdout.after.normal))}${metric('이전 오류 예문',label(summary.previous.before.errors),label(summary.previous.after.errors))}${metric('이전 정상 예문 그대로 유지',label(summary.previous.before.normal),label(summary.previous.after.normal))}${metric('연결 글 7개 오류',label(summary.paragraph.before),label(summary.paragraph.after))}</table><p>수정판 검사 구간: ${summary.inference.after.completed}/${summary.inference.after.total} 완료, 실패 ${summary.inference.after.failed}, 미검사 ${summary.inference.after.unprocessed}. 내용 모순 예문은 ${summary.semanticContradiction[0]?.proposals||0}건 제안했습니다. 제한된 합성 시험으로 일반 문서 정확도를 보장하지 않습니다. 맞춤법 AI는 구간마다 최대 한 곳을 제안하며, 여러 오류나 사실관계·의미 모순을 놓칠 수 있습니다.</p><h2>연결 글</h2><h3>원문</h3><pre>${esc(after.paragraph.text)}</pre><h3>실제 교정 결과</h3><pre>${esc(after.paragraph.actual)}</pre><h2>문장별 결과</h2><table><tr><th>ID</th><th>원문</th><th>기대 출력</th><th>실제 출력</th><th>판정</th></tr>${rows}</table><h2>공문</h2>${after.documents.map(d=>`<h3>${esc(d.title)} · ${d.exact?'기대 출력 일치':'불일치'}</h3><p>필요 단계 ${d.correctLevels}/${d.requiredLevels}, 잘못된 단계 ${d.wrongLevels.length}, 실패 ${d.structure.stats.failed}, 규칙으로 해결 ${d.structure.stats.resolvedByRules||0}, 보류 ${d.structure.stats.abstained}</p><pre>${esc(d.actual)}</pre>`).join('')}<p>전체 원시 응답과 실패 내역: 같은 폴더의 baseline.json, current.json. 입력 해시: ${summary.corpusHash}</p></html>`;
const finalCheck=`<h2>보완 후 별도 예문</h2><p>보완에 사용하지 않은 오류 12개·정상 12개를 마지막으로 검사했고, 이 출력에 맞추어 엔진을 조정하지 않았습니다. 오류 교정 ${label(summary.unseen.errors)}, 정상 유지 ${label(summary.unseen.normal)}, 추론 실패 ${summary.unseen.stats.failed}.</p><pre>${esc(JSON.stringify(summary.unseen.remaining,null,2))}</pre>`;
const finalHtml=html
 .replace('입력과 기대 출력을 구현 전에 고정했습니다.','첫 예문의 정답은 구현 전에 고정했지만 개발 중 결과를 확인했으므로 회귀 시험으로 구분합니다. 마지막 별도 예문은 보완 후 고정하여 추가 검사했습니다.')
 .replace('맞춤법 AI는 구간마다 최대 한 곳을 제안하며','맞춤법 AI는 구간마다 자유 수정안 한 곳 또는 문맥 후보 최대 세 곳을 검토하며')
 .replace('<h2>연결 글</h2>',finalCheck+'<h2>연결 글</h2>');
fs.writeFileSync(path.join(root,'시험결과.html'),finalHtml);console.log(JSON.stringify(summary,null,2));
