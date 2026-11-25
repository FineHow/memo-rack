"use client";
import { useState } from "react";
import { dispatchLaundry, useLaundry, useClock } from "@/lib/laundry-store";
import type { LaundryTask } from "@/lib/laundry";
import { Modal } from "./laundry-dialogs";
export function TaskHistory({ notify }: { notify: (s: string) => void }) {
  const now = useClock();
  const { state } = useLaundry(),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [restore, setRestore] = useState<LaundryTask | null>(null),
    [due, setDue] = useState(""),
    [error, setError] = useState("");
  const all = state.tasks
    .filter((t) => t.completedAt !== null || t.cancelledAt)
    .sort(
      (a, b) =>
        (b.cancelledAt || b.completedAt || 0) -
        (a.cancelledAt || a.completedAt || 0),
    );
  const rows = all.filter((t) =>
    (t.title + " " + t.note).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="collected-panel">
      <div className="panel-heading">
        <div>
          <h2>全部历史记录</h2>
        </div>
        <span>{all.length} 条</span>
      </div>
      <label className="search-box">
        <input
          placeholder="搜索全部历史"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="done-list">
        {rows.slice(page * 12, page * 12 + 12).map((t) => (
          <div className="done-row" key={t.id}>
            <div>
              <strong>{t.title}</strong>
              <small>
                {t.cancelledAt ? "已取消（不计入完成）" : "已完成"} ·{" "}
                {new Date(t.cancelledAt || t.completedAt!).toLocaleDateString(
                  "zh-CN",
                )}
              </small>
            </div>
            <button
              className="button"
              aria-label={`重新挂起：${t.title}`}
              onClick={() => {
                setRestore(t);
                setDue("");
                setError("");
              }}
            >
              恢复
            </button>
          </div>
        ))}
      </div>
      {!rows.length && <p className="done-empty">暂无匹配历史</p>}
      {rows.length > 12 && (
        <div className="heading-actions">
          <button disabled={!page} onClick={() => setPage((v) => v - 1)}>
            上一页
          </button>
          <span>
            {page + 1} / {Math.ceil(rows.length / 12)}
          </span>
          <button
            disabled={(page + 1) * 12 >= rows.length}
            onClick={() => setPage((v) => v + 1)}
          >
            下一页
          </button>
        </div>
      )}
      {restore && (
        <Modal title="恢复任务" close={() => setRestore(null)}>
          <p>{restore.title}</p>
          <p>
            原截止时间：{new Date(restore.dueAt).toLocaleString("zh-CN")}{" "}
            {restore.dueAt <= now ? "（已过期，保留后将按超时提醒）" : ""}
          </p>
          <label className="field">
            修改截止时间（留空保留原时间）
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <p>确认之前不会触发提醒。</p>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="button" onClick={() => setRestore(null)}>
              取消
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await dispatchLaundry({
                    type: "restore",
                    id: restore.id,
                    ...(due ? { dueAt: new Date(due).getTime() } : {}),
                  });
                  notify("任务已恢复");
                  setRestore(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "恢复失败");
                }
              }}
            >
              确认恢复
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
