'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {proposal,inspectChunk}=require('../src/ai/spelling-harness.cjs');
const {sentences}=require('../src/ai/prompts.cjs');
const {retrieve}=require('../src/knowledge/retrieve.cjs');
const {editCandidates}=require('../src/ai/edit-candidates.cjs');
const signal=()=>new AbortController().signal;
test('dates, decimals, email addresses and item prefixes stay intact with exact offsets',()=>{
 const text='1. 일정: 2026. 12. 3. 17:30입니다.\n  가. 비용은 1.5배입니다. 연락처는 office@example.org입니다. 다음입니다.';
 const chunks=sentences(text);
 assert.equal(chunks.length,4);
 assert.match(chunks[0].text,/2026\. 12\. 3\. 17:30/);
 assert.match(chunks[1].text,/가\. 비용은 1\.5배/);
 assert.match(chunks[2].text,/office@example.org/);
 for(const c of chunks)assert.equal(text.slice(c.start,c.start+c.text.length),c.text);
 const long='가'.repeat(239)+'😀'+'나'.repeat(300);
 for(const c of sentences(long)){assert.ok(c.text.length<=240);assert.ok(!/[\uD800-\uDBFF]$/.test(c.text));assert.equal(long.slice(c.start,c.start+c.text.length),c.text);}
});
test('code assigns evidence without trusting model-provided IDs',()=>{
 const text='할수있습니다.';
 const issue=proposal({corrections:[{original:text,suggestion:'할 수 있습니다.'}]},text,5,retrieve(text));
 assert.ok(issue.evidence);assert.equal(issue.auto,false);assert.equal(issue.start,5);
 assert.throws(()=>proposal({corrections:[{original:text,suggestion:'할 수 있습니다.',evidenceId:'invented'}]},text,0,retrieve(text)));
});
test('invalid JSON retries once, then a valid edit is checked and returned at the source offset',async()=>{
 let calls=0;
 const r=await inspectChunk({text:'학교에 가요요.',start:3},'😀 학교에 가요요.',async q=>{
  if(q.schema.properties.confirmed)return {confirmed:true};
  return ++calls===1?'{"corrections":':{corrections:[{original:'가요요.',suggestion:'가요.'}]};
 },signal());
 assert.equal(calls,2);assert.equal(r.attempts,3);assert.equal(r.issues[0].start,7);assert.equal(r.issues[0].auto,false);
});
test('invalid output twice is a failure; runtime errors are not retried',async()=>{
 let calls=0;
 await assert.rejects(inspectChunk({text:'문장입니다.',start:0},'문장입니다.',async()=>{calls++;return 'bad';},signal()),/2회 실패/);
 assert.equal(calls,2);calls=0;
 await assert.rejects(inspectChunk({text:'문장입니다.',start:0},'문장입니다.',async()=>{calls++;throw Error('runtime stopped');},signal()),/runtime stopped/);
 assert.equal(calls,1);
});
test('numbers, ambiguous source spans and allowed auxiliary spacing are protected',()=>{
 for(const [original,suggestion] of [['24명이 참석합니다.','25명이 참석합니다.'],['확인해 주세요.','확인해주세요.']])
  assert.equal(proposal({corrections:[{original,suggestion}]},original,0,retrieve(original)),null);
 assert.throws(()=>proposal({corrections:[{original:'가요',suggestion:'와요'}]},'가요 가요',0,[]),/한 번/);
});
test('contextual candidates are withheld unless the model chooses them; normal forms do not trigger candidates',async()=>{
 const text='교사로써 학생들을 지도합니다.';
 assert.equal(editCandidates(text).length,1);
 const keep=await inspectChunk({text,start:0},text,async()=>({confirmed:false}),signal());
 assert.deepEqual(keep.issues,[]);
 const edit=await inspectChunk({text,start:0},text,async()=>({confirmed:true}),signal());
 assert.equal(edit.issues[0].suggestion,'교사로서');assert.equal(edit.issues[0].auto,false);
 assert.equal(edit.issues[0].evidence,undefined);
 for(const normal of ['먹지 않았습니다.','자료를 분석함으로써 해결했습니다.','언제 이사한지 모르겠습니다.','이번 연수의 목적은 분명합니다.','우리 목표는 학생들이 정합니다.'])
  assert.deepEqual(editCandidates(normal),[]);
});
test('each contextual candidate is judged in a complete sentence and only confirmed non-overlapping edits survive',async()=>{
 const text='교사로써 지도한지 두 달이 지났습니다.',seen=[];
 const r=await inspectChunk({text,start:0},text,async q=>{
  const data=JSON.parse(q.message);seen.push(data);assert.equal(data.원문,text);assert.ok(data.규칙);assert.ok(data.수정문.length>20);
  return {confirmed:seen.length===1};
 },signal());
 assert.equal(seen.length,2);assert.equal(r.issues.length,1);assert.equal(r.issues[0].suggestion,'교사로서');
});
