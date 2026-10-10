# 출처와 라이선스

- 문서 대조: [HooniKims/moa-review](https://github.com/HooniKims/moa-review), 로컬 쎈Pick 1.4.4 소스를 `modules/review`로 가져왔습니다.
- HWPX 압축: [HooniKims/ssen-lite](https://github.com/HooniKims/ssen-lite), 로컬 쎈Lite 1.1.0 소스를 `modules/lite`로 가져왔습니다. 원본 작업 폴더는 수정하지 않았습니다. 두 프로젝트에 별도 LICENSE 파일이 없어 공개 재배포 시 소유자의 이용 허락 범위를 확인해야 합니다.
- 단어 목록: FrequencyWords 2018 한국어 50k, 데이터 CC-BY-SA-4.0. 원본과 저작자·라이선스 고지는 `assets/WORDLIST-NOTICE.txt`에 있습니다.
- Qwen3 0.6B GGUF: unsloth/Qwen3-0.6B-GGUF, 기반 모델 Qwen, Apache-2.0. 설치 파일에 포함하지 않고 사용자의 선택으로 다운로드합니다. 다운로드 URL과 SHA-256은 `src/ai/models.json`에 있습니다.
- GhanaChocolate와 Pretendard: 기존 앱의 글꼴·고지를 함께 가져왔습니다. 글꼴 파일과 동봉 고지는 `assets/`, `modules/*/assets/`, `build/`에 있습니다.
- Electron, electron-builder, electron-updater, node-llama-cpp, sharp, fflate, diff, XML/ZIP 라이브러리 등의 버전은 `package-lock.json`, 각 패키지의 라이선스는 설치된 패키지 안에 있습니다. Electron/Chromium 라이선스는 배포 폴더에 포함됩니다.

외부 맞춤법 검사 서비스를 사용하지 않습니다.
