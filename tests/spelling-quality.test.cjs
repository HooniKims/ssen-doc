'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {Worker}=require('node:worker_threads');
const {scan,apply}=require('../src/rules/rule-engine.cjs');
const {retrieve,database}=require('../src/knowledge/retrieve.cjs');
const {parseResponse,buildPrompt,minimalChange}=require('../src/ai/prompts.cjs');
const corpus=require('./fixtures/spelling-quality.cjs');
const {scan:check}=require('../src/checker.cjs');
for(const text of corpus.correct)test(`no unnecessary suggestions: ${text}`,()=>assert.deepEqual(check(text),[]));
for(const [text,expected] of corpus.errors)test(`retain correction: ${text}`,()=>assert.equal(apply(text,scan(text),{all:true}),expected));
test('text and document worker omit dictionary guesses and context reminders',async()=>{
 const worker=new Worker(path.resolve(__dirname,'../app/worker.cjs'));
 try{const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({id:1,action:'scan',data:{text:corpus.correct.join('\n')}});});assert.equal(result.ok,true);assert.deepEqual(result.issues,[]);}finally{await worker.terminate();}
});
test('retrieval returns only relevant references and retains local source metadata',()=>{
 assert.equal(retrieve('회신해 주세요.').some(r=>r.kind!=='protection'),false);
 assert.ok(retrieve('할수있습니다.').some(r=>r.id==='hangul-42'));
 assert.ok(retrieve('학생들이 만든 작품을 만들어보다.').some(r=>r.id==='hangul-47'));
 assert.equal(new Set(database.entries.map(e=>e.id)).size,database.entries.length);
 for(const entry of database.entries){assert.ok(new URL(entry.source).hostname.endsWith('korean.go.kr'));assert.ok(entry.exceptions);}
 const chunk={text:'내일 뵈요.',start:5},full='앞 문장\n내일 뵈요. 뒤 문장';
 const request=buildPrompt(chunk,full);assert.match(request.prompt,/앞 문장/);assert.match(request.prompt,/뒤 문장/);assert.ok(request.references.some(e=>e.id==='hangul-35'));
});
test('AI rejects invented, missing, unrelated references and stylistic rewrites',()=>{
 const parse=(original,suggestion,evidenceId)=>parseResponse({corrections:[{original,suggestion,evidenceId}]},original);
 assert.deepEqual(parse('됬어요','됐어요','invented'),[]);
 assert.deepEqual(parse('됬어요','됐어요',undefined),[]);
 assert.deepEqual(parse('됬어요','됐어요','hangul-42'),[]);
 assert.deepEqual(parse('되어 있습니다','돼 있습니다','hangul-35'),[]);
 assert.deepEqual(parse('회신해 주세요','확신해 주세요','hangul-35'),[]);
 assert.deepEqual(parse('선생님께 드릴게요','선생님게 드릴게요','hangul-53'),[]);
 assert.deepEqual(parse('만들어보다','만들어 보다','hangul-47'),[]);
 assert.deepEqual(parse('이 목표는 학생들이 정합니다.','이 목표는 학생들이 정하는 것입니다.','grammar-agreement'),[]);
 assert.deepEqual(parse('이 목표는 학생들이 실천합니다.','이 목표는 학생들이 실천하는 것입니다.','grammar-agreement'),[]);
 // An existing rule ID still cannot authorize an arbitrary change elsewhere in a sentence.
 assert.deepEqual(parse('내일 뵈요. 회신해 주세요.','내일 봬요. 확신해 주세요.','hangul-35'),[]);
});
test('AI minimal spans preserve text, offsets and grammar reason',()=>{
 for(const [original,suggestion,evidenceId] of [
  ['회의가 됬어요.','회의가 됐어요.','hangul-35'],
  ['할수있어요.','할 수 있어요.','hangul-42'],
  ['저의 목표는 학생들이 안전하게 귀가합니다.','저의 목표는 학생들이 안전하게 귀가하는 것입니다.','grammar-agreement']
 ]){const text='😀 '+original,issues=parseResponse({corrections:[{original,suggestion,evidenceId}]},original,3);assert.equal(issues.length,1);assert.equal(apply(text,issues),'😀 '+suggestion);assert.ok(issues[0].original.length<original.length);assert.ok(issues[0].evidence.source);assert.equal(issues[0].auto,false);}
 for(const [original,suggestion] of [['수있','수 있'],['할수','할 수'],['가 나','가나']]){const c=minimalChange(original,suggestion);assert.ok(c.original);assert.equal(original.slice(0,c.left)+c.suggestion+original.slice(c.left+c.original.length),suggestion);}
});
test('grouping preserves every occurrence; filters exclude hidden highlights and counts',async()=>{
 const {visibleIssues,groupIssues}=await import('../app/issue-view.mjs');
 const text='회의가 됬어요. 준비가 됬어요.',rules=scan(text);
 assert.equal(rules.length,2);assert.equal(groupIssues(rules).length,1);assert.equal(groupIssues(rules)[0].length,2);
 const ai={id:'ai-test',source:'ai',category:'문장 호응',original:'합니다',suggestion:'하는 것입니다'};
 const combined=[...rules,ai,{source:'dictionary',original:'회신해',suggestion:null}];
 assert.equal(visibleIssues(combined).length,3);assert.deepEqual(visibleIssues(combined,'grammar'),[ai]);assert.equal(visibleIssues(combined,'spelling').length,2);
});
test('structural grammar check suggests only supported patterns and never bulk-applies',()=>{
 const text='우리의 목표는 아이들이 건강하게 성장합니다.';
 const issues=check(text);assert.equal(issues.length,1);assert.equal(issues[0].source,'grammar');assert.equal(issues[0].category,'문장 호응');
 assert.equal(apply(text,issues,{all:true}),text);
 assert.equal(apply(text,issues),'우리의 목표는 아이들이 건강하게 성장하는 것입니다.');
 assert.deepEqual(check('저의 목표는 학생들이 안전하게 귀가하는 것입니다.'),[]);
 assert.deepEqual(check('저의 목표는 학생들이 실천합니다.'),[]);
 assert.deepEqual(check('저의 목표는 "학생들이 귀가합니다."라는 문장을 쓰는 것입니다.'),[]);
});
