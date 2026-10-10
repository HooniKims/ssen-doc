# 배포 절차

1. Windows x64, Node.js 24+에서 `npm ci`를 실행합니다. Rust 엔진을 빌드할 때는 Rust MSVC와 Visual Studio C++ 도구가 필요합니다.
2. `package.json` 버전과 `CHANGELOG.md`, 화면 버전을 맞춥니다. 규칙 변경 시 `src/rules/rules.json`의 버전과 참·거짓 사례를 갱신합니다.
3. `npm test`, `npm run test:ui`, `npm run test:ai`를 실행합니다. 모델 파일은 배포하지 않습니다.
4. `npm run dist`로 NSIS 설치형과 ZIP을 만듭니다. 빌드 중 앱·규칙·사전·패키지에 들어갈 파일을 수정하지 마세요. `node scripts/verify-package.cjs`, `node scripts/test-packaged.cjs`, `node scripts/test-model-lifecycle.cjs --packaged`로 파일 무결성·세 화면 동작·CPU 네이티브 모듈·다운로드·삭제·직접 지정을 검증합니다. `node scripts/test-installer.cjs`는 `_workspace/install-test`에 실제 설치하고 업데이트 모드를 확인한 뒤 테스트 설치를 제거합니다. 실행 중인 쎈doc을 먼저 닫으세요.
5. `Get-FileHash release/SsenDoc-Setup-*.exe -Algorithm SHA256` 등으로 해시를 기록합니다. `release/win-unpacked/resources`에 GGUF 모델과 GPU용 불필요한 바이너리가 없는지 확인합니다.
6. 소유자의 GitHub `HooniKims/ssen-doc` 저장소에 `vX.Y.Z` 릴리즈를 만들고 설치 파일·ZIP·`latest.yml`·설치 파일의 `.blockmap`·변경 내역·해시를 함께 첨부합니다. 토큰을 소스나 앱에 넣지 않습니다. 자동 게시 없이 `--publish never`로 빌드합니다.
7. 기존 설치판에서 새 버전 확인 → 다운로드 → 저장 안내 → 재시작 설치를 확인합니다. ZIP은 릴리즈 페이지에서 새 파일을 받도록 안내합니다. 공개 릴리즈가 없을 때는 이 절차를 검증 완료로 기록하지 않습니다.

릴리즈 페이지에 다음 안내를 포함하세요.

> AI 맞춤법 검사는 최초 1회 모델 다운로드(약 0.4~1.5GB)가 필요합니다. 규칙 기반 검사는 다운로드 없이 바로 사용 가능합니다.

코드 서명이 없어 SmartScreen 경고가 표시될 수 있습니다. 실제 검증 범위와 남은 한계는 `docs/UPDATE-VERIFICATION.md`에 기록합니다. 원본 프로젝트의 권리·글꼴·단어 목록·모델 라이선스를 확인하고 고지를 포함하세요. EXAONE는 검토가 끝날 때까지 다운로드를 활성화하지 않습니다.
