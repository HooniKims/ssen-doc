// 1.0.4: 인증 요청이 Electron(Chromium) 네트워크로 나가는지, 같은 옵션(redirect:'error'·시간 제한)으로 동작하는지, 실패 원인이 진단에 남는지 확인
// 실행: xvfb-run electron --no-sandbox tests/electron/net.cjs
const { app } = require('electron');
const http = require('http');
const { _send, _netCause } = require('../../../app/auth/auth-native.cjs');
const H = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Ssen-Spec': '5.0.0', 'X-Ssen-Nonce': 'n1' };
app.whenReady().then(async () => {
  const fails = []; const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
  let got = null;
  const srv = http.createServer((q, r) => {
    let b = ''; q.on('data', d => b += d); q.on('end', () => {
      if (q.url === '/redirect') { r.writeHead(302, { location: '/ok' }); return r.end(); }
      if (q.url === '/slow') return setTimeout(() => r.end('{}'), 30000);
      got = { method: q.method, body: b, spec: q.headers['x-ssen-spec'], nonce: q.headers['x-ssen-nonce'], ua: q.headers['user-agent'] || '' };
      r.writeHead(429, { 'content-type': 'application/json', 'x-ssen-spec': '5.0.0', date: new Date(Date.UTC(2026, 9, 12)).toUTCString() }); r.end('{"error":{"code":"TOO_SOON"}}');
    });
  }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await _send(base + '/auth/otp/send', { method: 'POST', body: '{"email":"a@b.c"}' }, H);
    check(r.status === 429 && JSON.parse(r.body).error.code === 'TOO_SOON', '응답 상태·본문 그대로 전달(오류 응답도)');
    check(r.spec === '5.0.0' && r.serverTime === Math.floor(Date.UTC(2026, 9, 12) / 1000), '서버 시각·spec 헤더');
    check(got && got.method === 'POST' && got.body === '{"email":"a@b.c"}' && got.spec === '5.0.0' && got.nonce === 'n1', '요청 방식·본문·서명 헤더 전달');
    check(/Chrome\//.test(got.ua), 'Chromium 네트워크로 나감(UA: ' + got.ua.slice(0, 40) + '…)');
  } catch (e) { check(false, '기본 요청 실패: ' + e.message + ' ' + e.netCause); }
  try { await _send(base + '/redirect', { method: 'GET' }, H); check(false, '다른 주소로 넘기기 거부'); }
  catch (e) { check(e.message === 'NETWORK' && e.netVia === 'chromium' && e.netCause === 'REDIRECT', '다른 주소로 넘기기 거부 → NETWORK(' + e.netCause + ')'); }
  try { await _send('http://127.0.0.1:1/x', { method: 'GET' }, H); check(false, '연결 실패'); }
  catch (e) { check(e.message === 'NETWORK' && /^net::ERR_/.test(e.netCause), '연결 실패 원인 기록: ' + e.netCause); }
  try { await _send('http://nonexistent.invalid/x', { method: 'GET' }, H); check(false, '주소 찾기 실패'); }
  catch (e) { check(e.message === 'NETWORK' && /^net::ERR_/.test(e.netCause), '주소 찾기 실패 원인 기록: ' + e.netCause); }
  check(_netCause(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } })) === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'Node 오류 원인 코드 읽기');
  check(_netCause(new Error('보안 정보 https://x?email=a')) === 'Unclassified', '주소·내용은 진단에 남기지 않음');
  srv.close();
  console.log(fails.length ? 'NET FAIL' : 'NET PASS');
  app.exit(fails.length ? 1 : 0);
});
