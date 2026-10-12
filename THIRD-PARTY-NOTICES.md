# 출처와 라이선스

> 이 앱 자체 코드는 LICENSE(이용약관)를 따르며, 아래 구성 요소는 각자의 라이선스를 따릅니다.

- 문서 대조: [HooniKims/moa-review](https://github.com/HooniKims/moa-review), 로컬 쎈Pick 1.4.4 소스를 `modules/review`로 가져왔습니다.
- HWPX 압축: [HooniKims/ssen-lite](https://github.com/HooniKims/ssen-lite), 로컬 쎈Lite 1.1.0 소스를 `modules/lite`로 가져왔습니다. 원본 작업 폴더는 수정하지 않았습니다. 두 프로젝트에 별도 LICENSE 파일이 없어 공개 재배포 시 소유자의 이용 허락 범위를 확인해야 합니다.
- 단어 목록: FrequencyWords 2018 한국어 50k, 데이터 CC-BY-SA-4.0. 원본과 저작자·라이선스 고지는 `assets/WORDLIST-NOTICE.txt`에 있습니다.
- Qwen3 0.6B GGUF: unsloth/Qwen3-0.6B-GGUF, 기반 모델 Qwen, Apache-2.0. 설치 파일에 포함하지 않고 사용자의 선택으로 다운로드합니다. 다운로드 URL과 SHA-256은 `src/ai/models.json`에 있습니다.
- Cafe24 PRO Slim Air/Max(카페24)와 학교안심 자연(KERIS): 화면 글꼴로 포함합니다. SIL OFL 1.1 원문과 출처는 `assets/FONT-NOTICE.txt`, `assets/licenses/`에 있습니다. 가나초콜릿체는 윤곽선 SVG 로고 제작에만 사용하며 TTF는 설치 파일에 포함하지 않습니다. Pretendard는 설치 프로그램에 사용하며 기존 글꼴 고지는 `assets/`, `modules/*/assets/`, `build/`에 있습니다.
- Electron, electron-builder, electron-updater, node-llama-cpp, sharp, fflate, diff, XML/ZIP 라이브러리 등의 버전은 `package-lock.json`, 각 패키지의 라이선스는 설치된 패키지 안에 있습니다. Electron/Chromium 라이선스는 배포 폴더에 포함됩니다.
- libvips: sharp가 쓰는 `@img/sharp-win32-x64`의 `libvips-42.dll`입니다. LGPL-3.0-or-later이며, 수정하지 않은 DLL을 그대로 배포합니다. 포함된 libvips와 하위 라이브러리 버전은 같은 패키지의 `versions.json`에, 소스는 https://github.com/libvips/libvips 에 있습니다.
- llama.cpp/ggml: node-llama-cpp(MIT)가 함께 배포하는 `@node-llama-cpp/win-x64`의 `ggml*.dll`, `llama*.dll`, `llama-addon.node`입니다. MIT 라이선스이며 소스는 https://github.com/ggml-org/llama.cpp 에 있습니다.
- OpenHWP: `ssen-hwpx.exe`가 HWPX 목록을 읽는 데 쓰는 [openhwp/openhwp](https://github.com/openhwp/openhwp)의 `hwpx`, `ir`, `primitive` crate입니다(rev `c605402`). MIT 라이선스 원문은 `modules/lite/assets/OpenHWP-LICENSE.txt`에 있습니다.
- `ssen-hwpx.exe`에 정적으로 들어가는 Rust crate: serde, serde_json, quick-xml, memchr, itoa, zmij와 빌드용 proc-macro2, quote, syn, unicode-ident. 버전은 `modules/lite/native/Cargo.lock`, 라이선스는 각 crate의 crates.io 메타데이터에 있습니다(serde 계열은 MIT 또는 Apache-2.0, quick-xml은 MIT, memchr는 Unlicense 또는 MIT).

외부 맞춤법 검사 서비스를 사용하지 않습니다.
