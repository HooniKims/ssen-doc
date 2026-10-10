'use strict';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const report=(text,type)=>type==='html'?`<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>쎈doc 교정문</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:24px;line-height:1.8}pre{white-space:pre-wrap;font:inherit}footer{color:#52675d}</style><h1>쎈doc 교정문</h1><pre>${escape(text)}</pre><footer>자동 검사가 모든 오류를 잡아내지는 못합니다. 올리기 전 한 번 더 읽어보세요.</footer></html>`:text;
module.exports={report};
