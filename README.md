# ASM Schedule Manager

소프트웨어 마에스트로(AI·SW Maestro) 마이페이지 일정을 더 편하게 확인하고 관리할 수 있는 Chrome 확장 프로그램입니다.

## 원본 레포와의 차이점

이 레포는 [woals00/ASM_schedule_manager](https://github.com/woals00/ASM_schedule_manager) 의 `7e79490` (Polish history schedule interactions) 시점에서 분기했습니다. 이후 다음 변경이 추가됐습니다.

### 새 기능
- **Google Calendar 연동** — 본인의 Google 캘린더에 등록되지 않은 멘토링/특강을 호박색으로 하이라이트해서 export 누락을 시각화.
- **로컬 ICS 익스포트** — 기존 Cloudflare 알림과 독립적으로 강의를 ICS 파일로 내려받아 다른 캘린더에 import 가능.
- **history 페이지 새로고침 버튼** — 캐시 무효화 후 즉시 재파싱.
- **단계별 로딩 표시 + 오늘 우선 장소 fetch** — 자유 멘토링 캘린더 패널 헤더에 현재 단계(`강의 목록 동기화 중…`, `장소 정보 가져오는 중… (N/M)`)와 진행도를 표시. 강의 상세(`view.do`) fetch 순서를 오늘 → 미래 일자 순으로 정렬해, 사용자가 우선 보는 정보가 먼저 캐시에 채워지도록 함.
- **Cloudflare 알림 게이트** — 알림 기능을 옵션화해 Cloudflare DB 없이도 캘린더만 사용 가능.
- **확장 아이콘 추가**.

### 버그 수정
- 멘토가 삭제한 강의가 history 캘린더에 잔존하던 문제 수정.

### 내부 구조 변경
- **Vite + TypeScript 빌드** 로 전환. 기존 단일 `.js` 파일을 모듈 분할.
- `src/lib/` (공유), `src/content/` (목록 페이지), `src/history/` (접수 내역/상세 페이지) 로 디렉토리 분리.
- 확장 ID 를 manifest `key` 필드로 고정 — PC 옮겨도 Google OAuth client 가 동일하게 동작.
- UI 이모지를 **Lucide 아이콘 (SVG)** 으로 일괄 교체 — 폰트/플랫폼 차이로 인한 렌더링 불일치 제거.
- 접수 내역 페이지 첫 로딩 시 헤더+스켈레톤을 즉시 표시하고 강의 상세 fetch 완료 후 캘린더로 교체 — 콜드 캐시 대기 시간 동안의 빈 화면 제거.
- **자동 버전 관리** — `npm run build` 가 매 실행마다 `package.json` 의 patch 버전을 1 증가시키고, 그 값이 `dist/manifest.json` 의 `version` 으로 자동 주입됨 (`scripts/bump-version.mjs`).

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
git clone https://github.com/woals00/ASM_schedule_manager.git
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
