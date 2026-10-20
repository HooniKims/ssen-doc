'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {formatText,structureRows}=require('../src/official-format.cjs');
const {LocalAI}=require('../src/ai/local-ai.cjs');
const cases=[
 {id:'known-parent',text:'1. 현장체험학습 안내\n  - 대상: 3학년 학생\n  - 장소: 과학관',expected:{1:2,2:2}},
 {id:'siblings',text:'1. 행사 안내\n  가. 일시: 10월 20일\n  - 장소: 강당\n  - 준비물: 필기도구',expected:{2:2,3:2}},
 {id:'nested',text:'1. 운영 계획\n  가. 준비물\n    - 개인 준비물: 물통',expected:{2:3}},
 {id:'ambiguous',text:'- 참고 사항',expected:{},allowAbstain:true},
 {id:'semantic',text:'1. 행사 안내\n- 대상: 전교생\n- 장소: 강당',expected:{1:2,2:2},allowAbstain:true}
];
(async()=>{
 const report={version:require('../package.json').version,date:new Date().toISOString(),syntheticOnly:true,cases:[],ai:process.argv.includes('--ai')};
 assert.equal(formatText('1. 제목\n  4) 항목').text,'1. 제목\n  가. 항목');
 assert.equal(formatText('2026. 10. 20.\n1.5배').changed,0);
 if(report.ai){
  const catalog=require('../src/ai/models.json').models[0],file=path.resolve('_workspace/ai-verification/models',catalog.filename);await fs.access(file);
  const ai=new LocalAI();
  try{
   for(const c of cases){
    const input=structureRows(c.text.split('\n').map((text,index)=>({index,text,scope:'text'}))),start=Date.now();
    const result=await ai.reviewStructure(file,input,()=>{},{budgetMs:90000,maxJobs:6,...(process.argv.includes('--trace')?{onResponse:output=>console.log(output)}:{})});
    const correct=result.proposals.filter(p=>c.expected[p.index]===p.level).length;
    report.cases.push({id:c.id,milliseconds:Date.now()-start,expected:c.expected,...result,correct});
    console.log(JSON.stringify({case:c.id,correct,proposed:result.proposals.length,stats:result.stats}));
   }
  }finally{await ai.unload();if(ai.llama&&!ai.llama.disposed)await ai.llama.dispose();}
  report.proposed=report.cases.reduce((n,c)=>n+c.proposals.length,0);report.correct=report.cases.reduce((n,c)=>n+c.correct,0);
  report.requiredExpected=cases.reduce((n,c)=>n+Object.keys(c.expected).length,0);report.coverage=report.correct/report.requiredExpected;report.precision=report.proposed?report.correct/report.proposed:null;
 }
 await fs.mkdir('_workspace',{recursive:true});await fs.writeFile('_workspace/structure-quality.json',JSON.stringify(report,null,2));
 if(report.ai&&(report.correct<4||report.correct!==report.proposed||report.cases.some(c=>c.stats.failed||c.stats.unprocessed)))throw Error('구조 품질 기준 미달: 정확한 제안 4개 이상, 잘못된 제안 0개, 실패·미검토 0개 필요. _workspace/structure-quality.json 확인');
 console.log('Structure quality checks passed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
