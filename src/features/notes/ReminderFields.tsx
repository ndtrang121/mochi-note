import { Bell, BellOff } from 'lucide-react';

import { Surface } from '../../components/ui/Surface';
import type { Reminder } from '../../db/models';
import { useI18n } from '../../i18n/I18nProvider';

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
  const { t } = useI18n();
  return (
    <Surface className="note-reminder-fields">
      <div className="note-reminder-fields__heading">
        <span>{draft.enabled ? <Bell aria-hidden="true" size={18} /> : <BellOff aria-hidden="true" size={18} />}</span>
        <div>
          <strong>{t('reminder.heading')}</strong>
          <small>{taskSchedule ? t('reminder.taskHelp') : t('reminder.noteHelp')}</small>
        </div>
        <label className="note-reminder-toggle">
          <span className="sr-only">{t('reminder.enable')}</span>
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
            <span>{t('reminder.notifyAt')}</span>
            <select
              aria-label={t('reminder.beforeDue')}
              onChange={(event) => onChange({ ...draft, offsetMinutes: Number(event.target.value) })}
              value={draft.offsetMinutes}
            >
              <option value="0">{t('reminder.atDueTime')}</option>
              <option value="10">{t('reminder.beforeMinutes', { count: 10 })}</option>
              <option value="30">{t('reminder.beforeMinutes', { count: 30 })}</option>
              <option value="60">{t('reminder.beforeOneHour')}</option>
            </select>
          </label>
          <p>
            {taskSchedule.dueTime
              ? `${taskSchedule.repeatRule ? t('reminder.taskRepeats') : t('reminder.once')} · ${taskSchedule.dueDate} ${taskSchedule.dueTime}`
              : t('reminder.taskNeedsTime')}
          </p>
        </div>
      ) : draft.enabled ? (
        <div className="note-reminder-fields__controls">
          <label>
            <span>{t('reminder.dateTime')}</span>
            <input
              aria-label={t('reminder.dateTimeLabel')}
              max="9999-12-31T23:59"
              onChange={(event) => onChange({ ...draft, localDateTime: event.target.value })}
              required
              type="datetime-local"
              value={draft.localDateTime}
            />
          </label>
          <label>
            <span>{t('reminder.repeat')}</span>
            <select
              aria-label={t('reminder.repeatLabel')}
              onChange={(event) => onChange({
                ...draft,
                repeatRule: event.target.value ? event.target.value as ReminderRepeatRule : null,
              })}
              value={draft.repeatRule ?? ''}
            >
              <option value="">{t('notes.noRepeat')}</option>
              <option value="FREQ=DAILY">{t('tasks.daily')}</option>
              <option value="FREQ=WEEKLY">{t('tasks.weekly')}</option>
            </select>
          </label>
        </div>
      ) : null}
    </Surface>
  );
}
