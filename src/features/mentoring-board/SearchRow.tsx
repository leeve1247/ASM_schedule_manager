// Search input for the mentoLec board — type (title/author) + keyword,
// with IME-safe Enter handling and a reset button. Parent bumps
// `focusVersion` to refocus the input after a submit-driven re-render.

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

export type SearchType = 'title' | 'author';

export interface SearchState {
  type: SearchType;
  keyword: string;
}

export interface SearchRowProps {
  draft: SearchState;
  focusVersion: number;
  onChange(next: SearchState): void;
  onSubmit(next: SearchState): void;
  onReset(): void;
}

export function SearchRow({
  draft,
  focusVersion,
  onChange,
  onSubmit,
  onReset,
}: SearchRowProps) {
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusVersion === 0) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, [focusVersion]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 한글 IME 조합 중 Enter 는 무시
    if (e.nativeEvent.isComposing || isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(draft);
    }
  };

  return (
    <div className="asm-search-row">
      <select
        className="asm-search-select"
        value={draft.type}
        onChange={(e) => onChange({ ...draft, type: e.target.value as SearchType })}
      >
        <option value="title">제목</option>
        <option value="author">작성자</option>
      </select>
      <div className="asm-search-box">
        <input
          ref={inputRef}
          className="asm-search-input"
          type="text"
          placeholder="검색어를 입력해주세요."
          value={draft.keyword}
          onChange={(e) => onChange({ ...draft, keyword: e.target.value })}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            onChange({ ...draft, keyword: (e.target as HTMLInputElement).value });
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="asm-search-btn"
          onClick={(e) => {
            e.preventDefault();
            onSubmit(draft);
          }}
        >
          검색
        </button>
      </div>
      <button
        type="button"
        className="asm-search-reset"
        onClick={(e) => {
          e.preventDefault();
          onReset();
        }}
      >
        초기화
      </button>
    </div>
  );
}
