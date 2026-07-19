import { Command, X } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { SHORTCUT_ROWS } from './keyboardShortcuts';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="shortcut-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-labelledby="shortcut-help-heading" aria-modal="true" className="shortcut-help" role="dialog">
        <header>
          <span aria-hidden="true"><Command size={19} /></span>
          <div><h2 id="shortcut-help-heading">Phím tắt MochiNote</h2><p>Điều hướng nhanh mà không rời bàn phím.</p></div>
          <IconButton aria-label="Đóng trợ giúp phím tắt" onClick={onClose}><X aria-hidden="true" size={18} /></IconButton>
        </header>
        <dl>
          {SHORTCUT_ROWS.map((row) => (
            <div key={row.command}><dt>{row.command}</dt><dd><kbd>{row.keys}</kbd></dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
