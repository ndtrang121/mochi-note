import {
  ArchiveRestore,
  Languages,
  LayoutGrid,
  List,
  Moon,
  RotateCcw,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import type { Settings } from '../../db/models';
import { DataPortabilityPanel } from '../data-portability/DataPortabilityPanel';
import { StorageUsagePanel } from '../storage/StorageUsagePanel';
import { DriveSyncPanel } from './DriveSyncPanel';

interface UserPreferencesPanelProps {
  onClose: () => void;
}

type PreferenceKey = 'layout' | 'locale' | 'theme';

const THEME_OPTIONS: Array<{ icon: typeof Sun; label: string; value: Settings['theme'] }> = [
  { icon: Sun, label: 'Sáng', value: 'light' },
  { icon: Moon, label: 'Tối', value: 'dark' },
  { icon: Settings2, label: 'Theo hệ thống', value: 'system' },
];

export function UserPreferencesPanel({ onClose }: UserPreferencesPanelProps) {
  const { resetSettings, settings, updateSettings } = useMochiData();
  const [portabilityOpen, setPortabilityOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [saving, setSaving] = useState<PreferenceKey | 'reset' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeSetting(changes: Partial<Settings>, key: PreferenceKey) {
    setSaving(key);
    setStatus(null);
    setError(null);
    try {
      await updateSettings(changes);
      setStatus('Đã lưu tùy chọn.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu tùy chọn.');
    } finally {
      setSaving(null);
    }
  }

  async function resetPreferences() {
    setSaving('reset');
    setStatus(null);
    setError(null);
    try {
      await resetSettings();
      setResetPending(false);
      setStatus('Đã khôi phục tùy chọn mặc định.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể khôi phục tùy chọn.');
    } finally {
      setSaving(null);
    }
  }

  if (portabilityOpen) {
    return <DataPortabilityPanel onClose={() => setPortabilityOpen(false)} />;
  }

  return (
    <div
      className="data-portability-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="preferences-heading"
        aria-modal="true"
        className="data-portability-panel preferences-panel"
        role="dialog"
      >
        <header className="data-portability-panel__header">
          <span><Settings2 aria-hidden="true" size={19} /></span>
          <div>
            <h2 id="preferences-heading">Cài đặt MochiNote</h2>
            <p>Tùy chỉnh giao diện và cách hiển thị ghi chú.</p>
          </div>
          <IconButton aria-label="Đóng cài đặt" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </IconButton>
        </header>

        <fieldset className="preferences-section">
          <legend><Sun aria-hidden="true" size={15} /> Giao diện</legend>
          <div className="preferences-choice-grid">
            {THEME_OPTIONS.map(({ icon: Icon, label, value }) => (
              <button
                aria-pressed={settings?.theme === value}
                className="preferences-choice"
                disabled={saving !== null}
                key={value}
                onClick={() => void changeSetting({ theme: value }, 'theme')}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="preferences-section">
          <legend><LayoutGrid aria-hidden="true" size={15} /> Bố cục ghi chú</legend>
          <div className="preferences-choice-grid preferences-choice-grid--two">
            <button
              aria-pressed={settings?.layout === 'grid'}
              className="preferences-choice"
              disabled={saving !== null}
              onClick={() => void changeSetting({ layout: 'grid' }, 'layout')}
              type="button"
            >
              <LayoutGrid aria-hidden="true" size={17} /><span>Lưới thẻ</span>
            </button>
            <button
              aria-pressed={settings?.layout === 'list'}
              className="preferences-choice"
              disabled={saving !== null}
              onClick={() => void changeSetting({ layout: 'list' }, 'layout')}
              type="button"
            >
              <List aria-hidden="true" size={17} /><span>Danh sách</span>
            </button>
          </div>
        </fieldset>

        <fieldset className="preferences-section">
          <legend><Languages aria-hidden="true" size={15} /> Ngôn ngữ</legend>
          <label className="preferences-select">
            <span>Ngôn ngữ hiển thị</span>
            <select
              aria-label="Ngôn ngữ hiển thị"
              disabled={saving !== null}
              onChange={(event) => void changeSetting({ locale: event.target.value as Settings['locale'] }, 'locale')}
              value={settings?.locale ?? 'vi'}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English (sẵn sàng mở rộng)</option>
            </select>
          </label>
        </fieldset>

        <DriveSyncPanel />

        <StorageUsagePanel />

        <div className="preferences-actions">
          <Button onClick={() => setPortabilityOpen(true)} variant="secondary">
            <ArchiveRestore aria-hidden="true" size={16} /> Sao lưu & phục hồi
          </Button>
          {resetPending ? (
            <div className="preferences-reset-confirm">
              <span>Khôi phục theme, bố cục và ngôn ngữ mặc định?</span>
              <Button disabled={saving !== null} onClick={() => void resetPreferences()} size="small" variant="danger">Xác nhận</Button>
              <Button onClick={() => setResetPending(false)} size="small" variant="ghost">Hủy</Button>
            </div>
          ) : (
            <Button disabled={saving !== null} onClick={() => setResetPending(true)} size="small" variant="ghost">
              <RotateCcw aria-hidden="true" size={14} /> Đặt lại tùy chọn
            </Button>
          )}
        </div>

        {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
        {status ? <p className="data-portability-message" role="status">{status}</p> : null}
      </section>
    </div>
  );
}
