# 이 PC의 한글 자동화 파일 접근 허용 설정

2026-10-20 사용자가 반복되는 파일 접근 경고를 항상 허용하도록 요청하여 현재 Windows 사용자 계정에 설정했습니다.

- 출처: [한컴 공식 아카이브](https://github.com/hancom-io/devcenter-archive/tree/main/hwp-automation)의 `보안모듈(Automation).zip`.
- 등록 방법: [한컴 공식 안내](https://forum.developer.hancom.com/t/topic/3206). 자동화 세션에서 `RegisterModule("FilePathCheckDLL", "레지스트리 값 이름")`을 호출합니다.
- DLL: `%LOCALAPPDATA%\HancomAutomationModules\FilePathCheckerModuleExample.dll`
- SHA-256: `9ac5b97c47ac8aed1e8bca27a3eef39411361d8f68c262509f0c40a8f9d21bb6`
- 키: `HKEY_CURRENT_USER\Software\HNC\HwpAutomation\Modules`
- 문자열 값 `FilePathCheckerModule`과 `FilePathCheckerModuleExample` 모두 위 DLL의 절대 경로를 가리킵니다. 변경 전 이 키는 없었습니다. 백업 기록은 DLL 폴더의 `registration-backup-20261020.json`입니다.

공식 예제 DLL은 파일 접근을 허용하는 구현입니다. 이 설정을 등록하는 자동화 세션의 파일 접근 확인 창을 생략합니다. 다른 종류의 한글 경고를 모두 끄는 전역 설정은 아닙니다. 이 프로젝트의 검증 스크립트는 이미 `FilePathCheckerModule`을 호출하므로 재실행에도 적용됩니다. 새 세션에서 등록 반환값 `True`, 합성 HWPX 열기 `True`, 저장 `True`를 확인했고, 수동 허용 없이 완료됐습니다.

되돌리려면 위 두 레지스트리 값을 제거한 뒤 한글 자동화 세션을 다시 시작합니다. DLL은 앱 설치본에 포함하지 않았으며 다른 PC의 설정은 바꾸지 않습니다.
