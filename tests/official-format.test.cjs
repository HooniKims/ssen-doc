'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {formatText,formatRows,parseItem,marker}=require('../src/official-format.cjs');
const {officialRows,applyEdits}=require('../modules/review/src/document-edit.cjs');
const {parseDocument,xml}=require('../modules/review/src/documents.cjs');
const {zipSync,unzipSync,strToU8,strFromU8}=require('fflate');
const input='1. 운영 계획\n  1) 대상\n  2) 일정\n2. 세부 내용\n  3) 준비물\n  4) 유의 사항';
const expected='1. 운영 계획\n  가. 대상\n  나. 일정\n2. 세부 내용\n  가. 준비물\n  나. 유의 사항';
test('explicit hierarchy repairs symbols, gaps and child restarts without rewriting body',()=>{
 const r=formatText(input);assert.equal(r.text,expected);assert.equal(r.changed,4);assert.equal(formatText(r.text).changed,0);
 assert.equal(formatText('3. 제목\n가. 가항\n다. 나항\n3. 다음\n나. 첫항').text,'1. 제목\n  가. 가항\n  나. 나항\n2. 다음\n  가. 첫항');
});
test('all eight levels, Korean overflow and counters above nine',()=>{
 const text='1. A\n가. B\n1) C\n가) D\n(1) E\n(가) F\n① G\n㉮ H';
 assert.deepEqual(formatText(text).rows.map(r=>r.level),[1,2,3,4,5,6,7,8]);
 assert.equal(marker(2,15),'거.');assert.equal(marker(1,12),'12.');assert.throws(()=>marker(8,15),/범위/);
});
test('dates, decimals, money, references, text and bullets are preserved',()=>{
 for(const text of ['2026. 10. 20. 시행','1.5배 증가','3.14 원주율','1. 2. 회의','제1조(목적)','붙임 1. 안내문','100,000원','일반 문장','- 항목','나무. 내용'])assert.equal(formatText(text).text,text);
 assert.equal(parseItem('1.운영').body,'운영');assert.match(formatText('- 대상').rows[0].reason,/명확하지/);
});
test('ambiguous indent and orphan levels need explicit selection',()=>{
 const r=formatText('1. 제목\n   1) 대상\n1) 상위 없음');assert.ok(r.rows[1].reason);assert.ok(r.rows[2].reason);
 assert.equal(formatText('1. 제목\n   1) 대상',{'1':2}).text,'1. 제목\n  가. 대상');
 assert.equal(formatText(input,{'1':null}).rows[1].changed,false);
 assert.throws(()=>formatText(input,{'1':9}),/단계/);
});
test('line endings and literal markup survive',()=>{
 const text='1. 제목\r\n  3) <태그> & 값\r\n';assert.equal(formatText(text).text,'1. 제목\r\n  가. <태그> & 값\r\n');
});
const {fixture,style}=require('./fixtures/official.cjs');
test('HWPX applies paragraph styles, preserves source and unrelated parts, and is idempotent',()=>{
 const bytes=fixture(),original=Buffer.from(bytes),r=formatRows(officialRows(bytes,'a.hwpx')),blocks=parseDocument(bytes,'a.hwpx').blocks;
 const result=applyEdits(bytes,'a.hwpx',r.rows.filter(r=>r.changed).map(r=>({source:blocks[r.index].source,text:r.after,format:r.format})));
 assert.deepEqual(bytes,original);const before=unzipSync(bytes),after=unzipSync(result.buffer);
 assert.deepEqual(before['BinData/picture.png'],after['BinData/picture.png']);
 const header=strFromU8(after['Contents/header.xml']);assert.ok(header.includes(style(0)));assert.match(header,/itemCnt="3"/);
 assert.match(header,/<hc:left value="3000"/);assert.match(header,/<hc:intent value="-2000"/);
 const section=strFromU8(after['Contents/section0.xml']);assert.equal((section.match(/<hp:linesegarray>/g)||[]).length,1);assert.match(section,/<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>수정하지 않는 본문/);
 for(const [name,value] of Object.entries(after))if(name.endsWith('.xml'))assert.doesNotThrow(()=>xml(value));
 assert.equal(formatRows(officialRows(result.buffer,'a.hwpx')).changed,0);
 assert.deepEqual(parseDocument(result.buffer,'a.hwpx').blocks.slice(0,6).map(b=>b.text),expected.split('\n').map(s=>s.trim()));
});
test('malformed native numbering is excluded; edited marker cannot silently mismatch saved formatting',()=>{
 const bytes=fixture(),parts=unzipSync(bytes);parts['Contents/header.xml']=strToU8(strFromU8(parts['Contents/header.xml']).replace('type="NONE"','type="NUMBER"'));
 assert.equal(formatRows(officialRows(Buffer.from(zipSync(parts)),'a.hwpx')).changed,0);
 assert.match(officialRows(Buffer.from(zipSync(parts)),'a.hwpx')[0].reason,/자동 번호/);
 const source=parseDocument(bytes,'a.hwpx').blocks[0].source;
 assert.throws(()=>applyEdits(bytes,'a.hwpx',[{source,text:'가. 변경',format:{level:1,token:'1.'}}]),/다시 실행/);
});
test('first paragraph section metadata survives formatting verbatim',()=>{
 const parts=unzipSync(fixture()),metadata='<hp:secPr><hp:pagePr width="59528" height="84186"/></hp:secPr>';
 parts['Contents/section0.xml']=strToU8(strFromU8(parts['Contents/section0.xml']).replace('<hp:t>',metadata+'<hp:t>'));
 const bytes=Buffer.from(zipSync(parts)),rows=formatRows(officialRows(bytes,'a.hwpx')).rows,blocks=parseDocument(bytes,'a.hwpx').blocks;
 assert.equal(rows[0].reason,'');
 const result=applyEdits(bytes,'a.hwpx',rows.filter(r=>r.changed).map(r=>({source:blocks[r.index].source,text:r.after,format:r.format})));
 assert.ok(strFromU8(unzipSync(result.buffer)['Contents/section0.xml']).includes(metadata));
});
