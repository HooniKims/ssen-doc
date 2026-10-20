'use strict';
// Explicit spelling/morphology checks. These are rule results, never labelled AI.
const {protectedSpans,overlaps}=require('./protected-spans.cjs');
const {sentences}=require('../ai/prompts.cjs');
const finalConsonant=char=>(char.charCodeAt(0)-0xAC00)%28;
const sources={
 negation:'https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=5649&mn_id=217',
 elapsed:'https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=321640',
 norm:'https://www.korean.go.kr/kornorms/m/m_regltn.do',
 conjugation:'https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=16280'
};
function scanLinguistic(text){
 const ranges=protectedSpans(text),issues=[];
 const add=(id,start,original,suggestion,reason,source,auto=false,category='맞춤법')=>{
  const end=start+original.length;
  if(overlaps(ranges,start,end)||issues.some(i=>i.start<end&&i.end>start))return;
  issues.push({id:`linguistic-${id}:${start}`,ruleId:`linguistic-${id}`,start,end,original,suggestion,reason,category,source:'rule',auto,
   ...(source?{evidence:{id:`linguistic-${id}`,title:'국립국어원 규정·사전 참고',summary:reason,exceptions:'인용·코드·주소는 보존하며 문맥이 필요한 제안은 개별 확인합니다.',source,version:'1.5.2',reviewedAt:'2026-10-20'}}:{})});
 };
 for(const m of text.matchAll(/([가-힣])슴니([다까])(?=$|[\s.!?,])/gu)){
  const tail=finalConsonant(m[1]);
  if(tail!==0&&tail!==8)add('formal-ending',m.index,m[0],m[1]+'습니'+m[2],'받침 있는 어간 뒤의 종결 어미는 -습니다/-습니까로 적습니다.',sources.norm,true);
 }
 for(const m of text.matchAll(/([가-힣])읍니([다까])(?=$|[\s.!?,])/gu)){
  if([19,20,18].includes(finalConsonant(m[1])))add('old-formal-ending',m.index,m[0],m[1]+'습니'+m[2],'현행 표준어는 -읍니다가 아니라 -습니다입니다.',sources.norm,true);
 }
 for(const m of text.matchAll(/[함임림름심픔쁨]니[다까](?=$|[\s.!?,])/gu)){
  const corrected=String.fromCharCode(m[0].charCodeAt(0)+1)+m[0].slice(1);
  add('formal-bieup',m.index,m[0],corrected,'-ㅂ니다/-ㅂ니까를 쓸 때 어미의 받침은 ㅁ이 아니라 ㅂ입니다.',sources.norm,true);
 }
 for(const m of text.matchAll(/[가-힣]+께요(?=$|[\s.!?,])/gu)){
  const stem=m[0].slice(0,-2);
  // The ㄹ condition alone would corrupt noun + 께요 (아들께요, 딸께요).
  if(finalConsonant(stem.at(-1))!==8||!/(?:낼|질|쉴|살|빌|풀|열|만들|잠글|담글|맡길|옮길|드릴|보낼|줄|갈|올|할|볼|될|쓸|지킬|바꿀|나눌|거둘|[가-힣]+을)$/u.test(stem))continue;
  add('promise-ending',m.index,m[0],stem+'게요','의지·약속을 나타내는 어미 -ㄹ게요/-을게요는 예사소리로 적습니다.',sources.norm);
 }
 for(const m of text.matchAll(/거두웠/gu))add('geoduda',m.index,m[0],'거두었','거두다의 과거형은 거두었다(거뒀다)로 활용합니다.',sources.conjugation,true);
 for(const m of text.matchAll(/들어났|들어나는|들어나면|들어나다|들어나서|들어날/gu))add('reveal',m.index,m[0],m[0].replace('들어','드러'),'밝혀지거나 나타난다는 뜻의 표준어는 드러나다입니다.','https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=306000');
 for(const m of text.matchAll(/치루었|치뤘/gu))add('chireuda',m.index,m[0],'치렀','치르다에 과거 어미가 붙으면 치렀다로 활용합니다.',sources.norm,true);
 for(const m of text.matchAll(/(?<![가-힣])않(?=[ \t]+(?:나갔|나가|갔|먹|읽|했|하[지면서요 ]|보냈|보내|받|참석|참여|신청|제출|준비|출발|도착|봤|왔|오[지면서요 ]|가[지면서요 ]|듣|썼|쓰|움직|알려|이용|끝|시작|열|닫|배우|이해|되|좋|싫|기억|확인|생각))/gu)){
  add('negation',m.index,m[0],'안','본용언 앞에서 부정하는 부사는 안입니다. -지 않다의 어간 않-과 구분합니다.',sources.negation);
 }
 const duration=/^\s+(?:(?:벌써|이미|약|거의)\s+)?(?:(?:\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|일|이|삼|사|오|육|칠|팔|구|십|몇)\s*(?:년|개월|달|주일|주|일|시간|분)|하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|보름)(?=$|[\s이가은는도째쯤만입.!?])/u;
 for(const m of text.matchAll(/([가-힣]+)지/gu)){
  if(finalConsonant(m[1].at(-1))!==4)continue; // 관형형 -ㄴ/-은, including 온·간·끝난·먹은.
  const rest=text.slice(m.index+m[0].length),time=rest.match(duration);if(!time)continue;
  const tail=rest.slice(time[0].length).split(/[.!?\n]/u)[0];
  if(!/^\s*$|^(?:이|가|은|는|도|째|쯤)?\s*(?:지났|지나|되었|됐|된다|되면|됩니다|되었|흘렀|넘었|입니다|이다|만에)|^만에/u.test(tail))continue;
  add('elapsed-time',m.index,m[0],m[1]+' 지','경과한 시간 앞의 지는 의존 명사이므로 앞말과 띄어 씁니다.',sources.elapsed,false,'띄어쓰기');
 }
 for(const m of text.matchAll(/(?:며칠|몇일|하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|보름|\d+(?:일|시간|분))동안/gu)){
  add('duration-spacing',m.index+m[0].length-2,'동안',' 동안','기간 뒤에 쓰인 명사 동안은 앞말과 띄어 씁니다.',sources.norm,false,'띄어쓰기');
 }
 // Use bounded verb forms; an arbitrary word ending in 한 can be a person's name.
 for(const m of text.matchAll(/(?<![가-힣])((?:(?:작성|검토|확인|정리|준비|신청|참여|참가|완료|제출|접수|보고|종료|도착|출발|운영|논의|협의|처리|수정|수료|졸업|입학)?한|(?:준비|완료|처리|수정)?된|마친|보낸|돌아온|다녀온|나간|들어간|돌아간|지나간|끝난|열린|본|온|간|먹은|읽은|받은|앉은|놓은))후(?=$|[\s에부까로의.!?,])/gu)){
  add('after-spacing',m.index+m[1].length,'후',' 후','동작의 관형형 뒤에 쓰인 후는 앞말과 띄어 씁니다.',sources.norm,false,'띄어쓰기');
 }
 // Productive verb endings, not every syllable with ㄹ: preserve nouns such as 실수/말수.
 for(const m of text.matchAll(/([가-힣]*(?:할|될|갈|올|볼|쓸|줄|낼|둘|를)|[가-힣]+을)수[ \t]*(있|없)/gu)){
  add('ability-spacing',m.index,m[0],m[1]+' 수 '+m[2],'관형형 뒤의 의존 명사 수는 띄어 쓰며 뒤의 있다·없다와도 띄어 씁니다.',sources.norm,false,'띄어쓰기');
 }
 for(const m of text.matchAll(/([가-힣]+)것(?=(?:입니다|이다|같|처럼|으로|을|이|은|만|도|[.!?\s]|$))/gu)){
  if(finalConsonant(m[1].at(-1))===8&&!/(?:날|물|별)$/u.test(m[1]))
   add('geot-spacing',m.index+m[1].length,'것',' 것','관형형 -(으)ㄹ 뒤 의존 명사 것은 띄어 씁니다.',sources.norm,false,'띄어쓰기');
 }
 for(const m of text.matchAll(/([가-힣])꺼(예요|에요|야)(?=$|[\s.!?,])/gu)){
  if(finalConsonant(m[1])===8)add('geo-ending',m.index,m[0],m[1]+' 거'+(m[2]==='에요'?'예요':m[2]),'의존 명사 거는 띄어 쓰며 된소리 꺼로 적지 않습니다.',sources.norm);
 }
 for(const m of text.matchAll(/([가-힣]+는)대(?=\s+(?:시간|비용|돈|노력)(?:이|가|을|도|은)?\s+(?:(?:많이|적게|너무|꽤|조금)\s+)?(?:들|필요|쓰))/gu)){
  add('de-noun',m.index,m[0],m[1]+' 데','시간·비용 등이 드는 일을 가리킬 때는 의존 명사 데를 띄어 씁니다.','https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=313632',false,'띄어쓰기');
 }
 for(const m of text.matchAll(/(?:감기|상처|병|질환)(?:가|이|는|은)\s+(?:(?:빨리|얼른|곧|금방|완전히|잘|더)\s+)*(낳(?:기를|으면|아서|았|게|고|지))/gu)){
  const before=m[1],after=before.replace(/^낳(?=으|아|았)/u,'나').replace(/^낳/u,'낫');
  add('recover',m.index+m[0].length-before.length,before,after,'병이나 상처가 좋아진다는 뜻은 낫다입니다. 출산·발생을 뜻하는 낳다와 구분합니다.',undefined);
 }
 for(const chunk of sentences(text)){
  const topic=chunk.text.match(/^\s*[^.!?\n]{1,50}의\s+(?:목적은|목표는|바람은)\s+(.+)$/u);if(!topic)continue;
  const clause=topic[1];
  // Preserve topic constructions with a separate subject; only clear object/predicate mismatch is offered.
  if(!/[가-힣]+[을를]\s/u.test(clause)||/(?:^|\s)[가-힣]+(?:이|가|께서|은|는)\s/u.test(clause))continue;
  const endings={'높입니다':'높이는 것입니다','익힙니다':'익히는 것입니다','읽습니다':'읽는 것입니다','기릅니다':'기르는 것입니다','배웁니다':'배우는 것입니다','줄입니다':'줄이는 것입니다','공유합니다':'공유하는 것입니다'};
  for(const [before,after] of Object.entries(endings))if(clause.trim().replace(/[.!?]$/u,'').endsWith(before)){
   add('purpose-agreement',chunk.start+chunk.text.lastIndexOf(before),before,after,'목표·목적의 내용이 서술어와 호응하도록 제안합니다. 다른 뜻이라면 원문을 유지하세요.',undefined,false,'문장 호응');break;
  }
 }
 return issues;
}
module.exports={scanLinguistic};
