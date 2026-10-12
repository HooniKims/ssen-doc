import './sen-ui.mjs';
import {initAuthUI} from './auth/auth-ui.mjs';
export async function startAuth() {
  const {version}=await window.desktop.authInfo();
  const header=document.querySelector('.sen-header-actions');
  const parent=document.createElement('div');parent.id='auth-slot';header.append(parent);
  const ready=new Promise(resolve=>document.addEventListener('sen-auth-change',resolve,{once:true}));
  const ui=initAuthUI({appName:'SsenDoc',version,buttonParent:'#auth-slot',protectHint:'문서 열기·검사는 계속 사용할 수 있습니다.'});
  window.desktop.onAuthRequired(()=>ui.open());
  await ready;
  return ui;
}
