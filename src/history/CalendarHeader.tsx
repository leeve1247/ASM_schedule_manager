// Top toolbar of the dashboard calendar: title, week navigation, alarm
// toggle + info popover, refresh, and "+ 개인 일정" button.

import { useEffect, useRef } from 'react';
import { Icon } from '../lib/Icon';
import { cx } from '../lib/cx';
import css from './CalendarHeader.css?inline';

export const calendarHeaderCss = css;

export interface AlarmSettings {
  userId: string;
  discordWebhookUrl: string;
  notificationsEnabled: boolean;
}

export const EMPTY_ALARM_SETTINGS: AlarmSettings = {
  userId: '',
  discordWebhookUrl: '',
  notificationsEnabled: false,
};

function AlarmInfoPopoverBody() {
  return (
    <>
      <div className="alarm-info-notice">
        <div className="alarm-info-notice-title">베타 버전 안내</div>
        <div className="alarm-info-notice-body">
          현재 알림의 경우에는 베타 서비스로 운영 중입니다. 동시 사용자가 많아지거나 트래픽이 집중되면 Discord 알림이 일시적으로 차단될 수 있습니다.
        </div>
      </div>
      <div className="alarm-info-divider" />
      <div className="alarm-info-title">알림 방식</div>
      <div className="alarm-info-body">
        Discord 웹훅을 통해 멘토링 일정 시작 <b>1시간 전</b>에 알림 메시지를 전송합니다.
      </div>
      <div className="alarm-info-divider" />
      <div className="alarm-info-subtitle">알림 대상</div>
      <table className="alarm-info-table">
        <tbody>
          <tr>
            <td>멘토링 접수 일정</td>
            <td>
              <b>알림 있음</b>
            </td>
          </tr>
          <tr>
            <td>개인 일정</td>
            <td>알림 없음</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function AlarmLabel({
  isConfigured,
  notificationsEnabled,
}: {
  isConfigured: boolean;
  notificationsEnabled: boolean;
}) {
  if (!isConfigured) {
    return (
      <>
        <Icon name="bell" size={14} />
        <span>알림 받기</span>
      </>
    );
  }
  if (notificationsEnabled) {
    return (
      <>
        <Icon name="bell" size={14} />
        <span>알림 끄기</span>
      </>
    );
  }
  return (
    <>
      <Icon name="bellOff" size={14} />
      <span>알림 받기</span>
    </>
  );
}

export interface CalendarHeaderProps {
  disabled: boolean;
  alarmEnabled: boolean;
  alarmSettings: AlarmSettings;
  alarmInfoOpen: boolean;
  refreshing: boolean;
  onPrevWeeks(): void;
  onToday(): void;
  onNextWeeks(): void;
  onToggleAlarmInfo(): void;
  onCloseAlarmInfo(): void;
  onToggleAlarm(): void | Promise<void>;
  onAddPersonal(): void;
  onRefresh(): void | Promise<void>;
}

export function CalendarHeader({
  disabled,
  alarmEnabled,
  alarmSettings,
  alarmInfoOpen,
  refreshing,
  onPrevWeeks,
  onToday,
  onNextWeeks,
  onToggleAlarmInfo,
  onCloseAlarmInfo,
  onToggleAlarm,
  onAddPersonal,
  onRefresh,
}: CalendarHeaderProps) {
  const isAlarmConfigured = Boolean(
    alarmSettings.userId && alarmSettings.discordWebhookUrl,
  );
  const alarmChecked = isAlarmConfigured && alarmSettings.notificationsEnabled;

  const alarmInfoWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!alarmInfoOpen) return;
    const wrap = alarmInfoWrapRef.current;
    if (!wrap) return;

    const handler = (e: globalThis.MouseEvent) => {
      const path = e.composedPath();
      if (!path.includes(wrap)) {
        onCloseAlarmInfo();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [alarmInfoOpen, onCloseAlarmInfo]);

  return (
    <div className="calendar-header">
      <div className="calendar-title-group">
        <h3>통합 일정 대시보드</h3>
        <span className="calendar-subtitle">
          접수한 일정과 내 개인 일정을 함께 모아 관리합니다.
        </span>
      </div>
      <div className="calendar-nav-group">
        <button className="control-btn nav-btn" disabled={disabled} onClick={onPrevWeeks}>
          ‹ 2주 전
        </button>
        <button
          className="control-btn nav-btn nav-today"
          disabled={disabled}
          onClick={onToday}
        >
          오늘
        </button>
        <button className="control-btn nav-btn" disabled={disabled} onClick={onNextWeeks}>
          2주 후 ›
        </button>
      </div>
      <div className="calendar-actions">
        {alarmEnabled && (
          <>
            <div className="alarm-info-wrap" ref={alarmInfoWrapRef}>
              <button
                className="alarm-info-btn"
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAlarmInfo();
                }}
              >
                !
              </button>
              <div
                className={cx('alarm-info-popover', {
                  'alarm-info-popover--open': alarmInfoOpen,
                })}
                aria-hidden={!alarmInfoOpen}
              >
                <AlarmInfoPopoverBody />
              </div>
            </div>
            <label className="alarm-toggle-container">
              <span className="alarm-toggle-text">
                <AlarmLabel
                  isConfigured={isAlarmConfigured}
                  notificationsEnabled={alarmSettings.notificationsEnabled}
                />
              </span>
              <span className="asm-switch">
                <input
                  type="checkbox"
                  checked={alarmChecked}
                  disabled={disabled}
                  onChange={() => {
                    void onToggleAlarm();
                  }}
                />
                <span className="asm-slider" />
              </span>
            </label>
          </>
        )}
        <button
          className="control-btn nav-btn"
          title="최신 데이터로 새로고침"
          disabled={disabled || refreshing}
          onClick={() => void onRefresh()}
        >
          {refreshing ? '↻ 새로고침 중…' : '↻ 새로고침'}
        </button>
        <button
          className="control-btn accent"
          disabled={disabled}
          onClick={onAddPersonal}
        >
          + 개인 일정 추가
        </button>
      </div>
    </div>
  );
}
