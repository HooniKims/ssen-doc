'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{scan,apply}=require('../src/rules/rule-engine.cjs'),{Dictionary}=require('../src/dictionary/spell-suggest.cjs');
const text='학부모님께 안내드립니다. 내일 체험학습에 참여할수있습니다. 준비물을 꼼꼼이 확인해 주세요. 회의가 됬어요. 왠지 기분이 좋습니다. 깍두기를 담갔어요.\n'.repeat(20);
const start=performance.now(),dict=new Dictionary(),issues=scan(text);const unknown=dict.scan(text,issues);const output=apply(text,issues,{all:true}),milliseconds=performance.now()-start;assert.ok(output.includes('참여할 수 있습니다.'));assert.ok(output.includes('회의가 됐어요.'));assert.ok(milliseconds<3000);
const report={date:new Date().toISOString(),characters:text.length,ruleIssues:issues.length,dictionaryIssues:unknown.length,milliseconds,scope:'cold dictionary load + rules + dictionary + apply; excludes UI interaction'};fs.writeFileSync('docs/PERFORMANCE.json',JSON.stringify(report,null,2));console.log(report);
