# ASM Schedule Manager

소프트웨어 마에스트로(AI·SW Maestro) 마이페이지 일정을 더 편하게 확인하고 관리할 수 있는 Chrome 확장 프로그램입니다.

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
```

2. Chrome 주소창에 `chrome://extensions/`를 입력합니다.
3. 우측 상단의 `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램을 로드합니다` 버튼을 클릭합니다.
5. 복제한 `ASM_schedule_manager` 폴더를 선택합니다.
6. 확장 프로그램을 활성화한 뒤 소프트웨어 마에스트로 홈페이지에 접속합니다.

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
