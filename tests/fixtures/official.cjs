'use strict';
const {zipSync,strToU8}=require('fflate');
const style=(id,type='NONE',left=0,intent=0)=>`<hh:paraPr id="${id}" keep="yes"><hh:heading type="${type}"/><hp:switch><hp:case><hh:margin><hc:left value="${left}" unit="HWPUNIT"/><hc:intent value="${intent}" unit="HWPUNIT"/><hc:right value="500" unit="HWPUNIT"/></hh:margin></hp:case><hp:default><hh:margin><hc:left value="${left}" unit="HWPUNIT"/><hc:intent value="${intent}" unit="HWPUNIT"/><hc:right value="500" unit="HWPUNIT"/></hh:margin></hp:default></hp:switch></hh:paraPr>`;
function fixture(){
 const text=['1. 운영 계획','  1) 대상','  2) 일정','2. 세부 내용','  3) 준비물','  4) 유의 사항','수정하지 않는 본문'];
 return Buffer.from(zipSync({mimetype:[strToU8('application/hwp+zip'),{level:0}],
 'Contents/section0.xml':strToU8(`<hs:sec xmlns:hs="s" xmlns:hp="p">${text.map(t=>`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>`).join('')}</hs:sec>`),
 'Contents/header.xml':strToU8(`<hh:head xmlns:hh="h" xmlns:hp="p" xmlns:hc="c"><hh:charProperties><hh:charPr id="0" height="1000"/></hh:charProperties><hh:paraProperties itemCnt="1">${style(0)}</hh:paraProperties></hh:head>`),
 'BinData/picture.png':new Uint8Array([1,2,3]),'Preview/PrvText.txt':strToU8(text.join('\n'))}));
}

module.exports={fixture,style};
