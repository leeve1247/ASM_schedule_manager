export interface SearchDraft {
  type: 'title' | 'author';
  keyword: string;
}

export type SearchCallback = (type: 'title' | 'author', keyword: string) => void;

export function createSearchRow(
  searchDraft: SearchDraft,
  onSearchChange: SearchCallback,
  onSearchSubmit: SearchCallback,
  onSearchReset: () => void
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'asm-search-row';
  let isComposing = false;

  const select = document.createElement('select');
  select.className = 'asm-search-select';

  const titleOption = document.createElement('option');
  titleOption.value = 'title';
  titleOption.textContent = '제목';

  const authorOption = document.createElement('option');
  authorOption.value = 'author';
  authorOption.textContent = '작성자';

  select.appendChild(titleOption);
  select.appendChild(authorOption);
  select.value = searchDraft.type;

  const input = document.createElement('input');
  input.className = 'asm-search-input';
  input.type = 'text';
  input.placeholder = '검색어를 입력해주세요.';
  input.value = searchDraft.keyword;

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'asm-search-btn';
  searchBtn.textContent = '검색';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'asm-search-reset';
  resetBtn.textContent = '초기화';

  select.addEventListener('change', () => {
    onSearchChange(select.value as 'title' | 'author', input.value);
  });

  input.addEventListener('input', () => {
    onSearchChange(select.value as 'title' | 'author', input.value);
  });

  input.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  input.addEventListener('compositionend', () => {
    isComposing = false;
    onSearchChange(select.value as 'title' | 'author', input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.isComposing || isComposing || e.keyCode === 229) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      onSearchSubmit(select.value as 'title' | 'author', input.value);
    }
  });

  searchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onSearchSubmit(select.value as 'title' | 'author', input.value);
  });

  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onSearchReset();
  });

  const searchBox = document.createElement('div');
  searchBox.className = 'asm-search-box';
  searchBox.appendChild(input);
  searchBox.appendChild(searchBtn);

  row.appendChild(select);
  row.appendChild(searchBox);
  row.appendChild(resetBtn);

  return row;
}
