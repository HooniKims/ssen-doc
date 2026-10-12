# 쎈doc 작업 안내

배포 절차는 `RELEASING.md`, 검증 기록은 `docs/UPDATE-VERIFICATION.md`를 따른다.

## 주의

- 1.1.0: 쎈 시리즈 공통 인증 키트 1.0, app id `doc` / 서버 `ssen-doc`. 상세 범위는 `docs/AUTH-INTEGRATION.md`.
- `app/auth/` 원본 파일, 특히 `auth-store.ps1` 저장 경로·DPAPI·잠금·입출력과 `auth-service.cjs` 신뢰 키·서명 규칙을 변경하지 않는다. 인증 통신은 Electron `net.fetch`를 유지한다.
- 보호 위치: `app/auth-policy.cjs`의 GATED, 각 renderer의 `requireEdit`, 메인의 공통 IPC 등록기. 새 IPC는 반드시 분류한다. 렌더러 전용 session의 네트워크 차단을 유지한다.
- 저장소 PowerShell 호출은 비싸다. 새 기능에서 `auth.act`/`authorize`를 반복 호출하지 않고 기존 throttle·prewarm을 사용한다. 표시용 캐시를 권한으로 사용하지 않는다.
- 실제 서버의 `ssen-doc`/`doc` 지원 확인 전 1.1.0을 공개 게시하지 않는다. 릴리즈마다 `npm run test:auth:net`을 실행한다.

- 1.0.2부터 자체 이용약관(`LICENSE`)을 적용한다. 설치 화면 약관 페이지, 설치 폴더 `LICENSE.txt`, 파일 속성 저작권, 설정 · 업데이트 창의 [이용약관 보기]가 모두 `LICENSE`에서 나온다. 코드 난독화는 하지 않는다.
- 앱 코드 안에 복제 증거 표식 6곳이 있다. 위치와 값은 `docs/provenance.md`(공개 저장소이므로 커밋하지 않음, 관리자 PC에만 보관)에 있다. 표식을 고치거나 지우면 그 기록도 함께 고친다.
- 이용자 결과물(TXT/HTML 교정문, 교정본, 문서 대조 수정본, 용량 줄인 HWPX)과 그 메타데이터에는 어떤 표식도 넣지 않는다.
- appId, 설치 폴더 이름, 실행 파일 이름(`SsenDoc.exe`)은 바꾸지 않는다. 기존 설치와 자동 업데이트가 깨진다.
