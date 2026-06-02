import { getLectureDateBounds } from '@shared/date/date-time';
import { getCancelDeadlineHours } from '@shared/soma/location';

export function isLectureCancelable(
  dateTimeText: string | undefined | null,
  locationText: string | undefined | null
): boolean {
  const bounds = getLectureDateBounds(dateTimeText);
  if (!bounds) return false;

  const deadlineHours = getCancelDeadlineHours(locationText);
  const deadlineTime = new Date(bounds.start.getTime() - deadlineHours * 60 * 60 * 1000);
  return new Date() < deadlineTime;
}

export function triggerCancellation(somaLectureId: string): void {
  const rows = document.querySelectorAll('.boardlist table tbody tr');
  for (const row of rows) {
    const a = row.querySelector<HTMLAnchorElement>('.tit.popuser a');
    if (a && (a.getAttribute('href') || '').includes(`qustnrSn=${somaLectureId}`)) {
      const delBtn = row.querySelector<HTMLElement>('[onclick*="delDate"]');
      if (delBtn) {
        delBtn.click();
        return;
      }
    }
  }
  alert('접수 취소 처리기(delDate)를 찾을 수 없습니다. 원래 표에서 취소 버튼을 눌러주십시오.');
}
