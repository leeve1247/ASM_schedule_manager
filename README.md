# ASM Schedule Manager

소프트웨어 마에스트로(AI·SW Maestro) 마이페이지 일정을 더 편하게 확인하고 관리할 수 있는 Chrome 확장 프로그램입니다.

## 원본 레포와의 차이점

이 레포는 [woals00/ASM_schedule_manager](https://github.com/woals00/ASM_schedule_manager) 의 `7e79490` (Polish history schedule interactions) 시점에서 분기했습니다. 이후 다음 변경이 추가됐습니다.

### 새 기능
- **Google Calendar 연동** — `chrome.identity` OAuth 로 본인 Google 캘린더를 조회해, 아직 등록하지 않은 멘토링/특강 카드를 호박색 테두리와 `미등록` 리본으로 하이라이트합니다. (`qustnrSn` 정확 매칭)<br>
<img width="400" height="300" alt="image" src="https://github.com/user-attachments/assets/c9c4fe05-f917-4513-b0ff-2c148211a360" /><br>
<img width="400" height="450" alt="image" src="https://github.com/user-attachments/assets/cea20768-8fab-479f-ae5c-d075584bbbb2" /><br>
- **로컬 캘린더 익스포트** — Cloudflare 알림과 독립적으로, 각 일정을 Google Calendar 등록 링크 또는 RFC 5545 `.ics` 파일로 내려받아 다른 캘린더에 import 할 수 있습니다. (서버 없이 클라이언트에서만 동작)<br>
<img width="300" height="88" alt="image" src="https://github.com/user-attachments/assets/b6eb0c72-62c7-4391-b663-0515c063b20d" /><br>
- **접수 내역 새로고침 버튼** — 강의 상세·캘린더 캐시를 비우고 즉시 재파싱합니다. (방금 신청한 내역이 아직 반영되지 않았을 때 유용)<br>
<img width="300" height="80" alt="image" src="https://github.com/user-attachments/assets/e598bb95-930b-4e79-8c92-fdc85833030d" /><br>
- **단계별 로딩 표시 + 오늘 우선 fetch** — 자유 멘토링 패널 헤더에 현재 단계(`강의 목록 동기화 중…`, `장소 정보 가져오는 중… (N/M)`)와 진행도를 표시합니다. 강의 상세 fetch 순서를 오늘 → 미래 일자 순으로 정렬해, 먼저 보는 정보가 먼저 캐시에 채워지도록 했습니다.<br>
<img width="600" height="200" alt="스크린샷 2026-06-01 233953" src="https://github.com/user-attachments/assets/43e54eec-74dc-4e82-a2bb-5c4241d9b865" /><br>
<img width="600" height="300" alt="스크린샷 2026-06-01 234306" src="https://github.com/user-attachments/assets/40e34311-1558-4506-ad39-5a532f7cf33f" /><br>
- **접수 내역 로딩 스켈레톤** — 콜드 캐시 첫 로딩 시 헤더+스피너 placeholder 를 즉시 렌더해 빈 화면 대기 시간을 없앴습니다.<br>
<img width="3069" height="782" alt="스크린샷 2026-06-01 223331" src="https://github.com/user-attachments/assets/f92cab58-7257-4b77-bab4-d34df0029ae9" /><br>
- **Cloudflare 알림 게이트** — 알림 기능을 플래그로 옵션화해, Cloudflare DB 없이 캘린더 기능만으로도 사용할 수 있습니다.<br>
- **확장 아이콘 추가**.
### 버그 수정
- 멘토가 삭제한 강의(`삭제` 표시)가 접수 내역 캘린더에 `로딩 중…` 카드로 잔존하던 문제를 수정했습니다.
- Google Calendar 매칭 false positive 제거 — 시간만 겹쳐도 매칭되던 fallback 을 없애고 `qustnrSn` 정확 매칭만 사용합니다.
- 확장 ID 를 manifest `key` 로 고정 — 개발 PC 가 바뀌어도 동일한 ID 가 유지돼 Google OAuth client 바인딩이 깨지지 않습니다.
### 내부 구조 변경
- **Vite + TypeScript 빌드로 전환** — 기존 단일 `.js` 파일들을 모듈로 분할하고 산출물을 `dist/` 로 빌드합니다. 전체 소스(background · calendar-export · alarm-client · content · schedule-manager)를 TypeScript 로 마이그레이션했습니다.
- **모듈 구조 재편** — manifest 가 직접 로드하는 코드는 `src/entrypoints/`, 기능 단위 구현은 `src/features/`, 공용 UI·DOM·스토리지·날짜 유틸은 `src/shared/` 로 분리했습니다.
- **React + Shadow DOM 도입** — 충돌 배너 · 개인 일정 모달 · 접수 내역 캘린더 · 자유 멘토링 보드 · 확장 팝업을 명령형 `innerHTML` 에서 React 컴포넌트로 재작성했습니다. UI 를 Shadow DOM 안에 마운트하고 CSS 를 `?inline` 으로 주입해 SOMA 페이지 스타일과 양방향으로 격리하며, 이후 각 컴포넌트를 파일 단위로 나누고 CSS 를 컴포넌트 옆에 co-locate 했습니다.
- **UI 이모지 → Lucide 아이콘(SVG)** — 폰트·플랫폼별 이모지 렌더링 불일치를 제거했습니다.
- **명시적 버전 관리** — `package.json` 의 version 을 `dist/manifest.json` 에 주입하되, `npm run build` 는 patch 버전을 자동으로 올리지 않습니다.
---

# 주요 기능

## 1. 자유 멘토링 / 멘토 특강 캘린더
<img width="3126" height="4198" alt="최종2" src="https://github.com/user-attachments/assets/1ad457bb-d69a-48e8-ae4d-a9283c1d732d" />

- 자유 멘토링과 멘토 특강 일정을 달력 형태로 확인할 수 있습니다.
- 기존 표 형태의 일정 데이터를 4주형 캘린더 카드로 보여줍니다.
- 멘토링과 특강 일정을 구분해 표시합니다.

### 신청 중복 감지
<img width="1569" height="497" alt="image" src="https://github.com/user-attachments/assets/fd806d19-6053-4a78-a3d0-6dcae9f89d27" />

- 멘토링/특강 신청 시간이 기존 멘토 일정과 겹치는지 확인합니다.
- 시간이 겹치면 경고 배너를 표시합니다.
- 중복 신청을 막기 위해 신청 버튼을 비활성화합니다.

<img width="1563" height="496" alt="image" src="https://github.com/user-attachments/assets/fcd51319-cc87-4987-adb9-3b7088f12ec6" />

- 멘토링/특강 신청 시간이 개인 일정 시간과 겹치는지 확인합니다. (개인 일정은 접수 내역 캘린더에서 관리)
- 시간이 겹치면 경고 배너를 표시합니다.
- 신청 버튼을 비활성화하지는 않았으나, 신청 시 개인의 주의가 필요합니다.

<img width="508" height="374" alt="KakaoTalk_Photo_2026-05-22-17-48-47" src="https://github.com/user-attachments/assets/9b5bbf9b-00ef-440c-a40c-ce59bb444ad8" />

- 본인이 신청한 강의는 수강중으로 표시합니다.

---

## 2. 접수 내역 개인 캘린더

<img width="3187" height="3870" alt="screencapture-swmaestro-ai-busan-sw-mypage-userAnswer-history-do-2026-05-22-11_34_47" src="https://github.com/user-attachments/assets/8c699a5a-7d32-4f85-8ea1-bd2b74de589d" />


- 접수 내역 페이지에서 개인 일정을 함께 관리할 수 있습니다.
- `chrome.storage.local`을 사용해 개인 일정을 브라우저에 저장합니다.
- `+ 개인 일정 추가` 버튼으로 일정을 등록할 수 있습니다.
- 개인 일정 카드의 `삭제` 버튼으로 일정을 삭제할 수 있습니다.
- 알림의 경우 cloudflare DB를 사용중입니다.
  - 멘토링 일정만 저장되고, 개인 일정은 저장되지 않습니다.
 
---

## 3. 사용 주의 사항

### 자유 멘토링 / 멘토 특강 캘린더에서의 주의 사항

<img width="488" height="86" alt="KakaoTalk_Photo_2026-05-22-17-49-58" src="https://github.com/user-attachments/assets/091546ec-285e-48c7-ab2e-38dec69437e5" />

<img width="280" height="297" alt="KakaoTalk_Photo_2026-05-22-17-50-09" src="https://github.com/user-attachments/assets/3601928f-48d5-4fcb-ab84-95cdc12b2a63" />


- 위 설명과 같이, 내가 신청한 멘토링 내역이 안 보인다면 접수 내역 페이지에 들러서 데이터가 파싱되면 자동으로 반영됩니다.
- 자동 갱신 주기
  - 수강자수	5분
  - 제목·시간·상태·장소	4시간
  - 캐시는 사용자 브라우저의 로컬 저장소에만 저장됩니다.
- 새로고침이 필요한 경우
  - 방금 신청했는데 수강자수가 아직 반영이 안 됐을 때
  - 장소·시간이 변경됐다는 공지를 봤을 때
  - 갱신 주기 전에 즉시 최신 정보가 필요할 때

### 접수 내역 개인 캘린더

<img width="269" height="397" alt="image" src="https://github.com/user-attachments/assets/f8a7a207-6a6f-458c-977e-5f308610cffe" />

- 위 내용과 같이, 현재 알림의 경우에는 베타 서비스로 운영 중입니다. 동시 사용자가 많아지거나 트래픽이 집중되면 Discord 알림이 일시적으로 차단될 수 있습니다.
  - Cloudflare 무료 DB를 사용중이므로, 양해 부탁드립니다.
- 알림 방식
  - Discord 웹훅을 통해 멘토링 일정 시작 1시간 전에 알림 메시지를 전송합니다.
- 알림 대상
  - 멘토링 접수 일정	알림 있음
  - 개인 일정	알림 없음



---

## 사용 방법

1. 저장소를 로컬에 복제합니다.

```bash
git clone https://github.com/leeve1247/ASM_schedule_manager.git
cd ASM_schedule_manager
```

2. 의존성을 설치하고 빌드합니다.

```bash
npm install
npm run build
```

> `npm run build` 가 **성공한 뒤** `package.json` 의 patch 버전이 자동으로 1 증가합니다 (예: `0.0.1` → `0.0.2`). 즉, 이번 빌드 산출물(`dist/manifest.json`)에는 빌드 직전 버전이 들어가고, 증가한 새 버전은 *다음* 빌드용으로 예약됩니다. tsc 나 vite 가 중간에 실패하면 버전은 올라가지 않아 실패한 빌드가 번호를 낭비하지 않습니다.

3. Chrome 주소창에 `chrome://extensions/`를 입력합니다.
4. 우측 상단의 `개발자 모드`를 켭니다.
5. `압축해제된 확장 프로그램을 로드합니다` 버튼을 클릭합니다.
6. 복제 폴더 내의 `dist/` 폴더를 선택합니다.
7. 확장 프로그램을 활성화한 뒤 소프트웨어 마에스트로 홈페이지에 접속합니다.

> 코드를 수정하며 개발하려면 `npm run dev` 로 워치 모드 실행 — 변경 시 `dist/` 가 자동 재빌드되고, 확장은 `chrome://extensions` 의 새로고침 버튼으로 반영합니다.

※ 생각보다 적용이 쉬우니 사용을 추천드립니다!
  - 이후 확장프로그램 등록까지 고려중입니다.

---

## 알림 사용 방법

1. Discord 서버를 새로 생성합니다.

   <img width="896" height="824" alt="image" src="https://github.com/user-attachments/assets/1fb59805-826d-4b12-a07f-3cdb154c000b" />

2. 서버 설정을 누릅니다

   <img width="2546" height="1640" alt="image" src="https://github.com/user-attachments/assets/a9bbdedc-5147-4997-8408-6c22f91c7571" />

3. 연동에서 웹후크를 생성한 후, url을 복사합니다.

   <img width="2680" height="1634" alt="image" src="https://github.com/user-attachments/assets/d8ee1dd5-e510-4e66-9c78-b9f42c2be4ea" />
   
4. 알림 모달창에 입력합니다.

   <img width="680" height="345" alt="image" src="https://github.com/user-attachments/assets/3f0433f2-5d10-4757-b48b-6c089bdcbe92" />
