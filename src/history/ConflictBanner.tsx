// Conflict banner — replaces the innerHTML version in conflict-banner.ts.
// One component, two variants ('personal' = warning, 'mentoring' = block).

import { cx } from '../lib/cx';
import { Icon } from '../lib/Icon';
import styles from './ConflictBanner.module.css';
import css from './ConflictBanner.module.css?inline';

export const conflictBannerCss = css;

export type ConflictBannerVariant = 'personal' | 'mentoring';

export interface ConflictBannerProps {
  variant: ConflictBannerVariant;
  mentoringTime: string;
  conflictTitle: string;
  conflictStart: string;
  conflictEnd: string;
  // Only used for the personal variant.
  manageUrl?: string;
}

const COPY = {
  personal: {
    title: '개인 일정과 중복되는 멘토링입니다',
    desc: '현재 선택하신 멘토링 시간대에 겹치는 개인 일정이 등록되어 있습니다. 신청은 가능하지만 일정이 중복될 수 있으니 확인 후 신청해 주세요.',
    conflictLabel: '개인 일정',
  },
  mentoring: {
    title: '멘토링 일정과 중복되는 멘토링입니다',
    desc: '이미 접수한 멘토링 일정과 시간대가 겹쳐 신청이 제한됩니다. 기존 접수를 취소하거나 다른 멘토링을 선택해 주세요.',
    conflictLabel: '기존 멘토링 시간',
  },
} as const;

export function ConflictBanner({
  variant,
  mentoringTime,
  conflictTitle,
  conflictStart,
  conflictEnd,
  manageUrl,
}: ConflictBannerProps) {
  const copy = COPY[variant];

  return (
    <div
      className={cx(styles.banner, {
        [styles['banner--personal']]: variant === 'personal',
        [styles['banner--mentoring']]: variant === 'mentoring',
      })}
    >
      <div className={styles.banner__icon}>
        <Icon name="alertTriangle" size={24} />
      </div>
      <div className={styles.banner__content}>
        <div className={styles.banner__title}>{copy.title}</div>
        <div className={styles.banner__desc}>{copy.desc}</div>

        <div className={styles.banner__timeline}>
          <div className={styles.banner__rows}>
            <div className={styles.banner__row}>
              <span className={cx(styles.banner__label, styles['banner__label--mentoring'])}>
                아래 멘토링 시간
              </span>
              <span className={styles.banner__value}>{mentoringTime}</span>
            </div>
            <div className={styles.banner__row}>
              <span className={cx(styles.banner__label, styles['banner__label--personal'])}>
                {copy.conflictLabel}
              </span>
              <span className={styles.banner__value}>
                <strong className={styles['banner__value-title']}>"{conflictTitle}"</strong>
                <span className={styles['banner__value-time']}>
                  ({conflictStart} ~ {conflictEnd})
                </span>
              </span>
            </div>
          </div>
          {variant === 'personal' && manageUrl && (
            <div className={styles.banner__action}>
              <a className={styles.banner__link} href={manageUrl}>
                개인 일정 수정하기
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
