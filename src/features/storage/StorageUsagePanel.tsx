import { CheckCircle2, FolderKanban, LayoutDashboard, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';

interface DataOverview {
  completedTaskCount: number;
  folderCount: number;
  rootFolderCount: number;
  stickyCount: number;
  trashedStickyCount: number;
  taskCount: number;
}

export function DataOverviewPanel() {
  const { dataRevision, repositories } = useMochiData();
  const [overview, setOverview] = useState<DataOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!repositories) return;
    setLoading(true);
    setError(null);

    try {
      // These repositories are independent, so loading them together keeps Settings responsive.
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
      setError(caught instanceof Error ? caught.message : 'Không thể tổng hợp dữ liệu MochiNote.');
    } finally {
      setLoading(false);
    }
  }, [repositories]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [dataRevision, loadOverview]);

  return (
    <fieldset className="preferences-section data-overview-section">
      <legend><LayoutDashboard aria-hidden="true" size={15} /> Tổng quan dữ liệu</legend>
      <p className="data-overview__intro">Ba loại dữ liệu chính đang được lưu trong MochiNote.</p>
      {loading ? <p className="data-overview__muted" role="status">Đang tổng hợp dữ liệu…</p> : null}
      {!loading && overview ? (
        <div className="data-overview__grid">
          <article className="data-overview__item data-overview__item--tasks">
            <span className="data-overview__icon"><CheckCircle2 aria-hidden="true" size={17} /></span>
            <div>
              <strong data-testid="data-overview-tasks">{overview.taskCount}</strong>
              <span>Nhiệm vụ</span>
              <small>{overview.completedTaskCount} đã hoàn thành</small>
            </div>
          </article>
          <article className="data-overview__item data-overview__item--sticky">
            <span className="data-overview__icon"><StickyNote aria-hidden="true" size={17} /></span>
            <div>
              <strong data-testid="data-overview-sticky">{overview.stickyCount}</strong>
              <span>Sticky</span>
              <small>{overview.trashedStickyCount} trong thùng rác</small>
            </div>
          </article>
          <article className="data-overview__item data-overview__item--folders">
            <span className="data-overview__icon"><FolderKanban aria-hidden="true" size={17} /></span>
            <div>
              <strong data-testid="data-overview-folders">{overview.folderCount}</strong>
              <span>Thư mục</span>
              <small>{overview.rootFolderCount} thư mục gốc</small>
            </div>
          </article>
        </div>
      ) : null}
      {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
    </fieldset>
  );
}
