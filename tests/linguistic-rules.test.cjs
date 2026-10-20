'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {scan}=require('../src/checker.cjs'),{apply}=require('../src/rules/rule-engine.cjs');
const {scanLinguistic}=require('../src/rules/linguistic-rules.cjs');
test('productive ability and promise endings work without splitting nouns or names',()=>{
 for(const [text,expected] of [
  ['질문할수있으며 논의할수없습니다.','질문할 수 있으며 논의할 수 없습니다.'],
  ['지시를 따를수 있습니다.','지시를 따를 수 있습니다.'],
  ['문을 잠글께요. 김치를 담글께요.','문을 잠글게요. 김치를 담글게요.'],
  ['서류를 검토한후 연락해 주세요.','서류를 검토한 후 연락해 주세요.']
 ])assert.equal(apply(text,scan(text)),expected,text);
 for(const text of ['실수 있어도 괜찮아요.','말수 없습니다.','김한후 선생님께 전달했습니다.','필수입니다.','실수있습니다.','말수없습니다.'])
  assert.deepEqual(scanLinguistic(text),[],text);
});
test('spelling and spacing corrections compose without losing either edit',()=>{
 for(const [text,expected] of [
  ['성과를 얻을꺼예요.','성과를 얻을 거예요.'],
  ['몇일동안 준비했습니다.','며칠 동안 준비했습니다.'],
  ['감기가 낳기를 바랍니다.','감기가 낫기를 바랍니다.'],
  ['계획을 세우는대 시간이 들었습니다.','계획을 세우는 데 시간이 들었습니다.'],
  ['업무를 마친후 보고드림니다.','업무를 마친 후 보고드립니다.'],
  ['문제가 들어났고 행사를 치루었습니다.','문제가 드러났고 행사를 치렀습니다.'],
  ['여기에 있읍니다.','여기에 있습니다.']
 ]){
  const issues=scan(text);assert.equal(apply(text,issues),expected,text);
  const ordered=issues.toSorted((a,b)=>a.start-b.start);
  for(let i=1;i<ordered.length;i++)assert.ok(ordered[i-1].end<=ordered[i].start);
 }
});
test('contextual spelling checks preserve childbirth, reported speech and quoted errors',()=>{
 for(const text of ['아기를 낳기를 바랍니다.','그는 행사 준비를 돕는대요.','병을 낳는 원인을 찾았습니다.','날것을 먹지 마세요.','“감기가 낳기를 바랍니다.”라고 적었습니다.','우리의 목적은 학생들이 책을 읽습니다.'])
  assert.deepEqual(scanLinguistic(text),[],text);
});
test('endings and elapsed-time forms generalize beyond whole-sentence examples',()=>{
 for(const [a,b] of [
  ['해결했슴니까?','해결했습니까?'],['없슴니다.','없습니다.'],['문제를 풀께요.','문제를 풀게요.'],
  ['사진을 옮길께요.','사진을 옮길게요.'],['전학을 간지 나흘이 지났습니다.','전학을 간 지 나흘이 지났습니다.'],
  ['고향을 떠난지 열흘이 넘었습니다.','고향을 떠난 지 열흘이 넘었습니다.'],
  ['아직 않 제출했습니다.','아직 안 제출했습니다.'],['성과를 거두웠다.','성과를 거두었다.']
 ])assert.equal(apply(a,scan(a)),b,a);
});
test('normal noun/particle, negation and question endings are retained',()=>{
 for(const text of ['아들께요.','딸께요.','선생님께요.','그분들께요.','함께요.','말씀입니다.','먹지 않습니다.','생각을 않는다.','어디에 갔는지 나흘 동안 알아봤습니다.','한지 두 장을 샀습니다.','오렌지 두 개를 샀습니다.'])
  assert.deepEqual(scanLinguistic(text),[],text);
});
test('quotes, code and addresses are protected across basic and linguistic rules',()=>{
 const text='“됬어요. 낼께요.”와 `했슴니다`를 인용했습니다. 밖에서는 않 먹었습니다. https://example.org/됬어요';
 const actual=apply(text,scan(text));assert.equal(actual,text.replace('않 먹','안 먹'));
});
test('contextual rules are labelled as rules, with evidence, and excluded from bulk apply',()=>{
 const text='않 나갔습니다. 끝난지 사흘입니다. 낼께요.',issues=scan(text);
 assert.equal(issues.length,3);assert.ok(issues.every(i=>i.source==='rule'&&!i.auto&&i.evidence.source.startsWith('https://')));
 assert.equal(apply(text,issues,{all:true}),text);
});
test('all repeated occurrences use original offsets including emoji',()=>{
 const text='😀 않 먹고 않 읽었습니다. 끝난지 이틀입니다.';
 const issues=scan(text);assert.equal(issues.length,3);
 for(const i of issues)assert.equal(text.slice(i.start,i.end),i.original);
 assert.equal(apply(text,issues),'😀 안 먹고 안 읽었습니다. 끝난 지 이틀입니다.');
});
