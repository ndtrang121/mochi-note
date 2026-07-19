import { Bell, BellOff } from 'lucide-react';

import { Surface } from '../../components/ui/Surface';
import type { Reminder } from '../../db/models';

export type ReminderRepeatRule = 'FREQ=DAILY' | 'FREQ=WEEKLY' | null;

export interface ReminderDraft {
  enabled: boolean;
  localDateTime: string;
  offsetMinutes: number;
  repeatRule: ReminderRepeatRule;
}

interface TaskReminderSchedule {
  dueDate: string;
  dueTime: string;
  repeatRule: string | null;
}

interface ReminderFieldsProps {
  draft: ReminderDraft;
  onChange: (draft: ReminderDraft) => void;
  taskSchedule?: TaskReminderSchedule;
}

export const EMPTY_REMINDER_DRAFT: ReminderDraft = {
  enabled: false,
  localDateTime: '',
  offsetMinutes: 0,
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
    offsetMinutes: reminder.offsetMinutes ?? 0,
    repeatRule:
      reminder.repeatRule === 'FREQ=DAILY' || reminder.repeatRule === 'FREQ=WEEKLY'
        ? reminder.repeatRule
        : null,
  };
}

export function ReminderFields({ draft, onChange, taskSchedule }: ReminderFieldsProps) {
  return (
    <Surface className="note-reminder-fields">
      <div className="note-reminder-fields__heading">
        <span>{draft.enabled ? <Bell aria-hidden="true" size={18} /> : <BellOff aria-hidden="true" size={18} />}</span>
        <div>
          <strong>Nhắc nhở</strong>
          <small>{taskSchedule ? 'Tự bám theo hạn và lịch lặp của task' : 'Thông báo cục bộ trên trình duyệt'}</small>
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
      {draft.enabled && taskSchedule ? (
        <div className="note-reminder-fields__controls note-reminder-fields__controls--task">
          <label>
            <span>Nhắc vào</span>
            <select
              aria-label="Nhắc trước hạn"
              onChange={(event) => onChange({ ...draft, offsetMinutes: Number(event.target.value) })}
              value={draft.offsetMinutes}
            >
              <option value="0">Đúng giờ đến hạn</option>
              <option value="10">Trước 10 phút</option>
              <option value="30">Trước 30 phút</option>
              <option value="60">Trước 1 giờ</option>
            </select>
          </label>
          <p>
            {taskSchedule.dueTime
              ? `${taskSchedule.repeatRule ? 'Lặp theo lịch task' : 'Nhắc một lần'} · ${taskSchedule.dueDate} ${taskSchedule.dueTime}`
              : 'Hãy chọn thời gian cho task để bật nhắc nhở.'}
          </p>
        </div>
      ) : draft.enabled ? (
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
