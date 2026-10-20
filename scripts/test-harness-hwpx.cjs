'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {officialRows,applyEdits}=require('../modules/review/src/document-edit.cjs'),{parseDocument}=require('../modules/review/src/documents.cjs'),{formatRows}=require('../src/official-format.cjs');
const root=path.resolve(process.argv.find(v=>v.startsWith('--root='))?.slice(7)||'_workspace/harness-quality-1.5.1');
fs.mkdirSync(root,{recursive:true});
if(!process.argv.includes('--verify')){
 for(const kind of ['native','table']){
  const file=`_workspace/${kind}-source.hwpx`,source=fs.readFileSync(file),rows=officialRows(source,file);
  const blocks=parseDocument(source,file).blocks.flatMap(b=>b.cells||[b]).filter(b=>b.text),result=formatRows(rows),group=new Map();
  for(const row of result.rows.filter(r=>r.changed)){
   if(!group.has(row.blockIndex))group.set(row.blockIndex,{source:blocks[row.blockIndex].source,lines:row.original.split('\n'),format:[]});
   const g=group.get(row.blockIndex);g.lines[row.paragraph]=row.after;g.format.push(row.format);
  }
  const output=applyEdits(source,file,[...group.values()].map(g=>({...g,text:g.lines.join('\n')}))).buffer;
  fs.writeFileSync(path.join(root,`${kind}-corrected.hwpx`),output);
  assert.equal(formatRows(officialRows(output,file)).changed,0);assert.deepEqual(fs.readFileSync(file),source);
 }
 console.log('Generated native and table correction samples.');
}else{
 const cases=[];
 for(const name of ['공문_교정결과','native-corrected','table-corrected']){
  const file=path.join(root,name+'.hwpx'),saved=path.join(root,name+'-resaved.hwpx');
  const before=officialRows(fs.readFileSync(file),file),after=officialRows(fs.readFileSync(saved),saved);
  const cells=p=>parseDocument(fs.readFileSync(p),p).blocks.flatMap(b=>b.cells||[]).map(c=>({text:c.text,table:c.source.table,row:c.source.row,column:c.source.column}));
  const beforeCells=cells(file),afterCells=cells(saved);assert.deepEqual(afterCells,beforeCells);
  assert.deepEqual(after.map(r=>r.text),before.map(r=>r.text));assert.equal(formatRows(after).changed,0);
  assert.equal(after.filter(r=>r.native).length,before.filter(r=>r.native).length);
  assert.ok(after.filter(r=>r.native).every(r=>r.native.standard));
  cases.push({name,paragraphs:after.length,textPreserved:true,tableCells:afterCells.length,cellPositionsPreserved:true,nativeParagraphs:after.filter(r=>r.native).length,allNativeStandard:true,changedOnReinspection:0});
 }
 const report={version:require('../package.json').version,date:new Date().toISOString(),cases};
 fs.writeFileSync(path.join(root,'hancom-roundtrip.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(`docs/HANCOM-STRUCTURE-${report.version}.json`,JSON.stringify(report,null,2));console.log(report);
}
