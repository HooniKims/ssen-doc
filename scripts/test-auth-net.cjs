'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.resolve(__dirname,'../tests/auth-kit/electron/net.cjs')],{env,stdio:'inherit',windowsHide:true});
const timer=setTimeout(()=>{child.kill();process.exitCode=1;},60000);
child.on('error',()=>{clearTimeout(timer);process.exitCode=1;});
child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
