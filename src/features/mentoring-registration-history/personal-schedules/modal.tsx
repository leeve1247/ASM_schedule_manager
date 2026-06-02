// Thin imperative shim around <PersonalScheduleModal/>. Existing callers
// import `openModalWithDate`, `openModalForEditing`, `injectModalDOM`, and
// `setOnPersonalScheduleSaved`; we keep that surface and translate it into
// React state on a single Shadow DOM mount.

import { mountReact, type MountHandle } from '@shared/dom/react-mount';
import { type PersonalSchedule } from '@features/schedules/personal-schedule';
import {
  PersonalScheduleModal,
  personalScheduleModalCss,
  type PersonalScheduleModalMode,
} from './PersonalScheduleModal';

interface ModalState {
  open: boolean;
  mode: PersonalScheduleModalMode;
  initialDateStr?: string;
  initialSchedule?: PersonalSchedule;
}

let handle: MountHandle | null = null;
let openSeq = 0;
let state: ModalState = { open: false, mode: 'create' };
let onSavedCallback: (() => Promise<void> | void) | null = null;

function render(): void {
  const node = (
    <PersonalScheduleModal
      key={openSeq}
      open={state.open}
      mode={state.mode}
      initialDateStr={state.initialDateStr}
      initialSchedule={state.initialSchedule}
      onClose={() => {
        state = { ...state, open: false };
        render();
      }}
      onSaved={async () => {
        if (onSavedCallback) await onSavedCallback();
      }}
    />
  );

  if (!handle) {
    handle = mountReact(document.body, node, {
      styles: [personalScheduleModalCss],
      hostClass: 'asm-personal-schedule-modal-host',
    });
  } else {
    handle.rerender(node);
  }
}

export function setOnPersonalScheduleSaved(cb: () => Promise<void> | void): void {
  onSavedCallback = cb;
}

// Pre-mount the React tree so the first open is instant. Kept exported for
// backward compat with the mentoring registration history entrypoint.
export function injectModalDOM(): void {
  if (handle) return;
  render();
}

export function openModalWithDate(dateStr?: string): void {
  openSeq++;
  state = {
    open: true,
    mode: 'create',
    initialDateStr: dateStr,
    initialSchedule: undefined,
  };
  render();
}

export function openModalForEditing(ps: PersonalSchedule): void {
  openSeq++;
  state = {
    open: true,
    mode: 'edit',
    initialDateStr: undefined,
    initialSchedule: ps,
  };
  render();
}
