## 프로젝트 개요
SOMA(소프트웨어 마에스트로) 멘토링 페이지 개선용 Chrome 확장. Vite + TypeScript + `vite-plugin-web-extension`.

## 진행 상황 (마지막 갱신: 2026-05-23)

### 완료된 Phase
- 1~5: background → calendar-export → alarm-client → content 의 TS 마이그레이션
- **Phase 6** (`git log --oneline | grep "Phase 6"` 으로 확인): 공유 `src/lib/` 추출 + `content.ts` → `src/content/` 분할
  - `lib/`: storage, cache, safe-url, escape, date-time, location, conflict, personal-schedule, mentoring-schedule
  - `content/`: list-cache, loc-cache, events, card, search-row, panel, index
  - manifest.json 의 mentoLec content_script 경로 갱신됨
  - 빌드 통과 확인 (`npm run build`)
- **Phase 7** (직전 commit, `git log --oneline | grep "Phase 7"` 로 확인): `schedule-manager.js` (1796줄) → `src/history/` 8개 TS 모듈
  - `history/`: types, lecture-detail, lecture-table, cancel, modal, calendar, conflict-banner, index
  - manifest.json 두 번째 content_script 경로 갱신
  - `lib/conflict.ts` 에서 `DateRange`, `toDateRange` export 추가 (history/conflict-banner 가 detail page Date 객체로 충돌 검사 위해 필요)
  - 모달 ↔ 캘린더 refresh 는 `setOnPersonalScheduleSaved` 콜백 setter 패턴 (modal.ts 가 calendar.ts 를 import 하지 않도록)
  - `console.log` 디버그 출력은 원본 유지
  - `dist/src/history/index.js` 36.05 kB, 빌드 통과

### 다음에 할만한 것 (우선순위 낮음)
- `alarm-client.ts` 가 disabled 상태. 활성화 시 추가 분할 검토.
- history/conflict-banner.ts 의 `console.log` 디버그 출력 정리 (정상 동작 확인 후).
- `lib/conflict.ts` 의 `hasPersonalScheduleConflict` / `hasMentoringScheduleConflict` 는 내부적으로 `findConflicting*` 를 호출하도록 단순화 가능 (현재는 each 가 자체 loop).

## 아키텍처 결정

### 디렉토리
```
src/
├── manifest.json
├── background.ts            서비스워커 (Worker fetch 프록시)
├── calendar-export.ts       globalThis.ASMCalendarExport
├── alarm-client.ts          globalThis.ASMAlarmFeature (현재 ALARM_FEATURE_ENABLED=false)
├── lib/                     content/ ↔ history/ 공유 모듈
├── content/                 mentoLec 게시판 (구 content.ts)
└── history/                 userAnswer history + mentoLec/view 상세 (진행 중)
```

### globalThis 통신
각 content_script 는 별도 번들로 분리됨. 다음 globals 로 스크립트간 통신:
- `ASMCalendarExport`: `calendar-export.ts` set / `content/card.ts`·`history/calendar.ts` read
- `ASMAlarmFeature`: `alarm-client.ts` set (현재 no-op) / `history/calendar.ts` read

이 패턴 유지 — ESM import 로 바꾸려면 build 구조까지 손대야 함.

### lib/conflict.ts 의 함수 매핑
- content/ 는 `hasPersonalScheduleConflict`, `hasMentoringScheduleConflict` 사용 (bool 반환)
- history/conflict-banner.ts 에서는 `findConflictingPersonalSchedule`, `findConflictingMentoringSchedule` 사용 권장 (실제 충돌 객체 필요)

### lib/date-time.ts `parseLectureDateTimeText`
schedule-manager.js 의 lax 버전 채택. 1-2자리 시/분, 분 옵셔널, 구분자 `-./` 모두 허용. content/list-cache.ts 의 `parseTableRows` 는 SOMA 리스트 HTML 구조에 종속이라 별도 inline regex 유지.

## 코딩 규약 (이번 세션 합의)
- 사용자 글로벌 CLAUDE.md 의 4원칙 따름: Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution
- TS strict 모드. `any` 회피, 명시 타입.
- 주석은 WHY 가 비자명할 때만. WHAT/현재-작업 참조 주석 금지.
- 단계별 커밋. "Phase N: ..." 형식.
- emoji 는 사용자 요청시에만.

## 빌드 / 검증 한계
- `npm run build` 로 tsc + vite 검증 가능
- 실제 SOMA 사이트 동작은 사용자가 확장 프로그램 로드해서 확인해야 함 (자동화 불가)
- 빌드 산출물은 `dist/` (gitignored)

## history/ TS 마이그레이션 시 주의점
- `lec.dateTimeText.match(...)` → strict 에서 null narrow 필수
- 모든 `chrome.storage.local.get/set` 콜백은 이미 `lib/storage.ts` 의 Promise 래퍼로 대체 가능
- `FIXED_SHARED_SCHEDULES` 는 이미 `lib/personal-schedule.ts` 로 이동했으니 import 만
- `isLectureEnded`, `parseLectureDateTimeText`, `getLectureDateBounds` 도 `lib/date-time.ts` 로 이동 완료
- `getCancelDeadlineHours`, `getCancelPolicyReason`, `classifyLocation` → `lib/location.ts`
- `getSafeSomaUrl`, `escapeHtml` → `lib/safe-url.ts`, `lib/escape.ts`

## 미해결 / 향후 고민
- `alarm-client.ts` 는 현재 disabled. 활성화 시 추가 분할 검토.
- `console.log` debug 출력이 schedule-manager.js 충돌 검사 영역에 다수 있음. 마이그레이션 시 유지하되 추후 정리 고려.

## Google Calendar 연동 (정상 동작, 2026-05-23 확인)
- 매칭 로직: `qustnrSn=<id>` 엄격 매칭. 시간+swmaestro fallback 없음.
- 조회 범위: `calendars/primary/events` 만. 다른 캘린더에 export 했다면 매칭 실패.
- extension ID 는 `manifest.json` 의 `key` 필드로 핀됨 (`hlfijhmnchjningkhadjffipkohejifg`, commit `4e5f389`). 개인키 `asm-ext-key.pem` 은 gitignore — 잃으면 ID 재발급 필요.
- 디버깅 시: `[ASM gcal]` prefix 의 warn 로그만 남아있음 (성공경로 console.log 는 제거됨). 401/403/매칭 실패시 console 에 출력됨.

### 과거 해결 이슈 (참고)
- "bad client id": unpacked 확장 ID 가 PC 마다 달라져 GCP 등록 ID 와 불일치 → manifest `key` 로 고정해 해결.
- `403 응답 오류`: GCP 프로젝트에서 Google Calendar API Library 활성화 안 됨 → 활성화로 해결.
