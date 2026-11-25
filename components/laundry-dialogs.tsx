"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Clock3, Plus, X } from "lucide-react";
import {
  CATEGORIES,
  categoryLabel,
  COLORS,
  countdown,
  type LaundryTask,
  type TaskInput,
} from "@/lib/laundry";
import { useCompanions } from "@/lib/companion-store";
import { useLaundry, dispatchLaundry } from "@/lib/laundry-store";

export function Modal({
  title,
  close,
  children,
  className = "",
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]',
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length && !element.matches(":disabled"),
      );
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <span className="eyebrow">晾一晾便签</span>
          <button className="icon-button" onClick={close} aria-label="关闭弹窗">
            <X size={18} />
          </button>
        </div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
const localDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const colorNames = [
  "鼠尾草绿",
  "薰衣草紫",
  "杏桃粉",
  "天空蓝",
  "奶油黄",
  "象牙白",
];
export function TaskForm({
  task,
  close,
  notify,
}: {
  task?: LaundryTask;
  close: () => void;
  notify: (message: string) => void;
}) {
  const { state: companions } = useCompanions();
  const [input, setInput] = useState<TaskInput>(() =>
    task
      ? { ...task }
      : {
          title: "",
          note: "",
          category: "工作",
          color: "sage",
          dueAt: Date.now() + 3600000,
        },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={task ? "编辑便签" : "新建便签"} close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await dispatchLaundry(
              task
                ? { type: "update", id: task.id, input }
                : { type: "add", id: crypto.randomUUID(), input },
            );
            notify(task ? "便签已更新" : "新便签已挂好");
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败，请重试");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          便签标题
          <input
            required
            autoComplete="off"
            maxLength={60}
            placeholder="比如：把今天的灵感剪成视频"
            value={input.title}
            onChange={(e) => setInput({ ...input, title: e.target.value })}
          />
        </label>
        <label className="field">
          提醒搭子
          <select
            value={input.companionId || ""}
            onChange={(e) =>
              setInput({ ...input, companionId: e.target.value || null })
            }
          >
            <option value="">默认搭子（跟随当前陪伴）</option>
            {companions.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label className="field">
            截止时间
            <input
              type="datetime-local"
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  /* Keyboard editing remains available. */
                }
              }}
              required
              value={localDate(input.dueAt)}
              onChange={(e) => {
                const value = new Date(e.target.value).getTime();
                if (Number.isFinite(value))
                  setInput({ ...input, dueAt: value });
              }}
            />
          </label>
          <label className="field">
            分类
            <select
              value={input.category}
              onChange={(e) =>
                setInput({
                  ...input,
                  category: e.target.value as TaskInput["category"],
                })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="quick-dates">
          <span>快捷截止</span>
          {[
            ["30 分钟", 30],
            ["1 小时", 60],
            ["今天晚些", 180],
            ["明天此时", 1440],
          ].map(([label, minutes]) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                setInput({
                  ...input,
                  dueAt: Date.now() + Number(minutes) * 60000,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <span className="field">便签纸色</span>
        <div className="color-options">
          {COLORS.map((c, i) => (
            <button
              type="button"
              key={c}
              aria-label={colorNames[i]}
              aria-pressed={input.color === c}
              className={`swatch color-${c} ${input.color === c ? "selected" : ""}`}
              onClick={() => setInput({ ...input, color: c })}
            >
              {input.color === c && <Check size={13} />}
            </button>
          ))}
        </div>
        <label className="field">
          给自己留句话 <small>选填</small>
          <textarea
            rows={2}
            maxLength={500}
            placeholder="拆小一点，就没那么难了。"
            value={input.note}
            onChange={(e) => setInput({ ...input, note: e.target.value })}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            再想想
          </button>
          <button disabled={busy} type="submit" className="button primary">
            <Plus size={16} />
            {busy ? "正在挂好…" : task ? "保存安排" : "挂上便签"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TaskDetail({
  task,
  now,
  close,
  edit,
  notify,
}: {
  task: LaundryTask;
  now: number;
  close: () => void;
  edit: () => void;
  notify: (message: string) => void;
}) {
  const { state } = useLaundry();
  const { state: friends } = useCompanions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={task.title} close={close} className="task-detail">
      <div
        className="detail-paper"
        style={{ backgroundImage: `url(/memo-pads/${task.color}.png)` }}
      >
        <span>{categoryLabel(task.category)}</span>
        <strong>{task.title}</strong>
        <i>{new Date(task.dueAt).toLocaleDateString("zh-CN")}</i>
      </div>
      <span className="pill">
        {categoryLabel(task.category)}
        {task.demo ? " · 示例待办" : ""}
      </span>
      <p className="detail-countdown">
        <Clock3 size={16} />
        {now ? countdown(task.dueAt, now) : "--:--:--"}
      </p>
      <p className="muted">
        截止{" "}
        {new Date(task.dueAt).toLocaleString("zh-CN", {
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <p className="muted">
        提醒搭子：
        {friends.members.find(
          (m) => m.id === (task.companionId || friends.currentId),
        )?.name || "默认搭子"}
        {state.currentTaskId === task.id ? " · 当前处理" : ""}
        {(task.snoozedUntil || 0) > now
          ? ` · 免催至 ${new Date(task.snoozedUntil!).toLocaleTimeString("zh-CN")}`
          : ""}
      </p>
      <p className="detail-note">
        {task.note || "做完这件事，给自己腾出一点空间。"}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await dispatchLaundry({ type: "complete", id: task.id });
            notify("便签已完成");
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败");
            setBusy(false);
          }
        }}
      >
        <Check size={17} />
        {busy ? "正在收好…" : "完成便签"}
      </button>
      <div className="heading-actions">
        {(
          [
            ["start", "开始处理 · 10 分钟免催"],
            ["snooze", "稍后 10 分钟"],
            ["cancel", "取消任务"],
          ] as const
        ).map(([type, label]) => (
          <button
            key={type}
            className="button"
            disabled={busy}
            onClick={async () => {
              try {
                await dispatchLaundry({ type, id: task.id });
                notify(
                  type === "start"
                    ? "正在处理，这件事 10 分钟内免催"
                    : type === "snooze"
                      ? "稍后再提醒，截止时间不变"
                      : "任务已取消，可在历史恢复",
                );
                if (type !== "start") close();
              } catch (e) {
                setError(e instanceof Error ? e.message : "保存失败");
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <button className="text-button" onClick={edit} disabled={busy}>
        编辑便签
      </button>
      <small className="detail-hint">已完成的便签可在看板中重新挂起。</small>
    </Modal>
  );
}
