// Personal schedule create/edit modal — replaces the innerHTML version in modal.ts.
// Renders nothing when `open` is false. The shim in modal.tsx forces a fresh
// mount per open via `key`, so form state initializes from props on each open.

import { useState, type FormEvent } from 'react';
import {
  upsertPersonalSchedule,
  type PersonalSchedule,
} from '@features/schedules/personal-schedule';
import { Icon } from '@shared/ui/Icon';
import { cx } from '@shared/ui/cx';
import styles from './PersonalScheduleModal.module.css';
import css from './PersonalScheduleModal.module.css?inline';

export const personalScheduleModalCss = css;

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '30']) {
      out.push(`${String(h).padStart(2, '0')}:${m}`);
    }
  }
  return out;
})();

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addOneHour(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number);
  let endH = h + 1;
  let endM = m;
  if (endH >= 24) {
    endH = 23;
    endM = 30;
  }
  return `${pad2(endH)}:${pad2(endM)}`;
}

export type PersonalScheduleModalMode = 'create' | 'edit';

export interface PersonalScheduleModalProps {
  open: boolean;
  mode: PersonalScheduleModalMode;
  initialDateStr?: string;
  initialSchedule?: PersonalSchedule;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export function PersonalScheduleModal({
  open,
  mode,
  initialDateStr,
  initialSchedule,
  onClose,
  onSaved,
}: PersonalScheduleModalProps) {
  const [title, setTitle] = useState(initialSchedule?.title ?? '');
  const [dateStr, setDateStr] = useState(initialSchedule?.dateStr ?? initialDateStr ?? formatDate(0));
  const [startTime, setStartTime] = useState(initialSchedule?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initialSchedule?.endTime ?? '10:00');
  const [locationType, setLocationType] = useState<'online' | 'offline'>(
    initialSchedule?.locationType ?? 'online',
  );
  const [location, setLocation] = useState(initialSchedule?.location ?? '');
  const [description, setDescription] = useState(initialSchedule?.description ?? '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (startTime >= endTime) {
      alert('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }

    setSaving(true);
    try {
      const id =
        mode === 'edit' && initialSchedule
          ? initialSchedule.id
          : 'personal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      await upsertPersonalSchedule({
        id,
        title,
        dateStr,
        startTime,
        endTime,
        description,
        locationType,
        location,
      });
      await onSaved();
      onClose();
    } catch (error) {
      console.error('SOMA Schedule Manager: Failed to save personal schedule:', error);
      alert(error instanceof Error ? error.message : '개인 일정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const locationPlaceholder =
    locationType === 'offline' ? '장소 또는 주소 (선택)' : '링크 또는 플랫폼 (선택)';

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h4 className={styles.title}>
            <Icon name={mode === 'edit' ? 'pencil' : 'plus'} size={16} />
            <span>{mode === 'edit' ? '개인 일정 수정' : '새 개인 일정 등록'}</span>
          </h4>
          <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="psm-title">
              일정 제목 *
            </label>
            <input
              id="psm-title"
              className={styles.input}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="예: 코딩테스트 스터디, 팀 미팅 등"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="psm-date">
              날짜 *
            </label>
            <div className={styles.dateRow}>
              <input
                id="psm-date"
                className={styles.input}
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
              />
              <div className={styles.presets}>
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => setDateStr(formatDate(0))}
                >
                  오늘
                </button>
                <button
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => setDateStr(formatDate(1))}
                >
                  내일
                </button>
              </div>
            </div>
          </div>

          <div className={styles.rowSplit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="psm-start">
                시작 시간 *
              </label>
              <select
                id="psm-start"
                className={styles.input}
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setEndTime(addOneHour(e.target.value));
                }}
                required
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="psm-end">
                종료 시간 *
              </label>
              <select
                id="psm-end"
                className={styles.input}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>장소 (선택)</label>
            <div className={styles.locTypeRow}>
              <button
                type="button"
                className={cx(styles.locTypeBtn, {
                  [styles.locTypeBtnActive]: locationType === 'online',
                })}
                onClick={() => setLocationType('online')}
              >
                온라인
              </button>
              <button
                type="button"
                className={cx(styles.locTypeBtn, {
                  [styles.locTypeBtnActive]: locationType === 'offline',
                })}
                onClick={() => setLocationType('offline')}
              >
                오프라인
              </button>
            </div>
            <input
              className={cx(styles.input, styles.locInput)}
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={locationPlaceholder}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="psm-desc">
              설명 (선택)
            </label>
            <textarea
              id="psm-desc"
              className={styles.input}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="일정 세부 정보 또는 메모를 입력하세요."
            />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={cx(styles.btn, styles.btnCancel)}
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="submit"
              className={cx(styles.btn, styles.btnSave)}
              disabled={saving}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
