'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const version=require('../package.json').version,releaseDir=process.env.SSENDOC_RELEASE_DIR||'release';
const {createUpdater}=require('../app/updater.cjs');
(async()=>{
 const response=await fetch('https://api.github.com/repos/HooniKims/ssen-doc/releases/latest');assert.ok(response.ok);
 const release=await response.json();assert.equal(release.draft,false);assert.equal(release.tag_name,'v'+version);
 const assets=await Promise.all(release.assets.map(async a=>{
  const head=await fetch(a.browser_download_url,{method:'HEAD'});assert.ok(head.ok,a.name);
  const local=fs.readFileSync(releaseDir+'/'+a.name),digest='sha256:'+crypto.createHash('sha256').update(local).digest('hex');assert.equal(a.digest,digest);assert.equal(a.size,local.length);
  return {name:a.name,bytes:a.size,digest,status:head.status};
 }));assert.equal(assets.length,5);
 const updater=createUpdater({app:{isPackaged:true,getVersion:()=> version},isInstalled:false});const {origin:_origin,...zipUpdate}=await updater.check();assert.equal(zipUpdate.phase,'latest');
 const imageUrls=[...new Set((release.body||'').match(/https:\/\/raw\.githubusercontent\.com\/HooniKims\/ssen-doc\/[^\s)]+\.png/g)||[])];assert.ok(imageUrls.length>=4,'Release must include screenshots');
 const screenshots=await Promise.all(imageUrls.map(async url=>{const r=await fetch(url,{method:'HEAD'});assert.ok(r.ok,url);return {url,status:r.status};}));
 const report={version,date:new Date().toISOString(),url:release.html_url,draft:release.draft,assets,zipUpdate,screenshots};fs.writeFileSync('docs/RELEASE-PUBLICATION.json',JSON.stringify(report,null,2));fs.writeFileSync(`docs/RELEASE-PUBLICATION-${version}.json`,JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1;});
