# 쎈doc 1.0.3 — 처음 실행할 때 AI 검사 안내

맞춤법 검사, 문서 대조(옛 쎈Pick), HWPX 용량 줄이기(옛 쎈Lite)를 한 앱에서 쓰는 Windows 앱입니다.

## 이번 버전에서 바뀐 점

- 앱을 처음 실행하면 AI 모델 다운로드 안내가 바로 나옵니다. 이전에는 처음 검사할 때 안내가 떴습니다.
- 안내 창에서 AI 모델이 **선택 사항**이고, **이 PC에 설치**되어 인터넷 없이 동작하며, **별도 비용이 없다**는 점을 확인할 수 있습니다. 건너뛰어도 기본 검사는 그대로 쓸 수 있고, 나중에 **AI 모델 관리**에서 받아도 됩니다.
- 모델이 없을 때는 안내 창에서 쓸 수 없는 '모델 삭제' 영역을 숨깁니다.

![처음 실행할 때 나오는 AI 검사 안내](https://raw.githubusercontent.com/HooniKims/ssen-doc/v1.0.3/docs/ui-first-run.png)

1.0.2에서 바뀐 점(이용약관 적용, 맞춤법 검사·문서 교정 개선)은 [1.0.2 릴리스](https://github.com/HooniKims/ssen-doc/releases/tag/v1.0.2)에서 볼 수 있습니다.

## 다운로드

| 파일 | 사용 방법 |
| --- | --- |
| [설치형 EXE · 약 184MB](https://github.com/HooniKims/ssen-doc/releases/download/v1.0.3/SsenDoc-Setup-1.0.3.exe) | 설치 안내에 따라 설치한 뒤 쎈doc을 실행하세요. 설치형 1.0.1·1.0.2를 쓰고 있다면 앱의 **설정 · 업데이트**에서 바로 업데이트할 수 있습니다. |
| [무설치 ZIP · 약 228MB](https://github.com/HooniKims/ssen-doc/releases/download/v1.0.3/SsenDoc-1.0.3-x64.zip) | 압축을 **모두 풀고** 폴더 안의 `SsenDoc.exe`를 실행하세요. 실행 파일만 따로 옮기면 동작하지 않습니다. |

Windows 10/11 x64용입니다. 코드 서명이 없어 SmartScreen 경고가 나타날 수 있습니다. 배포 출처와 [SHA-256 목록](https://github.com/HooniKims/ssen-doc/releases/download/v1.0.3/SHA256SUMS.txt)을 확인하세요. `latest.yml`과 `.blockmap`은 업데이트용 파일이므로 직접 실행할 필요가 없습니다.

AI 맞춤법 검사는 최초 1회 모델 다운로드(약 400MB)가 필요합니다. 규칙 기반 검사는 다운로드 없이 바로 사용 가능합니다.

## 저작권과 이용약관

© 2026 상명초 김승현, 등촌중 김형훈. All rights reserved.

설치 파일은 이 페이지에서만 받아 주세요. 다른 곳에 다시 올리지 말고 이 주소를 안내해 주세요. 약관 전문은 [LICENSE](https://github.com/HooniKims/ssen-doc/blob/v1.0.3/LICENSE)에 있습니다.
