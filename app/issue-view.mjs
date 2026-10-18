export function issueKey(issue){return JSON.stringify([issue.source,issue.category,issue.original,issue.suggestion,issue.evidence?.id||issue.ruleId||'']);}
export function visibleIssues(issues,filter='all'){
 return issues.filter(i=>typeof i.suggestion==='string'&&i.original!==i.suggestion&&i.source!=='dictionary'&&i.source!=='context')
  .filter(i=>filter==='all'||(filter==='grammar'?i.category==='문장 호응':filter==='spelling'?i.category!=='문장 호응':i.source===filter));
}
export function groupIssues(issues){
 const groups=new Map();
 for(const issue of issues){const key=issueKey(issue);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(issue);}
 return [...groups.values()];
}
export function displayChange(issue,text){
 let start=issue.start,end=issue.end;
 while(start>0&&/[가-힣A-Za-z0-9]/u.test(text[start-1]))start--;
 while(end<text.length&&/[가-힣A-Za-z0-9]/u.test(text[end]))end++;
 return {original:text.slice(start,end),suggestion:text.slice(start,issue.start)+issue.suggestion+text.slice(issue.end,end)};
}
