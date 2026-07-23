import { Command, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { useI18n } from '../../i18n/I18nProvider';
import { SHORTCUT_ROWS } from './keyboardShortcuts';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="shortcut-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-labelledby="shortcut-help-heading" aria-modal="true" className="shortcut-help" role="dialog">
        <header>
          <span aria-hidden="true"><Command size={19} /></span>
          <div><h2 id="shortcut-help-heading">{t('shortcut.heading')}</h2><p>{t('shortcut.description')}</p></div>
          <IconButton aria-label={t('shortcut.closeDialog')} onClick={onClose}><X aria-hidden="true" size={18} /></IconButton>
        </header>
        <dl>
          {SHORTCUT_ROWS.map((row) => (
            <div key={row.commandKey}><dt>{t(row.commandKey)}</dt><dd><kbd>{row.keys}</kbd></dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
