'use strict';
function merge(primary,secondary){const result=[...primary];for(const issue of secondary){if(!result.some(p=>typeof p.suggestion==='string'&&p.start<issue.end&&issue.start<p.end))result.push({...issue,auto:false});}return result.sort((a,b)=>a.start-b.start);}
module.exports={merge};
