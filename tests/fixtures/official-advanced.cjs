'use strict';
const {zipSync,unzipSync,strFromU8,strToU8}=require('fflate');
const {fixture,style}=require('./official.cjs');
const para=(text,id=0)=>`<hp:p paraPrIDRef="${id}"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p>`;
function advanced({native=false}={}){
 const parts=unzipSync(fixture());
 let header=strFromU8(parts['Contents/header.xml']);
 if(native){
  header=header.replace('<hh:paraProperties itemCnt="1">',`<hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" numFormat="ROMAN_CAPITAL" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead><hh:paraHead start="1" level="2" numFormat="DIGIT" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" charPrIDRef="4294967295" checkable="0">^2)</hh:paraHead></hh:numbering></hh:numberings><hh:paraProperties itemCnt="3">`);
  header=header.replace('</hh:paraProperties>',style(1,'NUMBER').replace('type="NUMBER"','type="NUMBER" idRef="1" level="0"')+style(2,'NUMBER').replace('type="NUMBER"','type="NUMBER" idRef="1" level="1"')+'</hh:paraProperties>');
 }
 const first=native?para('운영 계획',1)+para('대상',2)+para('일정',2):para('1. 운영 계획')+para('  1) 대상')+para('  2) 일정');
 const second=native?para('다음 계획',1)+para('준비물',2):para('4. 준비 계획')+para('  3) 준비물');
 parts['Contents/header.xml']=strToU8(header);
 parts['Contents/section0.xml']=strToU8(`<hs:sec xmlns:hs="s" xmlns:hp="p">${para('일반 본문')}<hp:p><hp:run><hp:tbl rowCnt="1" colCnt="2"><hp:tr><hp:tc><hp:cellAddr rowAddr="0" colAddr="0"/><hp:cellSpan rowSpan="1" colSpan="1"/><hp:subList>${first}</hp:subList></hp:tc><hp:tc><hp:cellAddr rowAddr="0" colAddr="1"/><hp:cellSpan rowSpan="1" colSpan="1"/><hp:subList>${second}</hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`);
 return Buffer.from(zipSync(parts));
}
module.exports={advanced,para};
