'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseDocument}=require('../modules/review/src/documents.cjs');
const {applyEdits,officialRows}=require('../modules/review/src/document-edit.cjs');
const {formatRows}=require('../src/official-format.cjs');
const {unzipSync,zipSync,strFromU8,strToU8}=require('fflate');
const root=path.resolve('_workspace/quality95/hwpx'),report=JSON.parse(fs.readFileSync('_workspace/quality95/fresh-b2.json','utf8'));
assert.ok(report.completed&&report.passed,'Complete the independent model evaluation first.');
const selected=['fresh-b-document-1','fresh-b-paragraph-2','fresh-b-error-16','fresh-b-error-29'].map(id=>report.cases.find(c=>c.id===id));
assert.ok(selected.every(c=>c?.exact));
const title='제목: 연구 발표회 및 연수 안내';
const before=[title,...selected.flatMap(c=>c.text.split('\n'))],after=[title,...selected.flatMap(c=>c.actual.split('\n'))];
const template='_workspace/practical-quality-1.5.0/template.hwpx',source=fs.readFileSync(template),blocks=parseDocument(source,template).blocks;
assert.equal(before.length,blocks.length);
// Fixture authoring only: the template title contains a protected control.
// Seed the already-correct title without altering its XML structure. The tested
// app must preserve this paragraph; all correction edits use its normal API.
const files=unzipSync(source),part=blocks[0].source.part,xml=strFromU8(files[part]);
assert.equal(xml.split(blocks[0].text).length,2);
files[part]=strToU8(xml.replace(blocks[0].text,title));
const fixture=Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([n,b])=>[n,n==='mimetype'?[b,{level:0}]:b]))));
const edits=(lines,previous=blocks.map(b=>b.text))=>lines.flatMap((text,i)=>i&&text!==previous[i]?[{source:blocks[i].source,text}]:[]);
const seeded=applyEdits(fixture,template,edits(before)).buffer;
const spelled=applyEdits(seeded,template,edits(after,before)).buffer;
const formatted=formatRows(officialRows(spelled,template));
const output=applyEdits(spelled,template,formatted.rows.filter(r=>r.changed).map(r=>({source:blocks[r.blockIndex].source,text:r.after,format:r.format}))).buffer;
const actual=officialRows(output,template);
assert.equal(formatRows(actual).changed,0);
assert.deepEqual(actual.map(r=>r.text),after.map(line=>line.trimStart()));
assert.deepEqual(fs.readFileSync(template),source);
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'공문_오류포함.hwpx'),seeded);
fs.writeFileSync(path.join(root,'공문_교정결과.hwpx'),output);
const result={corpusHash:report.corpusHash,selected:selected.map(c=>c.id),before,actual:actual.map(r=>r.text),sourcePreserved:true,changedOnReinspection:0,exact:true};
fs.writeFileSync(path.join(root,'hwpx-result.json'),JSON.stringify(result,null,2));console.log(result);
