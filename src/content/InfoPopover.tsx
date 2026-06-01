// "!" button + popover explaining the panel's auto-refresh cadence.
// Outside-click close uses e.composedPath() so it works across the
// shadow boundary that wraps the mentoLec panel.

import { useEffect, useRef } from 'react';
import { cx } from '../lib/cx';

export interface InfoPopoverProps {
  open: boolean;
  onToggle(): void;
  onClose(): void;
}

export function InfoPopover({ open, onToggle, onClose }: InfoPopoverProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handler = (e: globalThis.MouseEvent) => {
      const path = e.composedPath();
      if (!path.includes(wrap)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open, onClose]);

  return (
    <div className="asm-panel-info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="asm-panel-info-btn"
        title="자동 갱신 안내"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        !
      </button>
      <div
        className={cx('asm-panel-info-popover', { 'asm-panel-info-popover--open': open })}
        aria-hidden={!open}
      >
        <div className="asm-info-title">자동 갱신 주기</div>
        <table className="asm-info-table">
          <tbody>
            <tr>
              <td>수강자수</td>
              <td>
                <b>5분</b>
              </td>
            </tr>
            <tr>
              <td>제목 · 시간 · 상태 · 장소</td>
              <td>
                <b>4시간</b>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="asm-info-divider" />
        <div className="asm-info-subtitle">새로고침이 필요한 경우</div>
        <ul className="asm-info-list">
          <li>방금 신청했는데 수강자수가 아직 반영이 안 됐을 때</li>
          <li>장소·시간이 변경됐다는 공지를 봤을 때</li>
          <li>갱신 주기 전에 즉시 최신 정보가 필요할 때</li>
        </ul>
      </div>
    </div>
  );
}
