import { CheckCircle2, FolderKanban, LayoutDashboard, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { useI18n } from '../../i18n/I18nProvider';

interface DataOverview {
  completedTaskCount: number;
  folderCount: number;
  rootFolderCount: number;
  stickyCount: number;
  trashedStickyCount: number;
  taskCount: number;
}

export function DataOverviewPanel() {
  const { t } = useI18n();
  const { dataRevision, repositories } = useMochiData();
  const [overview, setOverview] = useState<DataOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!repositories) return;
    setLoading(true);
    setError(null);

    try {
      const [tasks, notes, folders] = await Promise.all([
        repositories.tasks.list(),
        repositories.notes.list(),
        repositories.folders.list(),
      ]);
      const activeNotes = notes.filter((note) => note.deletedAt === null);

      setOverview({
        completedTaskCount: tasks.filter((task) => task.completedAt !== null).length,
        folderCount: folders.length,
        rootFolderCount: folders.filter((folder) => folder.parentId === null).length,
        stickyCount: activeNotes.length,
        trashedStickyCount: notes.length - activeNotes.length,
        taskCount: tasks.length,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('overview.error'));
    } finally {
      setLoading(false);
    }
  }, [repositories, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [dataRevision, loadOverview]);

  return (
    <fieldset className="preferences-section data-overview-section">
      <legend><LayoutDashboard aria-hidden="true" size={15} /> {t('overview.legend')}</legend>
      <p className="data-overview__intro">{t('overview.intro')}</p>
      {loading ? <p className="data-overview__muted" role="status">{t('overview.loading')}</p> : null}
      {!loading && overview ? (
        <div className="data-overview__grid">
          <article className="data-overview__item data-overview__item--tasks">
            <span className="data-overview__icon"><CheckCircle2 aria-hidden="true" size={17} /></span>
            <div>
              <strong data-testid="data-overview-tasks">{overview.taskCount}</strong>
              <span>{t('overview.tasks')}</span>
              <small>{t('overview.completed', { count: overview.completedTaskCount })}</small>
            </div>
          </article>
          <article className="data-overview__item data-overview__item--sticky">
            <span className="data-overview__icon"><StickyNote aria-hidden="true" size={17} /></span>
            <div>
              <strong data-testid="data-overview-sticky">{overview.stickyCount}</strong>
              <span>{t('overview.sticky')}</span>
              <small>{t('overview.trashed', { count: overview.trashedStickyCount })}</small>
            </div>
          </article>
          <article className="data-overview__item data-overview__item--folders">
            <span className="data-overview__icon"><FolderKanban aria-hidden="true" size={17} /></span>
            <div>
              <strong data-testid="data-overview-folders">{overview.folderCount}</strong>
              <span>{t('overview.folders')}</span>
              <small>{t('overview.rootFolders', { count: overview.rootFolderCount })}</small>
            </div>
          </article>
        </div>
      ) : null}
      {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
    </fieldset>
  );
}
