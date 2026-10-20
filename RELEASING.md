# 배포 절차

1.5.2는 `docs/QUALITY95-PROTOCOL.md`의 고정된 95점 기준을 사용합니다. `node scripts/test-quality95-suite.cjs`가 A·B·C·기존 세트를 실제 모델로 순차 실행합니다. CPU 추론과 설치 파일 압축을 동시에 실행하지 마세요. 개별 실행은 `node scripts/test-quality95.cjs --fixture=tests/fixtures/quality95-fresh-c.cjs --tag=새로운태그`입니다. 기존 기록은 덮어쓰지 않으며, 실패한 A·B는 회귀 세트로 보존합니다. 최종 태그는 `round4`, `fresh-a4`, `fresh-b2`, `fresh-c2`입니다. 빌드는 `npm run dist -- --config.directories.output=release/1.5.2 --config.electronDist=node_modules/electron/dist`, 후속 검사는 `SSENDOC_RELEASE_DIR=release/1.5.2`를 사용합니다. 한글 시험은 `scripts/export-quality95-hwpx.cjs`, `scripts/test-harness-hwpx.cjs --root=_workspace/quality95/hwpx`, `python -X utf8 scripts/test-harness-hwpx.py _workspace/quality95/hwpx`, `scripts/test-harness-hwpx.cjs --root=_workspace/quality95/hwpx --verify` 순서입니다.

1.5.1은 맞춤법 AI 응답과 문장 분할·문맥 후보 검토를 보완합니다. `node scripts/test-harness-quality.cjs`는 고정된 새 예문 및 이전 실패 예문을 실제 모델로 검사합니다. 보존한 기준 코드가 있을 때 `--baseline`으로 같은 새 예문의 이전 결과를 얻습니다. 결과는 `_workspace/harness-quality-1.5.1/`에 기록하며, 입력 정답을 모델 출력에 맞추어 변경하지 않습니다. 빌드는 `npm run dist -- --config.directories.output=release/1.5.1 --config.electronDist=node_modules/electron/dist`, 후속 검사는 `SSENDOC_RELEASE_DIR=release/1.5.1`을 사용합니다.

1.5.0은 로컬 AI 구조 검토 하네스와 표·자동 번호 처리 추가판입니다. `npm run test:structure -- --ai`로 실제 보유 모델을 검증하고 `tests/structure-harness.test.cjs`, `tests/official-advanced.test.cjs`, `tests/ui/structure.spec.cjs`로 거부·재시도·취소·표 저장·자동 번호 유지 등을 확인합니다. 화면 시험의 모델은 모의 구현이며 실제 품질 시험과 구분합니다. 빌드는 `npm run dist -- --config.directories.output=release/1.5.0-ready --config.electronDist=node_modules/electron/dist`이며 후속 검사에 `SSENDOC_RELEASE_DIR=release/1.5.0-ready`을 사용합니다. `SSENDOC_AUTH_APP_ROOT`에 이 빌드의 `win-unpacked/resources/app.asar`를 지정해 전체 UI 회귀도 실행합니다.

1.4.0은 공문 항목 정리 추가판입니다. 산출물은 `release/1.4.0/`에 만들며 `npm run dist -- --config.directories.output=release/1.4.0 --config.electronDist=node_modules/electron/dist`를 사용합니다. `tests/official-format.test.cjs`는 번호·원본 보존·문단 서식·재실행 안정성을, `tests/ui/official.spec.cjs`는 미리보기·단계 선택·적용·되돌리기·교정본 저장을 검사합니다. 공개 게시와 자동 업데이트는 빌드와 별도입니다.

1.3.1은 문서 전체 AI 검사 수정판입니다. 최종 빌드·검증 경로는 `release/1.3.1-ready/`이며 `SSENDOC_RELEASE_DIR`도 이 경로로 지정합니다. `node scripts/check-ai-document.cjs`로 규정 검색 결과가 없는 세 문단 모두 실제 CPU 추론을 거치는지 확인합니다. AI 화면 회귀는 `tests/ui/ai.spec.cjs`이며 모의 모델로 전체 범위·취소·실패·결과 보존을 검사합니다. 실제 모델 검증과 구분해 기록합니다. 초기 `release/1.3.1/`와 `release/1.3.1-final/` 빌드는 상태 안내 보완 전이므로 배포하지 않습니다. 실행 중인 사용자 앱은 종료하지 않고, 저장 후 업데이트하도록 안내합니다.

1.3.0 산출물은 `release/1.3.0/`에 만듭니다. 빌드는 `npm run dist -- --config.directories.output=release/1.3.0 --config.electronDist=node_modules/electron/dist`, 후속 검증에는 `SSENDOC_RELEASE_DIR=release/1.3.0`을 지정합니다. 소스·배포본 UI 각각 전체 회귀를 실행하며 `npm run test:quality -- --ai`로 합성 문장의 오탐과 통합 교정을 확인합니다. RAG 자료는 공식 자료 자체 요약 5건이며 규정 전문이나 모든 비문 지원으로 안내하지 않습니다.

모델 다운로드가 네트워크 인증서 문제로 막힌 경우에는 원인을 기록하고, 보유한 실제 GGUF로 `node scripts/test-model-lifecycle.cjs --packaged --import-only`를 실행해 직접 지정·추론·삭제를 따로 검증할 수 있습니다. 이 결과를 다운로드·재개 검증으로 기록하지 않습니다.

1.1.0부터 공통 인증 서버의 `ssen-doc` 등록과 토큰 scope `doc` 지원을 확인한 뒤 게시합니다. 알 수 없으면 설치본·모의 시험·캡처까지 준비한 후 소유자에게 서버 작업 완료 여부를 한 번 확인합니다. 미확인 상태에서는 공개 릴리즈 및 자동 업데이트를 게시하지 않습니다.

`npm run dist`는 인증용 Electron Chromium 네트워크 시험을 먼저 실행합니다. 빌드한 `app.asar`를 `SSENDOC_AUTH_APP_ROOT`로 지정해 `npm run test:ui`도 실행하세요. 테스트 fixture는 설치 파일에 포함되지 않습니다. 실제 공통 계정으로 OTP·PC 등록·교육용 인증·학교망 접속은 별도 확인합니다. 자세한 범위는 `docs/AUTH-INTEGRATION.md`를 참고하세요.

1.2.0 산출물은 `release/1.2.0/`에 있습니다. 쎈 시리즈 디자인을 적용한 버전입니다. 이 PC에서 Electron 압축 해제 임시 폴더가 잠기는 문제가 발생해, 같은 버전의 설치된 런타임을 사용하여 `npm run dist -- --config.directories.output=release/1.2.0 --config.electronDist=node_modules/electron/dist`로 빌드합니다. 검증 스크립트에는 `SSENDOC_RELEASE_DIR=release/1.2.0`를 지정합니다. 로고·아이콘을 수정했다면 앱을 닫고 `npm run build:design`을 먼저 실행하세요. 패키지 검사에서 세 로컬 글꼴 포함과 가나초콜릿 TTF 제외도 확인합니다. 이전 1.1.0 최종 공개 빌드는 `release/1.1.0-recommended/`에 보관합니다.

공통 인증 릴리즈 문구:

> 쎈 시리즈 공통 계정으로 로그인합니다. 센스쿨(@senedu.kr) 이메일이면 무료입니다. 이미 다른 쎈 앱에서 인증했다면 따로 할 일이 없습니다.

1. Windows x64, Node.js 24+에서 `npm ci`를 실행합니다. Rust 엔진을 빌드할 때는 Rust MSVC와 Visual Studio C++ 도구가 필요합니다.
2. `package.json` 버전과 `CHANGELOG.md`, 화면 버전을 맞춥니다. 규칙 변경 시 `src/rules/rules.json`의 버전과 참·거짓 사례를 갱신합니다.
3. `npm test`, `npm run test:ui`, `npm run test:ai`를 실행합니다. 모델 파일은 배포하지 않습니다.
4. `npm run dist`로 NSIS 설치형과 ZIP을 만듭니다. 빌드 전에 `scripts/prepare-license.cjs`가 `LICENSE`로 설치 화면용 `build/LICENSE.txt`(UTF-16LE)를 만듭니다. 약관을 고칠 때는 `LICENSE`만 수정하세요. 빌드 중 앱·규칙·사전·패키지에 들어갈 파일을 수정하지 마세요. `node scripts/verify-package.cjs`, `node scripts/test-packaged.cjs`, `node scripts/test-model-lifecycle.cjs --packaged`로 파일 무결성·세 화면 동작·CPU 네이티브 모듈·다운로드·삭제·직접 지정을 검증합니다. `node scripts/test-installer.cjs`는 `_workspace/install-test`에 실제 설치하고 업데이트 모드를 확인한 뒤 테스트 설치를 제거합니다. 실행 중인 쎈doc을 먼저 닫으세요.
5. `Get-FileHash release/SsenDoc-Setup-*.exe -Algorithm SHA256` 등으로 해시를 기록합니다. `release/win-unpacked/resources`에 GGUF 모델과 GPU용 불필요한 바이너리가 없는지 확인합니다.
6. 소유자의 GitHub `HooniKims/ssen-doc` 저장소에 `vX.Y.Z` 릴리즈를 만들고 설치 파일·ZIP·`latest.yml`·설치 파일의 `.blockmap`·변경 내역·해시를 함께 첨부합니다. 토큰을 소스나 앱에 넣지 않습니다. 자동 게시 없이 `--publish never`로 빌드합니다.
7. 기존 설치판에서 새 버전 확인 → 다운로드 → 저장 안내 → 재시작 설치를 확인합니다. ZIP은 릴리즈 페이지에서 새 파일을 받도록 안내합니다. 공개 릴리즈가 없을 때는 이 절차를 검증 완료로 기록하지 않습니다.

릴리즈 페이지에 다음 안내를 포함하세요.

> AI 맞춤법 검사는 최초 1회 모델 다운로드(약 400MB)가 필요합니다. 규칙 기반 검사는 다운로드 없이 바로 사용 가능합니다.

코드 서명이 없어 SmartScreen 경고가 표시될 수 있습니다. 실제 검증 범위와 남은 한계는 `docs/UPDATE-VERIFICATION.md`에 기록합니다. 원본 프로젝트의 권리·글꼴·단어 목록·모델 라이선스를 확인하고 고지를 포함하세요. 제공 모델은 Qwen3 0.6B Q4_K_M 한 가지입니다.
