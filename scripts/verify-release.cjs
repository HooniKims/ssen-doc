'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createUpdater}=require('../app/updater.cjs');
(async()=>{
 const response=await fetch('https://api.github.com/repos/HooniKims/ssen-doc/releases/latest');assert.ok(response.ok);
 const release=await response.json();assert.equal(release.draft,false);assert.equal(release.tag_name,'v1.0.0');
 const assets=await Promise.all(release.assets.map(async a=>{
  const head=await fetch(a.browser_download_url,{method:'HEAD'});assert.ok(head.ok,a.name);
  const local=fs.readFileSync('release/'+a.name),digest='sha256:'+crypto.createHash('sha256').update(local).digest('hex');assert.equal(a.digest,digest);assert.equal(a.size,local.length);
  return {name:a.name,bytes:a.size,digest,status:head.status};
 }));assert.equal(assets.length,5);
 const updater=createUpdater({app:{isPackaged:true,getVersion:()=> '1.0.0'},isInstalled:false});const zipUpdate=await updater.check();assert.equal(zipUpdate.phase,'latest');
 const report={date:new Date().toISOString(),url:release.html_url,draft:release.draft,assets,zipUpdate};fs.writeFileSync('docs/RELEASE-PUBLICATION.json',JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exitCode=1;});
