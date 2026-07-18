import { Bell, BellOff } from 'lucide-react';

import { Surface } from '../../components/ui/Surface';
import type { Reminder } from '../../db/models';

export type ReminderRepeatRule = 'FREQ=DAILY' | 'FREQ=WEEKLY' | null;

export interface ReminderDraft {
  enabled: boolean;
  localDateTime: string;
  repeatRule: ReminderRepeatRule;
}

interface ReminderFieldsProps {
  draft: ReminderDraft;
  onChange: (draft: ReminderDraft) => void;
}

export const EMPTY_REMINDER_DRAFT: ReminderDraft = {
  enabled: false,
  localDateTime: '',
  repeatRule: null,
};

export function reminderToDraft(reminder: Reminder | null): ReminderDraft {
  if (!reminder) {
    return EMPTY_REMINDER_DRAFT;
  }

  const date = new Date(reminder.scheduledAt);
  const localDateTime = Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return {
    enabled: reminder.enabled,
    localDateTime,
    repeatRule:
      reminder.repeatRule === 'FREQ=DAILY' || reminder.repeatRule === 'FREQ=WEEKLY'
        ? reminder.repeatRule
        : null,
  };
}

export function ReminderFields({ draft, onChange }: ReminderFieldsProps) {
  return (
    <Surface className="note-reminder-fields">
      <div className="note-reminder-fields__heading">
        <span>{draft.enabled ? <Bell aria-hidden="true" size={18} /> : <BellOff aria-hidden="true" size={18} />}</span>
        <div>
          <strong>Nhắc nhở</strong>
          <small>Thông báo cục bộ trên trình duyệt</small>
        </div>
        <label className="note-reminder-toggle">
          <span className="sr-only">Bật nhắc nhở</span>
          <input
            checked={draft.enabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
            type="checkbox"
          />
        </label>
      </div>
      {draft.enabled ? (
        <div className="note-reminder-fields__controls">
          <label>
            <span>Ngày và giờ</span>
            <input
              aria-label="Ngày và giờ nhắc nhở"
              max="9999-12-31T23:59"
              onChange={(event) => onChange({ ...draft, localDateTime: event.target.value })}
              required
              type="datetime-local"
              value={draft.localDateTime}
            />
          </label>
          <label>
            <span>Lặp lại</span>
            <select
              aria-label="Lặp lại nhắc nhở"
              onChange={(event) => onChange({
                ...draft,
                repeatRule: event.target.value ? event.target.value as ReminderRepeatRule : null,
              })}
              value={draft.repeatRule ?? ''}
            >
              <option value="">Không lặp</option>
              <option value="FREQ=DAILY">Hằng ngày</option>
              <option value="FREQ=WEEKLY">Hằng tuần</option>
            </select>
          </label>
        </div>
      ) : null}
    </Surface>
  );
}
