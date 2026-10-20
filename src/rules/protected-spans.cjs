'use strict';
function protectedSpans(text){
 const ranges=[];
 const regex=/```[\s\S]*?```|`[^`\n]+`|“[^”]*”|‘[^’]*’|"[^"\n]*"|'[^'\n]*'|https?:\/\/[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
 for(const match of text.matchAll(regex))ranges.push([match.index,match.index+match[0].length]);
 return ranges;
}
const overlaps=(ranges,start,end)=>ranges.some(([a,b])=>start<b&&end>a);
module.exports={protectedSpans,overlaps};
