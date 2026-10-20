'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('_workspace/quality95');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
const finalNames=['round4','fresh-a4','fresh-b2','fresh-c2'],final=finalNames.map(read);
if(final.some(r=>!r.completed||!r.passed))throw Error('Every final corpus must pass.');
if(final.some(r=>!r.sourceUnchanged)||new Set(final.map(r=>r.source.sha256)).size!==1)throw Error('All final runs must use the same unchanged source.');
const historyNames=['baseline','round1','fresh-a1','round2','fresh-a2','fresh-b1',...finalNames],history=historyNames.map(read);
const {apply}=require('../src/rules/rule-engine.cjs');
const exact=(expected,actual)=>Array.isArray(expected)?expected.includes(actual):expected===actual;
const total=final.flatMap(r=>r.cases);
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const log=file=>{const b=fs.readFileSync(file);return b[0]===255&&b[1]===254?b.toString('utf16le').slice(1):b.toString('utf8');};
const unitLog=log('_workspace/quality95-unit-final2.log'),unit=Number(unitLog.match(/ℹ tests (\d+)/)?.[1]);
assert.ok(unit>=680);assert.match(unitLog,new RegExp(`ℹ pass ${unit}\\b`));assert.match(unitLog,/ℹ fail 0\b/);
const uiCount=file=>{const text=log(file);assert.ok(!/^\s*[1-9]\d* failed\b/m.test(text));const count=Number(text.match(/(\d+) passed\b/)?.[1]);assert.ok(count>0);return count;};
const sourceUI=uiCount('_workspace/quality95-ui-source-final.log')+uiCount('_workspace/quality95-ui-compound-final.log');
const packagedUI=uiCount('_workspace/quality95-ui-packaged.log');assert.equal(sourceUI,29);assert.equal(packagedUI,29);
const pkg=json('docs/PACKAGE-VERIFICATION.json'),production=json('docs/PACKAGED-UI-VERIFICATION.json'),imported=json('docs/MODEL-IMPORT-PACKAGED.json'),smoke=json('docs/AI-VERIFICATION.json');
assert.equal(pkg.version,require('../package.json').version);assert.equal(production.version,pkg.version);
assert.equal(imported.packaged,true);assert.ok(new Date(imported.completed)>new Date(pkg.date));
assert.ok(imported.checks.some(c=>c.cpuInferenceNotice?.includes('실패 0 · 미검사 0')));
assert.ok(smoke.results.length===3&&smoke.results.every(r=>!r.stats.failed&&!r.stats.unprocessed));
for(const a of pkg.artifacts)assert.equal(fs.statSync(path.join('release',pkg.version,a.name)).size,a.bytes);
assert.equal(read('hwpx/structure-verification').status,'PASS');
for(const name of ['notice','native','table'])assert.match(log(path.join(root,'hwpx',name+'-validation.log')),/All structural checks passed/);
const result={version:require('../package.json').version,date:new Date().toISOString(),passed:true,
 scope:'Fixed practical synthetic Korean school/work examples; rule + real Qwen3 0.6B CPU inference, with all offered edits accepted; not general Korean accuracy or AI-only accuracy.',
 score:100*total.filter(c=>c.exact).length/total.length,total:total.length,correct:total.filter(c=>c.exact).length,
 sourceHash:final[0].source.sha256,
 interruptedEvaluations:read('infrastructure-interruptions'),
 normalChanges:final.reduce((n,r)=>n+r.summary.normalChanges,0),failedChunks:final.reduce((n,r)=>n+r.summary.failedChunks,0),
 errors:total.filter(c=>c.kind==='error'||c.kind==='paragraph').length,
 errorsCorrect:total.filter(c=>(c.kind==='error'||c.kind==='paragraph')&&c.exact).length,
 documents:total.filter(c=>c.kind==='document').length,
 modelContributedExact:total.filter(c=>c.kind!=='document'&&c.exact&&!exact(c.expected,apply(c.text,c.basic))).length,
 history:history.map((r,i)=>({name:historyNames[i],hash:r.corpusHash,passed:r.passed,...r.summary})),
 remaining:total.filter(c=>!c.exact).map(c=>({id:c.id,text:c.text,expected:c.expected,actual:c.actual})),
 externalGates:{hwpx:read('hwpx/hancom-roundtrip'),hancom:read('hwpx/hancom-open-save')}
};
assert.ok(result.externalGates.hancom.every(r=>r.registered&&r.opened&&r.saved&&r.sourcePreserved));
assert.ok(result.externalGates.hwpx.cases.every(r=>r.textPreserved&&r.cellPositionsPreserved&&r.allNativeStandard&&!r.changedOnReinspection));
assert.ok(result.interruptedEvaluations.reports.every(r=>r.sourceHash===result.sourceHash));
const verification={version:result.version,date:result.date,passed:true,unit,sourceUI,packagedUI,quality:result,
 package:pkg,production,modelImport:imported,realModelSmoke:smoke,structure:read('hwpx/structure-verification'),
 visualReview:'Inspected Hancom-rendered notice, native-numbering and table PNG previews; no broken text or list layout.',
 scope:'Local installer prepared and tested. Existing user installation, real account login, model network download and public release are not part of this run.'};
fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(verification,null,2));
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(result,null,2));
fs.writeFileSync('docs/QUALITY95-1.5.2.json',JSON.stringify(result,null,2));
fs.writeFileSync('docs/RELEASE-1.5.2.md',`# 1.5.2 — 실제 모델 95점 기준 통과

어미·의존 명사·문장 호응의 누락을 보완하고, 겹치는 맞춤법·띄어쓰기를 함께 적용합니다. 인용문·코드·주소는 보호하며, 문맥 판단이 필요한 제안은 개별 확인 후 적용합니다. 규칙 결과를 AI 결과로 표시하지 않습니다.

최종 고정 예시 ${result.total}건 중 ${result.correct}건 완전 일치, **${result.score.toFixed(2)}점**입니다. 오류 문장·문단 ${result.errorsCorrect}/${result.errors}건, 정상 문장 오수정 ${result.normalChanges}건, 공문 ${result.documents}건 통과, 추론 실패·미검사 ${result.failedChunks}건입니다.

학교·업무 상황을 재현해 직접 작성한 합성 예문을 실제 Qwen3 0.6B Q4_K_M CPU 모델로 검사했습니다. 사용자 제공 실문서 평가, 일반 한국어 전체의 정확도, AI 단독 점수가 아닙니다. 모든 제안을 수락했을 때의 규칙+AI 통합 결과입니다.

| 최종 세트 | 전체 점수 | 오류·문단 완전 교정 | 정상 오수정 | 공문 |
|---|---:|---:|---:|---:|
${final.map((r,i)=>`| ${finalNames[i]} | ${r.summary.score.toFixed(2)} | ${r.summary.errors.correct}/${r.summary.errors.total} | ${r.summary.normalChanges} | ${r.summary.documents.correct}/${r.summary.documents.total} |`).join('\n')}

기존 110개 기준 수정 전 82.73점에서 개선했습니다. 첫 신규 A는 77.78점, 신규 B는 전체 96.67점이지만 오류 교정률 94.44%로 탈락했습니다. 실패를 삭제하거나 정답을 바꾸지 않고 회귀 세트에 남겼습니다. 이후 별도 C 60개는 제품 코드 추가 튜닝 없이 통과했습니다.

병렬 추론·설치 파일 압축 중 시간 초과가 발생한 실행은 통과로 처리하지 않았습니다. 원시 결과와 중단 사유를 보존하고, 제품 코드·30초 제한을 바꾸지 않은 채 순차 재검증했습니다. 최종 네 세트의 소스 SHA-256은 모두 \`${result.sourceHash}\`입니다.

남은 누락 ${result.remaining.length}건:

${result.remaining.length?result.remaining.map(r=>`- ${r.text} → 실제: ${r.actual}`).join('\n'):'- 없음(이번 고정 평가 범위).'}

코드 ${unit}개, 소스 화면 ${sourceUI}개, 배포본 화면 ${packagedUI}개 통과. 화면 시험은 모의 인증·추론을 사용하며 실제 모델 품질 시험과 구분합니다. 실제 배포 EXE, 모델 직접 지정·SHA-256·CPU 추론·삭제, 소스 대비 ${pkg.checkedFiles}개 파일 일치도 확인했습니다.

HWPX 공문 8문단, 자동 번호 6문단, 표 셀 위치·내용 보존을 한글 열기·재저장으로 확인했습니다. 파일 접근 모듈 등록에 성공했고, 원본 보존 및 재검사 변경 0건입니다. 원시 공문 구조 검사와 실제 렌더 미리보기 확인도 통과했습니다. 필드·개체 등 보호 대상 문단은 기존 제한을 유지합니다.

설치 파일은 \`release/1.5.2/SsenDoc-Setup-1.5.2.exe\`, 상세 보고서는 \`_workspace/quality95/시험결과.html\`, 기계 판정 기록은 \`_workspace/quality95/verification.json\`입니다. 기존 설치판 교체나 공개 게시를 수행한 결과는 아닙니다.
`);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={baseline:'수정 전',round1:'첫 수정','fresh-a1':'새 예시 A 첫 평가',round2:'두 번째 수정 · 부하로 시간 초과','fresh-a2':'예시 A 두 번째 평가','fresh-b1':'새 예시 B 첫 평가',round4:'최종 회귀 110개','fresh-a4':'최종 회귀 A 54개','fresh-b2':'최종 회귀 B 60개','fresh-c2':'별도 예시 C 60개 · 단독 추론'};
const rows=history.map((r,i)=>`<tr><td>${names[historyNames[i]]}</td><td>${r.cases.length}</td><td>${r.summary.score.toFixed(2)}</td><td>${r.summary.errors.correct}/${r.summary.errors.total}</td><td>${r.summary.normalChanges}</td><td>${r.summary.failedChunks}</td><td>${r.passed?'통과':'미통과'}</td></tr>`).join('');
const details=final.map((r,j)=>`<h2>${names[finalNames[j]]} · ${r.summary.score.toFixed(2)}점</h2><p>입력 SHA-256: <code>${r.corpusHash}</code></p>${r.cases.map(c=>`<details ${!c.exact?'open':''}><summary class="${c.exact?'ok':'miss'}">${c.exact?'통과':'미교정'} · ${esc(c.id)} · ${esc(c.text.slice(0,75))}</summary><p>원문</p><pre>${esc(c.text)}</pre><p>실제 결과</p><pre>${esc(c.actual)}</pre><p>기대 결과</p><pre>${esc(Array.isArray(c.expected)?c.expected.join('\n또는\n'):c.expected)}</pre><p>규칙 제안 ${c.basic.length}개 · AI 제안 ${c.aiIssues.length}개 · ${(c.milliseconds/1000).toFixed(1)}초</p></details>`).join('')}`).join('');
fs.writeFileSync(path.join(root,'시험결과.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>쎈Doc 1.5.2 실제 모델 검증</title><style>body{max-width:1080px;margin:48px auto;padding:0 24px;font:16px/1.65 "Malgun Gothic",sans-serif;color:#183334;background:#fafbf9}h1{font-size:30px}h2{margin-top:40px}.score{font-size:42px;font-weight:700}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccd7d1;padding:10px;text-align:left}pre{white-space:pre-wrap;background:#eef2ef;padding:15px}code{overflow-wrap:anywhere}details{border-bottom:1px solid #d4ddd7;padding:12px 0}summary{cursor:pointer}.ok{color:#12613d}.miss{color:#a02e26}a{color:#12613d}</style><h1>쎈Doc 1.5.2 · 실제 로컬 모델 검증</h1><p class="score">${result.score.toFixed(2)} / 100 · 통과</p><p>최종 ${result.total}건 중 ${result.correct}건 완전 일치. 오류 문장·문단 ${result.errorsCorrect}/${result.errors}건, 정상 문장 오수정 ${result.normalChanges}건, 추론 실패·미검사 ${result.failedChunks}건.</p><p>학교·업무 상황을 재현해 새로 작성한 합성 예문입니다. 실제 사용자 문서를 수집한 시험은 아닙니다. Qwen3 0.6B Q4_K_M을 이 PC의 CPU에서 실행했습니다. 모든 제안을 사용자가 수락했을 때의 규칙+AI 통합 결과이며, 일반 한국어 전체의 정확도나 AI 단독 점수를 뜻하지 않습니다.</p><p>전체 문장 일치 95점 이상, 오류 교정률 95% 이상, 정상 오수정 0건, 공문 100%, 추론 실패 0건을 고정 기준으로 적용했습니다. 새 예시 A와 B에서 실패한 결과도 남겼습니다. 이를 수정한 뒤 별도 새 예시 C 60건을 고정해 추가 검증했습니다. 병렬 CPU 추론과 설치 파일 압축이 겹친 실행에서는 시간 초과가 발생하여 통과 처리하지 않았습니다. 부분 결과는 infrastructure-interruptions.json 및 원시 JSON에 보존했습니다. 이후 제품 코드를 바꾸지 않고 추론을 한 번에 하나씩 재실행했습니다.</p><table><thead><tr><th>시험</th><th>건수</th><th>점수</th><th>오류 완전 교정</th><th>정상 오수정</th><th>추론 실패</th><th>판정</th></tr></thead><tbody>${rows}</tbody></table><p>규칙만으로는 기대 출력에 도달하지 못하고 실제 AI 제안이 기여한 최종 통과 사례는 ${result.modelContributedExact}건입니다. AI로 표시한 결과에 규칙 교정은 포함하지 않았습니다.</p><h2>한글 파일 확인</h2><img src="hwpx/공문-preview.png" alt="한글에서 재저장한 실제 공문 미리보기" style="max-width:420px;width:100%;border:1px solid #ccd7d1"><p>공문 본문·자동 번호·표 셀의 세 파일을 한글에서 실제로 열고 재저장했습니다. 파일 접근 모듈 등록 성공, 원본 보존, 본문과 자동 번호 유지, 재검사 변경 0건을 확인했습니다.</p><p><a href="hwpx/공문_오류포함.hwpx">오류가 포함된 공문</a> · <a href="hwpx/공문_교정결과-resaved.hwpx">교정한 공문</a> · <a href="hwpx/native-corrected-resaved.hwpx">자동 번호</a> · <a href="hwpx/table-corrected-resaved.hwpx">표 예시</a></p>${details}</html>`);
console.log({score:result.score,total:result.total,correct:result.correct,remaining:result.remaining,modelContributedExact:result.modelContributedExact});
