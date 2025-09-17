# Vinter Map Live

<p align="center">
  <img src="./public/icons/icon.svg" alt="Vinter Map Live 아이콘" width="96" height="96" />
</p>

## 소개

롱빈터(Longvinter) 지도의 좌표를 자동으로 읽어 현재 위치를 맞춰 주는 크롬 확장 프로그램입니다.
화면 속 좌표를 OCR로 인식해 https://vinternote.com/map 에 표시된 캐릭터 위치를 실시간으로 이동시켜 줍니다.
모험 중에도 지도를 일일이 입력할 필요 없이 위치를 추적할 수 있어요.

## 주요 기능

- 빠른 좌표 반영: 캐릭터가 이동하면 약 1초 안에 지도가 자동으로 따라옵니다.
- 손쉬운 위치 확인: 게임 좌표를 직접 입력할 필요 없이 지도에 바로 표시됩니다.
- 클릭 한 번으로 온/오프: 툴바 버튼 하나로 모니터링을 켜거나 끌 수 있어 상황에 맞춰 바로 제어할 수 있습니다.

## 설치

### 크롬 웹 스토어 (권장)

https://chromewebstore.google.com/detail/ackicfohignlljaglffhkhgbofmpnibf

### 개발자 모드로 수동 설치

1. 저장소를 클론한 뒤 `.nvmrc`에 맞춰 Node 버전을 맞추고 의존성을 설치합니다.
   ```bash
   nvm use
   npm install
   ```
2. 빌드 스크립트를 실행합니다.
   ```bash
   npm run build
   ```
   `dist/` 폴더와 `dist.zip` 패키지, 버전이 동기화된 `dist/manifest.json`이 생성됩니다.
3. 크롬 주소창에 `chrome://extensions`를 입력하고 개발자 모드를 켭니다.
4. `압축 해제된 확장 프로그램을 로드합니다` 버튼을 클릭하고 `dist/` 폴더를 선택합니다.

> 저장소: https://github.com/divlook/vinter-map-live

## 사용 방법

1. https://vinternote.com/map 페이지를 열어 둡니다.
2. 크롬 툴바에서 Vinter Map Live 아이콘을 클릭해 모니터링을 시작합니다.
3. 화면 공유 대상에서 Longvinter 게임 창을 선택합니다.
4. 게임 내 좌표가 업데이트되면 확장 프로그램이 좌표를 읽고 지도 위치를 자동으로 이동합니다.
5. 다시 아이콘을 클릭하면 모니터링이 종료되고 화면 공유도 해제됩니다.

## 개발 및 빌드 스크립트

- `npm run dev` – Vite 개발 서버를 실행해 콘텐츠 스크립트를 빠르게 수정합니다.
- `npm run build:content` / `npm run build:background` – 각 엔트리만 단독으로 빌드합니다.
- `npm run build` – 두 엔트리를 모두 빌드하고 `dist/manifest.json` 버전을 `package.json`과 동기화한 뒤 `dist.zip`을 생성합니다.
- `npm run lint` – ESLint로 코드 스타일을 점검합니다.

## 기술 스택

- TypeScript & Vite – 크롬 확장 개발을 위한 모듈 번들링 환경
- Tesseract.js – 게임 화면에서 좌표 텍스트를 OCR로 추출
- Canvas API – 그레이스케일/대비/이진화 전처리 및 업스케일 처리

## 권한 및 개인정보

- `getDisplayMedia`를 통해 사용자가 선택한 화면(게임 창)만 캡처합니다. 캡처된 이미지는 브라우저 내부에서만 처리되며 외부로 전송되지 않습니다.
- manifest 권한(`activeTab`, `scripting`)은 지도 페이지에 스크립트를 삽입하고 상호작용하기 위한 최소 범위입니다.
