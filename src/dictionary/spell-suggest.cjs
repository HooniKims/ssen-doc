'use strict';
const fs=require('node:fs'),path=require('node:path');
const jamo=s=>s.normalize('NFD');
// The frequency list comes from film subtitles, so school terms and polite endings are added here.
const school=new Set(fs.readFileSync(path.join(__dirname,'school-words.txt'),'utf8').split(/\s+/).filter(Boolean));
const suffixes=['에게서','으로부터','으로서','으로써','에서는','에서도','에서의','으로는','으로도','까지는','부터는','께서는','께서','에게는','에게','에서','으로','처럼','보다','까지','부터','마다','별로','이라도','라도','이랑','하고','이며','이나','에는','에도','과는','와는','합니다','합니까','하였습니다','했습니다','드립니다','됩니다','입니다','이었습니다','였습니다','습니다','하겠습니다','하여','하는','하며','하기','하게','하면','하고','해요','했고','되는','되어','된','할','한','이다','이고','님께','님','들','과','와','은','는','이','가','을','를','에','도','만','의','로'];
// 모입니다 → 모이, 마십니다 → 마시: drop the final ㅂ before -니다.
function predicateStem(word){const m=/^(.+)(.)니다$/.exec(word);if(!m)return null;const code=m[2].charCodeAt(0)-0xAC00;if(m[2]==='습')return m[1];if(code<0||code>11171||code%28!==17)return null;return m[1]+String.fromCharCode(code-17+0xAC00);}
function distance(a,b,limit=2){a=jamo(a);b=jamo(b);if(Math.abs(a.length-b.length)>limit)return limit+1;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let k=1;k<=b.length;k++)next[k]=Math.min(next[k-1]+1,row[k]+1,row[k-1]+(a[i-1]===b[k-1]?0:1));if(Math.min(...next)>limit)return limit+1;row=next;}return row[b.length];}
class Dictionary{
 constructor(words){this.frequency=new Map(words||fs.readFileSync(path.join(__dirname,'../../assets/wordlist.txt'),'utf8').trim().split(/\r?\n/).map(s=>{const [word,n]=s.split(/\s+/);return [word,Number(n)||1];}));this.buckets=new Map();this.cache=new Map();for(const [word,n] of this.frequency){if(!/^[가-힣]{2,10}$/.test(word))continue;const key=jamo(word)[0];if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push([word,n]);}}
 known(word,user=[],depth=0){if(this.frequency.has(word)||school.has(word)||user.includes(word))return true;if(depth>1)return false;
  const stem=predicateStem(word);if(stem&&(this.frequency.has(stem)||school.has(stem)||['다','고','는','면','지','요','죠','세요'].some(e=>this.frequency.has(stem+e))))return true;
  for(const suffix of suffixes)if(word.endsWith(suffix)&&word.length>suffix.length){const root=word.slice(0,-suffix.length);if(this.known(root,user,depth+1))return true;}return false;}
 suggest(word){if(this.cache.has(word))return this.cache.get(word);const found=[];for(const [w,n] of this.buckets.get(jamo(word)[0])||[]){if(Math.abs(w.length-word.length)>1)continue;const d=distance(word,w);if(d>0&&d<=2)found.push({word:w,d,n});}found.sort((a,b)=>a.d-b.d||b.n-a.n||a.word.localeCompare(b.word));const result=found.slice(0,3).map(w=>w.word);if(this.cache.size>2000)this.cache.clear();this.cache.set(word,result);return result;}
 scan(text,primary=[],user=[]){const issues=[];for(const m of text.matchAll(/[가-힣]{2,}/gu)){const start=m.index,end=start+m[0].length;if(this.known(m[0],user)||primary.some(i=>i.start<end&&start<i.end))continue;issues.push({id:`dictionary:${start}`,start,end,original:m[0],suggestions:issues.length<80?this.suggest(m[0]):[],suggestion:null,reason:'사전에 없는 단어 (고유명사일 수 있음). 조사·활용형이나 학교 용어일 수도 있습니다. 직접 확인하세요.',category:'사전에 없는 단어',source:'dictionary',auto:false});if(issues.length>=500)break;}return issues;}
}
module.exports={Dictionary,jamo,distance};
