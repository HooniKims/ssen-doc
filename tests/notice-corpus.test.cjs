'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{scan,apply}=require('../src/rules/rule-engine.cjs');
const examples=[
 ['설겆이를 마쳤어요.','설거지를 마쳤어요.'],['배게를 준비해 주세요.','베개를 준비해 주세요.'],
 ['학생이예요. 학교이예요.','학생이에요. 학교예요.'],['금새 끝날꺼야.','금세 끝날꺼야.'],
 ['내일 뵈요. 연락드릴께요.','내일 봬요. 연락드릴게요.'],['몇일 동안 기다렸어요.','며칠 동안 기다렸어요.'],
 ['그렇치 않습니다.','그렇지 않습니다.'],['참여할수있습니다.','참여할 수 있습니다.'],['신청할때 확인할것입니다.','신청할 때 확인할 것입니다.'],
 ['요새는 왠지 기분이 좋아요.','요새는 왠지 기분이 좋아요.'],['반듯이 앉아서 대게를 먹었다.','반듯이 앉아서 대게를 먹었다.'],
 ['이쁘다. 깍두기를 담갔다. 어제께 만났어요.','이쁘다. 깍두기를 담갔다. 어제께 만났어요.'],
 ['그 돈의 일부로 선물을 샀다.','그 돈의 일부로 선물을 샀다.'],['어떻게 오셨어요? 안 갑니다.','어떻게 오셨어요? 안 갑니다.']
];
for(const [original,expected] of examples)test(`school corpus: ${original}`,()=>assert.equal(apply(original,scan(original),{all:true}),expected));
