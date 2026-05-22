# Cloudflare Alarm Worker

브라우저가 꺼져 있어도 알림을 보내기 위한 Worker + D1 구성입니다.

## 역할

- 확장 프로그램이 신청한 멘토링 일정을 `/api/public/schedules/sync`로 전송
- Worker가 D1에 일정과 알림 채널 설정 저장
- 공개 동기화 API는 요청당 128KB, 사용자별 30초 최소 간격, 일정 200건 제한을 적용
- Cron Trigger가 5분마다 실행되어 알림이 켜진 사용자에게 **멘토링 시작 1시간 전 Discord 알림 발송 (개인일정은 알림 제외)**

## 준비

1. `cloudflare/wrangler.toml.example`을 `cloudflare/wrangler.toml`로 복사
2. D1 데이터베이스 생성
3. `database_id`를 실제 값으로 교체
4. 의존성 설치
5. 스키마 적용
6. API 토큰 등록

```bash
cd cloudflare
npm install
npx wrangler d1 create asm-schedule-db
npx wrangler d1 execute asm-schedule-db --file=./schema.sql
npx wrangler secret put API_TOKEN
npx wrangler deploy
```

기존 D1 데이터베이스를 운영 중이면 `schema.sql`을 다시 실행하지 말고 migration만 적용합니다.

```bash
cd cloudflare
npx wrangler d1 migrations apply asm-schedule-db
```

## 확장 프로그램 설정값

최초 1회만 아래 값을 저장합니다.

- `소마 계정 이메일`
- `표시 이름`
- `Discord Webhook URL`

## API 예시

```json
{
  "userId": "user@soma.or.kr",
  "clientToken": "64-character-random-client-token",
  "userLabel": "재민",
  "notifyEnabled": true,
  "notificationTargets": {
    "discordWebhookUrl": "https://discord.com/api/webhooks/..."
  },
  "schedules": [
    {
      "sourceEventId": "12345",
      "title": "백엔드 멘토링",
      "lectureType": "자유 멘토링",
      "mentorName": "홍길동",
      "startsAt": "2026-05-28T14:00:00+09:00",
      "endsAt": "2026-05-28T15:00:00+09:00",
      "location": "온라인",
      "status": "접수완료",
      "detailUrl": "https://www.swmaestro.ai/...",
      "cancelable": true
    }
  ]
}
```

## 주의

- 확장 프로그램이 Cloudflare와 동기화한 일정만 외부 알림 대상입니다.
- 알림은 `users.notify_enabled = 1`인 사용자에게만 발송됩니다.
- 현재 알림 시점은 **멘토링 시작 1시간 전 1회**로 고정입니다.
- **개인일정(크롬 로컬 스토리지에만 저장되는 일정)은 서버에 전송되지 않으며 알림이 가지 않습니다. (오직 SOMA 공식 접수내역의 멘토링/특강 일정만 알림 발송)**
