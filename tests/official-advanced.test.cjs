'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {officialRows,applyEdits}=require('../modules/review/src/document-edit.cjs');
const {parseDocument,xml}=require('../modules/review/src/documents.cjs');
const {formatRows}=require('../src/official-format.cjs');
const {advanced}=require('./fixtures/official-advanced.cjs');
const {unzipSync,strFromU8,strToU8,zipSync}=require('fflate');
function edits(bytes,result){
 const blocks=parseDocument(bytes,'a.hwpx').blocks.flatMap(b=>b.cells||[b]),groups=new Map();
 for(const row of result.rows.filter(r=>r.changed)){
  if(!groups.has(row.blockIndex))groups.set(row.blockIndex,{source:blocks[row.blockIndex].source,lines:row.original.split('\n'),format:[]});
  const g=groups.get(row.blockIndex);g.lines[row.paragraph]=row.after;g.format.push(row.format);
 }
 return [...groups.values()].map(g=>({source:g.source,text:g.lines.join('\n'),format:g.format}));
}
test('each table cell is an isolated list with stable paragraph addresses and untouched structure',()=>{
 const bytes=advanced(),rows=officialRows(bytes,'a.hwpx'),r=formatRows(rows);
 assert.deepEqual(r.rows.map(r=>r.index),['1:0','1:1','1:2','2:0','2:1']);
 const out=applyEdits(bytes,'a.hwpx',edits(bytes,r)).buffer;
 const blocks=parseDocument(out,'a.hwpx').blocks.flatMap(b=>b.cells||[b]);
 assert.equal(blocks[1].text,'1. 운영 계획 가. 대상 나. 일정');assert.equal(blocks[2].text,'1. 준비 계획 가. 준비물');
 assert.equal(formatRows(officialRows(out,'a.hwpx')).changed,0);
 const before=unzipSync(bytes),after=unzipSync(out);assert.deepEqual(before['BinData/picture.png'],after['BinData/picture.png']);
 assert.equal((strFromU8(after['Contents/section0.xml']).match(/<hp:cellSpan rowSpan="1" colSpan="1"\/>/g)||[]).length,2);
});
test('native lists retain body text and auto numbering with independent definitions per cell',()=>{
 const bytes=advanced({native:true}),r=formatRows(officialRows(bytes,'a.hwpx'));
 assert.equal(r.changed,5);assert.ok(r.rows.every(r=>r.after===r.before&&r.format.native));
 const out=applyEdits(bytes,'a.hwpx',edits(bytes,r)).buffer;
 assert.deepEqual(parseDocument(bytes,'a.hwpx').blocks.map(b=>b.text),parseDocument(out,'a.hwpx').blocks.map(b=>b.text));
 const parts=unzipSync(out),header=xml(parts['Contents/header.xml']);
 const definitions=Array.from(header.getElementsByTagNameNS('*','numbering'));assert.equal(definitions.length,3);
 assert.match(strFromU8(parts['Contents/header.xml']),/numFormat="HANGUL_SYLLABLE"/);
 assert.equal(formatRows(officialRows(out,'a.hwpx')).changed,0);
 assert.match(strFromU8(parts['Contents/section0.xml']),/<hp:t>대상<\/hp:t>/);
 assert.ok(!strFromU8(parts['Contents/section0.xml']).includes('가. 대상'));
});
test('partial native-list conversion is rejected instead of splitting continuation',()=>{
 const bytes=advanced({native:true}),r=formatRows(officialRows(bytes,'a.hwpx')),changes=edits(bytes,r);
 changes[0].format=changes[0].format.slice(0,1);
 assert.throws(()=>applyEdits(bytes,'a.hwpx',changes),/모든 문단/);
});
test('native level changes stay automatic and duplicate paragraph format locations are rejected',()=>{
 const bytes=advanced({native:true}),r=formatRows(officialRows(bytes,'a.hwpx'),{'1:2':3}),changes=edits(bytes,r);
 const out=applyEdits(bytes,'a.hwpx',changes).buffer;
 assert.equal(officialRows(out,'a.hwpx').find(r=>r.index==='1:2').native.level,3);
 changes[0].format.push(changes[0].format[0]);assert.throws(()=>applyEdits(bytes,'a.hwpx',changes),/개수|위치/);
});
module.exports={edits};
test('modern Hancom margins use the active case and preserve doubled legacy fallbacks',()=>{
 const parts=unzipSync(advanced());parts['Contents/header.xml']=strToU8(strFromU8(parts['Contents/header.xml']).replace('<hp:case>','<hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">'));
 const bytes=Buffer.from(zipSync(parts)),result=formatRows(officialRows(bytes,'a.hwpx')),out=applyEdits(bytes,'a.hwpx',edits(bytes,result)).buffer;
 const header=xml(unzipSync(out)['Contents/header.xml']),styles=Array.from(header.getElementsByTagNameNS('*','paraPr'));
 for(const style of styles.slice(1)){const left=Array.from(style.getElementsByTagNameNS('*','left')).map(n=>Number(n.getAttribute('value')));assert.equal(left[1],left[0]*2);}
 assert.equal(formatRows(officialRows(out,'a.hwpx')).changed,0);
});
