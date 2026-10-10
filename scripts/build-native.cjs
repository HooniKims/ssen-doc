'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../modules/lite/native'),exe=path.join(root,'bin/ssen-hwpx.exe');
if(!fs.existsSync(exe)||process.env.SSENDOC_REBUILD_NATIVE==='1'){
 execFileSync('cargo',['build','--locked','--release','--manifest-path',path.join(root,'Cargo.toml')],{stdio:'inherit',windowsHide:true});fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,fs.readFileSync(path.join(root,'target/release/ssen-hwpx.exe')));
}
console.log('OpenHWP engine ready: '+exe);
