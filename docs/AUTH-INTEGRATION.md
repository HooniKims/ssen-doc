# 공통 인증 1.0 적용 — 쎈doc 1.1.0

앱 ID는 `doc`, 서버 앱 이름은 `ssen-doc`, 토큰 scope는 `doc`이다. 사용자 제공 `ssen-auth-kit-1.0.zip`의 `auth/` 여섯 파일을 `app/auth/`에 원본 그대로 포함했다. 원본 해시와 비교하는 단위 테스트 및 Git 줄바꿈 변환 방지 설정을 추가했다.

| 인증 없이 허용 | 인증 후 허용 |
|---|---|
| 검사할 글 입력·붙여넣기, 문서 열기, 맞춤법·띄어쓰기 검사 | 교정 후보 적용·실행 취소, 문서 직접 편집 |
| 문서 대조·원문 보기, 검사 결과 필터·확인 표시 | 교정본·TXT·HTML·대조 보고서·예제 저장, 복사 |
| 압축할 파일 선택·목록 정리 | 압축 설정 변경·저장 폴더 선택·압축 저장 |
| 이미 설치한 로컬 AI로 추가 검사, 모델 상태 보기·다운로드 중지 | 모델 다운로드·재개·직접 지정·삭제, 내 사전 추가 |
| 이용권·진단·약관·업데이트, 작업 중지 | 위 결과물 생성·변경 IPC 전체 |

입력란은 인증 전에도 검사할 글을 받는다. 이를 문서 편집 권한으로 보지 않는다. 파일에 반영하는 저장과 교정 적용은 별도로 보호한다. 최초 AI 안내를 보았다는 내부 표시만 인증 없이 저장하며, 이용자 설정을 임의로 쓰는 API는 제공하지 않는다. 업데이트·진단은 인증 복구를 위해 열어 둔다.

## 연결 위치

- `app/main.cjs`: `createNativeAuth({app:'doc'})`, throttle·prewarm·1분 상태 전달, 13개 인증 명령, 진단 복사 및 개인정보 링크.
- `app/auth-policy.cjs`: 모든 IPC의 허용/보호 목록. 분류하지 않은 새 IPC는 등록 단계에서 거부한다. 세 renderer의 sender와 mainFrame을 확인한 후 보호 IPC마다 `auth.authorize()`를 거친다.
- `app/renderer.js`, `modules/{review,lite}/app/renderer.js`: 동작 시작 시 `requireEdit()` 확인. 교정 적용·취소는 메인의 `edit:authorize`도 확인한다. 문서 입력란은 보호 모드에서 읽기 전용이다.
- `app/auth-setup.mjs`, `app/auth-integration.css`: 세 화면 머리줄의 이용권 버튼과 공통 안내. 키트 파일 대신 별도 통합 파일에서 스타일을 조정한다.
- 세 `preload.cjs`: 제한된 인증 API만 노출한다. 진단 복사는 전달받은 임의 글을 쓰지 않고 메인이 만든 진단만 복사한다. 외부 링크는 정확히 `https://ssenbox.lovable.app/privacy`만 허용한다.

## 통신·저장소

인증은 메인의 Electron `net.fetch`와 기본 session을 쓴다. 모든 BrowserWindow와 WebContentsView는 별도 `ssendoc-renderer` session을 쓰며 HTTP·HTTPS·WS·WSS를 차단한다. CSP `connect-src 'none'`도 유지한다. 검사 텍스트·문서 데이터는 인증 경로와 공유하지 않는다.

공통 저장소는 `%LOCALAPPDATA%\SsenSeries\Auth\v4.bin`의 DPAPI CurrentUser, 엔트로피 `SsenSeries.Auth.v4`, 잠금 `Local\SsenSeriesAuthV4`를 그대로 쓴다. 개인 이메일은 진단 및 표시용 `auth-last.json` 캐시에 저장하지 않는다.

PowerShell 비용 때문에 키트 throttle을 우회하지 않는다. 자동 확인은 10분 간격, 시작 후 2분·10초 유휴 기준으로 미루며 성공한 authorize는 60초 동안 재사용한다. 다른 앱의 로그아웃·PC 해제는 다음 실제 확인 때 반영되므로 즉시 전파를 보장하지 않는다. 이 앱에서 직접 인증 동작을 하면 authorize 캐시를 무효화하고 세 화면에 결과를 전달한다.

## 시험과 게시 조건

`npm test`는 키트 17개와 앱의 권한·무결성 시험을 포함한다. `npm run test:auth:net`은 localhost 모의 서버로 Chromium 통신을 확인하며 `npm run dist`에 포함된다. UI 시험은 설치본에 들어가지 않는 `tests/fixtures/auth-launch.cjs`에서 모의 인증을 주입한다. 실제 DPAPI 계정, 이메일 인증번호 전송, 로그아웃은 자동 시험에서 사용하지 않는다. `SSENDOC_AUTH_APP_ROOT`로 빌드한 app.asar의 실제 코드도 같은 시험에 사용한다. 앱 코드에는 인증 시험용 우회가 없다.

게시 전 인증 서버가 `ssen-doc`와 scope `doc`를 지원하는지 소유자 확인이 필요하다. 실제 OTP 수신, 교육용 계정 승인, 공통 PC 자동 인식, 학교망 프록시·인증서, 다른 앱으로 로그아웃 전파는 해당 계정·학교망에서 최종 확인해야 한다. 모의 시험 통과를 실제 서버 인증 성공으로 표현하지 않는다.
