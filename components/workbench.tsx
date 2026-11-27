"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Smile,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  Monitor,
  Plus,
  Search,
  Settings2,
  StickyNote,
  Sparkles,
  Wind,
  X,
} from "lucide-react";
import { categoryLabel, CATEGORIES, countdown, urgency } from "@/lib/laundry";
import {
  dispatchLaundry,
  retryLaundry,
  showDesktopWidget,
  useClock,
  useLaundry,
} from "@/lib/laundry-store";
import { Clothesline } from "./clothesline";
import { Modal, TaskDetail, TaskForm } from "./laundry-dialogs";
import { CompanionRack } from "./companion-rack";
import { TaskHistory } from "./task-history";
import { isQuiet } from "@/lib/reminders";
import { StudioDetails } from "./studio-details";
import { CompanionPanel } from "./companion-panel";
import { useDesktopStatus } from "@/lib/use-desktop-status";

export function Workbench() {
  const { state, ready, error, saving } = useLaundry();
  const now = useClock();
  const mac = useDesktopStatus() !== null;
  const quietUntil = state.settings.quietUntil ?? 0;
  const [section, setSection] = useState<"board" | "companion">("board");
  const [filter, setFilter] = useState("全部小事");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<
    "add" | "settings" | "help" | "studio" | null
  >(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [undoId, setUndoId] = useState("");
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const complete = (e: Event) => setUndoId((e as CustomEvent<string>).detail);
    window.addEventListener("laundry-completed", complete);
    const openSection = () => {
      if (location.hash === "#companions") setSection("companion");
      if (location.hash === "#studio") setDialog("studio");
    };
    const id = setTimeout(openSection, 0);
    window.addEventListener("hashchange", openSection);
    return () => {
      clearTimeout(id);
      window.removeEventListener("laundry-completed", complete);
      window.removeEventListener("hashchange", openSection);
    };
  }, []);
  const close = useCallback(() => {
    setDialog(null);
    if (location.hash === "#studio")
      history.replaceState(null, "", location.pathname + location.search);
    setSelectedId(null);
    setEditingId(null);
  }, []);
  const notify = useCallback((message: string) => setToast(message), []);
  const active = state.tasks
    .filter((t) => t.completedAt === null && !t.cancelledAt)
    .sort((a, b) => a.dueAt - b.dueAt);
  const done = state.tasks
    .filter((t) => t.completedAt !== null)
    .sort((a, b) => b.completedAt! - a.completedAt!);
  const today = now ? new Date(now).toDateString() : "";
  const todayDone = done.filter(
    (t) => new Date(t.completedAt!).toDateString() === today,
  );
  const urgent = active.filter(
    (t) =>
      now &&
      ["urgent", "overdue"].includes(
        urgency(t, now, state.settings.urgentMinutes),
      ),
  );
  const filtered = active.filter(
    (t) =>
      (filter === "全部小事" || t.category === filter) &&
      `${t.title} ${t.note}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = state.tasks.find(
    (t) => t.id === selectedId && t.completedAt === null && !t.cancelledAt,
  );
  const editing = state.tasks.find((t) => t.id === editingId);
  const perform = async (
    action: Parameters<typeof dispatchLaundry>[0],
    message: string,
  ) => {
    try {
      await dispatchLaundry(action);
      notify(message);
    } catch (e) {
      notify(e instanceof Error ? e.message : "操作失败，请再试一次");
    }
  };
  return (
    <div className="app-shell">
      <div className="main-column">
        <header className="topbar studio-nav">
          <button
            className="brand"
            onClick={() => setSection("board")}
            aria-label="晾一晾首页"
          >
            <img
              className="app-icon"
              src="/brand/app-icon.png"
              width="36"
              height="36"
              alt=""
            />
            <span>
              晾一晾便签<small>PIXEL INFINITY · v1.0</small>
            </span>
          </button>
          <nav aria-label="主导航">
            <button
              className={section === "board" ? "active" : ""}
              onClick={() => setSection("board")}
            >
              <LayoutDashboard size={17} />
              便签看板<span className="nav-count">{active.length}</span>
            </button>
            <button
              className={section === "companion" ? "active" : ""}
              onClick={() => setSection("companion")}
            >
              <Smile size={17} />
              陪伴模式
            </button>
          </nav>
          <div className="topbar-actions">
            <button
              className="icon-button sidebar-setting"
              title="便签架设置"
              aria-label="便签架设置"
              onClick={() => setDialog("settings")}
            >
              <Settings2 size={17} />
            </button>
            <span className="save-status">
              <i />
              {saving ? "保存中…" : error ? "保存失败" : "已保存"}
            </span>
            <button
              className="icon-button"
              aria-label="使用说明"
              onClick={() => setDialog("help")}
            >
              <CircleHelp size={17} />
            </button>
            <button
              className={`icon-button ${isQuiet(state, now) ? "quiet-active" : ""}`}
              aria-label={isQuiet(state, now) ? "恢复提醒" : "开启安静模式"}
              title={isQuiet(state, now) ? "恢复提醒" : "开启安静模式"}
              onClick={() =>
                perform(
                  {
                    type: "settings",
                    input: {
                      ...state.settings,
                      quiet: !isQuiet(state, now),
                      quietUntil: 0,
                    },
                  },
                  isQuiet(state, now)
                    ? "待办提醒已恢复"
                    : "安静一会儿，倒计时继续",
                )
              }
            >
              <Bell size={17} />
            </button>
          </div>
        </header>
        <main className="workspace">
          {undoId && (
            <div className="undo-completion" role="status">
              完成收起 · 做得好！
              <button
                className="button"
                onClick={async () => {
                  await perform(
                    { type: "restore", id: undoId },
                    "已撤销完成，截止时间和搭子已恢复",
                  );
                  setUndoId("");
                }}
              >
                撤销完成
              </button>
              <button
                className="icon-button"
                aria-label="关闭完成提示"
                onClick={() => setUndoId("")}
              >
                ×
              </button>
            </div>
          )}
          {ready && now > 0 && quietUntil > now ? (
            <aside className="quiet-notice" aria-label="安静模式状态">
              <Bell size={18} aria-hidden="true" />
              <div>
                <strong>今日安静</strong>
                <small>
                  {new Date(quietUntil).toLocaleString("zh-CN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  自动恢复
                </small>
              </div>
              <button
                onClick={() =>
                  void perform(
                    {
                      type: "settings",
                      input: { ...state.settings, quiet: false, quietUntil: 0 },
                    },
                    "已恢复提醒",
                  )
                }
              >
                恢复提醒
              </button>
            </aside>
          ) : null}
          {error && (
            <div className="storage-error" role="alert">
              {error}。为保护原记录，暂时停止写入。
              <button
                className="button"
                onClick={() =>
                  void retryLaundry()
                    .then(() => notify("连接已恢复"))
                    .catch((e) => notify(e.message))
                }
              >
                重试读取
              </button>
            </div>
          )}
          <div hidden={section !== "board"} className="board-page">
            <div className="board-overview">
              <div className="page-heading board-intro">
                <div className="paper-friend" aria-hidden="true">
                  <i />
                </div>
                <div>
                  <h1>待办工作台</h1>
                  <p>横拖浏览便签，点击查看待办。</p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button desktop-button"
                    onClick={() => {
                      void showDesktopWidget().catch((e) => notify(e.message));
                    }}
                  >
                    <Monitor size={15} />
                    桌面挂件
                    <ArrowUpRight size={13} />
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setDialog("add")}
                    disabled={!ready || !!error}
                  >
                    <Plus size={16} />
                    写便签
                  </button>
                </div>
              </div>
              <div className="summary-grid">
                <div className="summary-card">
                  <span className="summary-icon sage">
                    <StickyNote size={19} />
                  </span>
                  <div>
                    <span>待处理</span>
                    <strong>
                      {String(active.length).padStart(2, "0")}
                      <small>张</small>
                    </strong>
                  </div>
                </div>
                <div className="summary-card">
                  <span className="summary-icon lavender">
                    <CheckCheck size={20} />
                  </span>
                  <div>
                    <span>今日完成</span>
                    <strong>
                      {String(todayDone.length).padStart(2, "0")}
                      <small>张</small>
                    </strong>
                  </div>
                </div>
                <div className="summary-card">
                  <span className="summary-icon peach">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <span>临期与超时</span>
                    <strong>
                      {String(urgent.length).padStart(2, "0")}
                      <small>张</small>
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            <section className="rack-panel" aria-label="我的便签架">
              <div className="rack-heading">
                <div>
                  <span className="live-dot" />
                  <h2>我的便签架</h2>
                  <span className="pill">{active.length} 张待办</span>
                </div>
                <div className="rack-heading-right">
                  <span>
                    <i className="dot sage" />
                    待处理
                  </span>
                  <span>
                    <i className="dot peach" />
                    即将截止
                  </span>
                  <button
                    className="icon-button"
                    aria-label="便签架设置"
                    onClick={() => setDialog("settings")}
                  >
                    <Settings2 size={15} />
                  </button>
                </div>
              </div>
              <div className="board-rack-composition">
                <Clothesline
                  companions={
                    <CompanionRack onAdd={() => setSection("companion")} />
                  }
                  tasks={active}
                  settings={state.settings}
                  now={now}
                  onSelect={(t) => setSelectedId(t.id)}
                  onComplete={(id) =>
                    void perform({ type: "complete", id }, "完成收起，做得好！")
                  }
                  onAdd={() => setDialog("add")}
                />
              </div>
              {ready && !state.tasks.length && (
                <div className="demo-offer">
                  <Sparkles size={13} />
                  <button
                    className="text-button"
                    onClick={() => setSection("companion")}
                  >
                    让好友来陪我
                  </button>{" "}
                  · 试用四张示例便签
                  <button
                    disabled={!!error}
                    onClick={() =>
                      perform({ type: "demo" }, "已挂上四张示例便签")
                    }
                  >
                    体验一下
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              )}
            </section>
            <div className="lower-grid">
              <section className="task-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      待办清单<span>{active.length}</span>
                    </h2>
                  </div>
                  <label className="search-box">
                    <Search size={14} />
                    <input
                      placeholder="找一件小事"
                      aria-label="搜索待办"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="task-tabs">
                  {["全部小事", ...CATEGORIES].map((c) => (
                    <button
                      className={filter === c ? "active" : ""}
                      key={c}
                      onClick={() => setFilter(c)}
                    >
                      {categoryLabel(c)}
                      {c !== "全部小事" && (
                        <small>
                          {active.filter((t) => t.category === c).length}
                        </small>
                      )}
                    </button>
                  ))}
                  <span>
                    按截止时间排列
                    <ArrowDownToLine size={11} />
                  </span>
                </div>
                <div className="task-list">
                  {filtered.length ? (
                    filtered.map((task) => (
                      <div className="task-row" key={task.id}>
                        <button
                          className="complete-circle"
                          aria-label={`完成并收下：${task.title}`}
                          onClick={() =>
                            perform(
                              { type: "complete", id: task.id },
                              "便签已完成",
                            )
                          }
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className="task-title-button"
                          onClick={() => setSelectedId(task.id)}
                        >
                          <span className={`task-thumb color-${task.color}`}>
                            <StickyNote size={16} />
                          </span>
                          <span>
                            <strong>{task.title}</strong>
                            <small>
                              {categoryLabel(task.category)}
                              {state.currentTaskId === task.id
                                ? " · 当前处理"
                                : ""}
                              {task.demo ? " · 示例" : ""}
                              {task.note && ` · ${task.note}`}
                            </small>
                          </span>
                        </button>
                        <span
                          className={`row-time ${now ? urgency(task, now, state.settings.urgentMinutes) : "calm"}`}
                        >
                          <Clock3 size={12} />
                          {now ? countdown(task.dueAt, now) : "--:--:--"}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={`查看：${task.title}`}
                          onClick={() => setSelectedId(task.id)}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="list-empty">
                      <Wind size={20} />
                      <p>
                        {query || filter !== "全部小事"
                          ? "这里还没有匹配的小事"
                          : "便签架空空，心里也轻轻。"}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setDialog("add")}
                      >
                        写一件事
                        <Plus size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <TaskHistory notify={notify} />
            </div>
          </div>
          {section !== "board" && <CompanionPanel />}
          <footer className="producer-footer">
            <button onClick={() => setDialog("studio")}>
              <img
                width="24"
                height="24"
                src="/brand/pixel-infinity.jpg"
                alt=""
              />
              <span>
                像素无限工作室出品<small>@像素无限Pixel Infinity</small>
              </span>
              <span className="producer-version">晾一晾 V1.0</span>
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(dialog === "add" || editing) && (
        <TaskForm task={editing} close={close} notify={notify} />
      )}
      {selected && !editing && (
        <TaskDetail
          task={selected}
          now={now}
          close={close}
          edit={() => setEditingId(selected.id)}
          notify={notify}
        />
      )}
      {dialog === "settings" && (
        <Modal title="便签设置" close={close}>
          <p className="modal-subtitle">
            {mac
              ? "临期在挂架上提醒；真正超时后持续追逐，可开始处理、稍后或安静。"
              : "临期在挂架上提醒；真正超时后按设置短时追逐，结束后进入冷却。"}
          </p>
          <label className="field">
            提前多久提醒？
            <select
              value={state.settings.urgentMinutes}
              onChange={(e) =>
                perform(
                  {
                    type: "settings",
                    input: {
                      ...state.settings,
                      urgentMinutes: Number(e.target.value),
                    },
                  },
                  "临期提醒时间已更新",
                )
              }
            >
              {[1, 5, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  提前 {n} 分钟
                </option>
              ))}
            </select>
          </label>
          <label className="switch-row">
            <div>
              <strong>安静一会儿</strong>
              <small>停止自动催促、系统通知和激烈动作，倒计时继续。</small>
            </div>
            <input
              type="checkbox"
              checked={state.settings.quiet}
              onChange={(e) =>
                perform(
                  {
                    type: "settings",
                    input: { ...state.settings, quiet: e.target.checked },
                  },
                  "安静模式已更新",
                )
              }
            />
          </label>
          <label className="switch-row">
            <div>
              <strong>减少动态效果</strong>
              <small>停止微摆、临期动作和照片追逐，保留静态提示。</small>
            </div>
            <input
              type="checkbox"
              checked={state.settings.reducedMotion}
              onChange={(e) =>
                perform(
                  {
                    type: "settings",
                    input: {
                      ...state.settings,
                      reducedMotion: e.target.checked,
                    },
                  },
                  "动态效果已更新",
                )
              }
            />
          </label>
          <button
            className="button"
            onClick={() => {
              const tomorrow = new Date();
              tomorrow.setHours(24, 0, 0, 0);
              void perform(
                {
                  type: "settings",
                  input: {
                    ...state.settings,
                    quiet: false,
                    quietUntil: tomorrow.getTime(),
                  },
                },
                "今日安静，明天自动恢复",
              );
            }}
          >
            今日安静 · 明天自动恢复
          </button>
          <div className="info-note">
            <Monitor size={17} />
            <p>
              {mac ? "macOS" : "Windows"}
              版使用独立的本机待办文件。透明便签架置顶，空白区域可穿透点击，
              {mac ? "菜单栏" : "托盘"}可打开看板或退出。
            </p>
          </div>
          <button className="button primary full-width" onClick={close}>
            就按这个节奏
          </button>
        </Modal>
      )}
      {dialog === "studio" && (
        <Modal title="出品详情" close={close} className="studio-dialog">
          <StudioDetails />
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="使用便签"
          close={close}
          className="studio-dialog help-dialog"
        >
          <div className="help-steps">
            <p>
              <Plus size={18} />
              <span>
                <strong>挂起来</strong>写下待办和截止时间，选一种纸色。
              </span>
            </p>
            <p>
              <Wind size={18} />
              <span>
                <strong>留意它</strong>
                拖动后便签自然回摆，临近截止时会提醒。
              </span>
            </p>
            <p>
              <Check size={18} />
              <span>
                <strong>收下来</strong>点击便签查看详情。桌面端可拖出投篓。
              </span>
            </p>
          </div>
          <p className="info-note">
            浏览器预览只在页面打开时显示提醒。
            {mac
              ? "macOS 版在菜单栏运行时持续提醒"
              : "Windows 版在托盘运行时持续提醒"}
            ；关闭程序或关机期间不提醒，重新打开后按真实时间恢复。
          </p>
          <h3 className="help-studio-title">出品详情</h3>
          <StudioDetails />
          <button className="button primary full-width" onClick={close}>
            开始晾一晾
          </button>
        </Modal>
      )}
    </div>
  );
}
