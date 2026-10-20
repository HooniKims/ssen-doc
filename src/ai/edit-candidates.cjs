'use strict';
// Candidates are NOT corrections until the model checks the complete sentence.
function editCandidates(text){
 if(/["“”'‘’]/u.test(text))return [];
 const found=[],add=(original,suggestion,rule,reason=rule,start=text.indexOf(original))=>{if(original!==suggestion&&!found.some(c=>c.start===start&&c.original===original))found.push({original,suggestion,rule,reason,start});};
 for(const m of text.matchAll(/(?<![가-힣])않(?=\s+(?:갔|나갔|가[지면서요 ]|왔|오[지면서요 ]|했|하[지면서요 ]|먹|읽|쓰|보냈|받았))/gu))add(m[0],'안','본용언 앞 부정 부사는 안, -지 않다는 않이다.','뒤의 본용언을 부정하는 부사 안으로 고칩니다.',m.index);
 for(const m of text.matchAll(/(?:교사로써|학부모로써|부모로써|학생으로써|담당자로써|책임자로써|대표로써|시민으로써)/gu)){
  if(/지도|돕|도우|참여|책임|의무|역할|역활|맡은|최선/u.test(text))add(m[0],m[0].replace(/로써$/u,'로서'),'자격은 (으)로서, 수단은 (으)로써이다.','사람의 지위·자격을 나타내는 조사 (으)로서로 고칩니다.',m.index);
 }
 for(const m of text.matchAll(/([가-힣]+(?:한|온|간|본|된|은))지(?=\s+(?:(?:벌써|이미|약|거의)\s+)?(?:\d+|한|두|세|네|다섯|여섯|일|이|삼|사|오|육|칠|팔|구|십|몇)\s*(?:년|개월|달|주일|주|일|시간|분)(?:이|가|은|도|째|\s|[.!?]|$))/gu))add(m[0],m[1]+' 지','경과 시간을 나타내는 지는 의존 명사라 띄어 쓴다. 간접 의문 어미 지는 붙여 쓴다.','경과한 시간을 나타내는 의존 명사 지를 띄어 씁니다.',m.index);
 if(/^[\s\S]{0,50}의\s+(?:목표는|목적은|바람은)\s/u.test(text)){
  const endings={'높입니다':'높이는 것입니다','익힙니다':'익히는 것입니다','읽습니다':'읽는 것입니다','배웁니다':'배우는 것입니다','기릅니다':'기르는 것입니다','줄입니다':'줄이는 것입니다','합니다':'하는 것입니다'};
  for(const [before,after] of Object.entries(endings))if(new RegExp(before+'[.!?]?\\s*$','u').test(text)){
   if(before==='합니다'&&!/(?<![가-힣])(?:실천|노력|추진|공유|지원|개선|확보|달성|교육|운영)?합니다[.!?]?\s*$/u.test(text))continue;
   add(before,after,'목표·목적의 내용은 -는 것이다 형태로 호응한다. 다른 주어가 있는 정상 문장은 그대로 둔다.','목표·목적의 내용과 서술어가 호응하도록 고칩니다.',text.lastIndexOf(before));break;
  }
 }
 for(const m of text.matchAll(/[가-힣]+[을를]\s+((?:논의|검토|협의)되었습니다)/gu))add(m[1],m[1].replace('되었습니다','했습니다'),'논의·검토·협의되다는 피동사다. 목적어 을/를과 함께 쓸 때 능동형 했다로 고친다.','목적어와 피동 서술어의 충돌을 고칩니다.',m.index+m[0].length-m[1].length);
 return found.slice(0,3);
}
module.exports={editCandidates};
