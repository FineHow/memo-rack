import defaults from "@/public/brand/dialogue.json";
import { dialogueFor, type Companion, type Dialogue } from "./companion";
import type { LaundryState, LaundryTask } from "./laundry";
export type ReminderPhase =
  | "normal"
  | "near"
  | "overdue"
  | "processing"
  | "snoozed"
  | "quiet"
  | "completed"
  | "cancelled";
export function isQuiet(state: LaundryState, now: number) {
  return state.settings.quiet || (state.settings.quietUntil ?? 0) > now;
}
export function reminderPhase(
  task: LaundryTask,
  state: LaundryState,
  now: number,
): ReminderPhase {
  if (task.completedAt !== null) return "completed";
  if (task.cancelledAt) return "cancelled";
  if (isQuiet(state, now)) return "quiet";
  if ((task.snoozedUntil ?? 0) > now)
    return state.currentTaskId === task.id ? "processing" : "snoozed";
  return now >= task.dueAt
    ? "overdue"
    : task.dueAt - now <= state.settings.urgentMinutes * 60000
      ? "near"
      : "normal";
}
export function nextReminder(
  state: LaundryState,
  now: number,
  interval: number,
): LaundryTask | undefined {
  if (interval < 10 || interval > 3600) throw Error("提醒间隔无效");
  return state.tasks
    .filter((t) => {
      const phase = reminderPhase(t, state, now);
      return (
        (phase === "near" || phase === "overdue") &&
        ((t.lastReminderPhase !== phase && (t.cooldownUntil ?? 0) <= now) ||
          ((t.nextReminderAt ?? 0) <= now && (t.cooldownUntil ?? 0) <= now))
      );
    })
    .sort((a, b) => {
      const freshA =
        a.lastReminderPhase !== reminderPhase(a, state, now) ? 0 : 1;
      const freshB =
        b.lastReminderPhase !== reminderPhase(b, state, now) ? 0 : 1;
      return (
        freshA - freshB ||
        (a.lastReminderAt ?? 0) - (b.lastReminderAt ?? 0) ||
        a.dueAt - b.dueAt ||
        a.id.localeCompare(b.id)
      );
    })[0];
}
export function companionLine(
  member: Companion,
  phase: keyof Dialogue,
  task?: Pick<LaundryTask, "title" | "dueAt">,
  now = Date.now(),
  choice = Math.random(),
) {
  const custom = dialogueFor(member)
    [phase].map((line) => line.trim())
    .filter(Boolean);
  const pool = custom.length ? custom : defaults[phase];
  const line = pool[Math.floor(choice * pool.length)];
  const remaining = task
    ? (now >= task.dueAt ? "已超时 " : "还有 ") +
      Math.max(1, Math.ceil(Math.abs(task.dueAt - now) / 60000)) +
      " 分钟"
    : "现在";
  return line.replace(/\{(姓名|任务名|剩余时间)\}/g, (_, key) =>
    key === "姓名"
      ? member.name
      : key === "任务名"
        ? task?.title || "眼前这件事"
        : remaining,
  );
}
