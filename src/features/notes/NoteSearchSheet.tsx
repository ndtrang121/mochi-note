import { Search, SlidersHorizontal, X } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type { Folder, NoteColor } from '../../db/models';
import type { NoteDateFilter } from './noteDateFilter';

export type NoteColorFilter = 'all' | NoteColor;

export interface NoteFilters {
  color: NoteColorFilter;
  created: NoteDateFilter;
  favorite: boolean;
  folderId: string;
  pinned: boolean;
}

interface NoteSearchSheetProps {
  filters: NoteFilters;
  folders: Folder[];
  onClose: () => void;
  onFiltersChange: (filters: NoteFilters) => void;
  onQueryChange: (query: string) => void;
  query: string;
  resultCount: number;
}

const COLORS: ReadonlyArray<{ label: string; value: NoteColorFilter }> = [
  { value: 'all', label: 'Tất cả màu' },
  { value: 'yellow', label: 'Vàng' },
  { value: 'peach', label: 'Cam đào' },
  { value: 'blush', label: 'Hồng' },
  { value: 'lilac', label: 'Tím' },
  { value: 'blue', label: 'Xanh lam' },
  { value: 'sage', label: 'Xanh lá' },
];

export const EMPTY_NOTE_FILTERS: NoteFilters = {
  color: 'all',
  created: 'all',
  favorite: false,
  folderId: '',
  pinned: false,
};

export function NoteSearchSheet({
  filters,
  folders,
  onClose,
  onFiltersChange,
  onQueryChange,
  query,
  resultCount,
}: NoteSearchSheetProps) {
  function updateFilter(values: Partial<NoteFilters>) {
    onFiltersChange({ ...filters, ...values });
  }

  function reset() {
    onQueryChange('');
    onFiltersChange(EMPTY_NOTE_FILTERS);
  }

  return (
    <div className="note-search-backdrop">
      <Surface
        aria-labelledby="note-search-heading"
        aria-modal="true"
        className="note-search-sheet"
        raised
        role="dialog"
      >
        <header>
          <span className="note-search-sheet__icon">
            <SlidersHorizontal aria-hidden="true" size={17} />
          </span>
          <div>
            <h2 id="note-search-heading">Tìm kiếm & lọc</h2>
            <p>{resultCount} ghi chú phù hợp</p>
          </div>
          <IconButton aria-label="Đóng tìm kiếm" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </IconButton>
        </header>

        <label className="note-search-field">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">Từ khóa tìm kiếm</span>
          <input
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Tiêu đề hoặc nội dung..."
            type="search"
            value={query}
          />
        </label>

        <div className="note-filter-grid">
          <label>
            <span>Thư mục</span>
            <select
              aria-label="Lọc theo thư mục"
              onChange={(event) => updateFilter({ folderId: event.target.value })}
              value={filters.folderId}
            >
              <option value="">Tất cả thư mục</option>
              <option value="none">Không có thư mục</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Màu</span>
            <select
              aria-label="Lọc theo màu"
              onChange={(event) => updateFilter({ color: event.target.value as NoteColorFilter })}
              value={filters.color}
            >
              {COLORS.map((color) => (
                <option key={color.value} value={color.value}>{color.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ngày tạo</span>
            <select
              aria-label="Lọc theo ngày tạo"
              onChange={(event) => updateFilter({ created: event.target.value as NoteDateFilter })}
              value={filters.created}
            >
              <option value="all">Tất cả ngày</option>
              <option value="today">Hôm nay</option>
              <option value="week">Tuần này</option>
              <option value="month">Tháng này</option>
            </select>
          </label>
        </div>

        <div className="note-filter-toggles" aria-label="Bộ lọc trạng thái">
          <button
            aria-pressed={filters.pinned}
            onClick={() => updateFilter({ pinned: !filters.pinned })}
            type="button"
          >
            Đã ghim
          </button>
          <button
            aria-pressed={filters.favorite}
            onClick={() => updateFilter({ favorite: !filters.favorite })}
            type="button"
          >
            Yêu thích
          </button>
        </div>

        <footer>
          <Button onClick={reset} size="small" variant="ghost">Đặt lại</Button>
          <Button onClick={onClose} size="small">Xem kết quả</Button>
        </footer>
      </Surface>
    </div>
  );
}
