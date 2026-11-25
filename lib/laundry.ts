export const COLORS = [
  "sage",
  "lavender",
  "peach",
  "blue",
  "butter",
  "ivory",
] as const;
export const CATEGORIES = ["工作", "生活", "灵感", "健康"] as const;
const categoryNames: Record<string, string> = {
  工作: "WORK",
  生活: "LIFE",
  灵感: "IDEAS",
  健康: "HEALTH",
};
export function categoryLabel(value: string) {
  return categoryNames[value] ?? value;
}
export type LaundryTask = {
  id: string;
  title: string;
  note: string;
  category: (typeof CATEGORIES)[number];
  color: (typeof COLORS)[number];
  dueAt: number;
  createdAt: number;
  completedAt: number | null;
  demo?: boolean;
  companionId?: string | null;
  cancelledAt?: number | null;
  snoozedUntil?: number;
  lastReminderAt?: number;
  lastReminderPhase?: string;
  nextReminderAt?: number;
  cooldownUntil?: number;
};
export type LaundrySettings = {
  urgentMinutes: number;
  quiet: boolean;
  reducedMotion: boolean;
  quietUntil?: number;
};
export type LaundryState = {
  version: 2;
  currentTaskId?: string | null;
  tasks: LaundryTask[];
  settings: LaundrySettings;
};
export type TaskInput = Pick<
  LaundryTask,
  "title" | "note" | "category" | "color" | "dueAt" | "companionId"
>;
export type LaundryCommand =
  | { type: "add"; input: TaskInput; id: string }
  | { type: "update"; id: string; input: TaskInput }
  | {
      type: "complete" | "restore" | "cancel" | "snooze" | "start" | "stop";
      id: string;
      dueAt?: number;
      interval?: number;
    }
  | { type: "reminded"; id: string; phase: string; interval: number }
  | { type: "unassign"; id: string }
  | { type: "settings"; input: LaundrySettings }
  | { type: "demo" };
export const EMPTY_LAUNDRY: LaundryState = {
  version: 2,
  tasks: [],
  settings: { urgentMinutes: 5, quiet: false, reducedMotion: false },
};

function validateInput(input: TaskInput) {
  if (
    !input ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 60
  )
    throw new Error("待办名称请填写 1–60 个字");
  if (typeof input.note !== "string" || input.note.length > 500)
    throw new Error("备注最多 500 字");
  if (!CATEGORIES.includes(input.category) || !COLORS.includes(input.color))
    throw new Error("请选择有效的纸色和分类");
  if (
    !Number.isFinite(input.dueAt) ||
    input.dueAt < 0 ||
    input.dueAt > 253402214400000
  )
    throw new Error("请选择有效的截止时间");
}
export function validateState(value: unknown): LaundryState {
  const state = value as LaundryState;
  if (
    !state ||
    ![1, 2].includes(state.version) ||
    !Array.isArray(state.tasks) ||
    state.tasks.length > 10000
  )
    throw new Error("待办文件格式不正确，请保留原文件后恢复备份");
  const ids = new Set<string>();
  const tasks = state.tasks.map((task) => {
    validateInput(task);

    if (
      typeof task.id !== "string" ||
      !task.id ||
      ids.has(task.id) ||
      !Number.isFinite(task.createdAt) ||
      (task.completedAt !== null && !Number.isFinite(task.completedAt))
    )
      throw new Error("待办文件记录损坏");
    for (const value of [
      task.cancelledAt,
      task.snoozedUntil,
      task.lastReminderAt,
      task.nextReminderAt,
      task.cooldownUntil,
    ])
      if (value != null && (!Number.isFinite(value) || value < 0))
        throw Error("待办提醒时间损坏");
    if (task.companionId != null && typeof task.companionId !== "string")
      throw Error("搭子关联损坏");
    ids.add(task.id);
    const memo = { ...task };
    Reflect.deleteProperty(memo, "garment");
    const legacyExamples = [
      "示例待办 · 点开衣服，完成后就可以收下。",
      "示例待办 · 快到时间时，衣服会开始甩动。",
      "示例待办 · 每件衣服都可以修改款式和颜色。",
      "示例待办 · 做完之后，点击衣服收好它。",
    ];
    if (memo.demo && legacyExamples.includes(memo.note))
      memo.note = "示例便签 · 点击查看详情，完成后可重新挂起。";
    return memo;
  });
  const settings = state.settings;
  if (
    !settings ||
    ![1, 5, 15, 30, 60].includes(settings.urgentMinutes) ||
    typeof settings.quiet !== "boolean" ||
    typeof settings.reducedMotion !== "boolean"
  )
    throw new Error("提醒设置格式不正确");
  if (
    settings.quietUntil != null &&
    (!Number.isFinite(settings.quietUntil) || settings.quietUntil < 0)
  )
    throw Error("安静期限损坏");
  return { ...state, version: 2, tasks };
}
export function applyCommand(
  state: LaundryState,
  command: LaundryCommand,
  now = Date.now(),
): LaundryState {
  let next: LaundryState;
  switch (command.type) {
    case "add":
      validateInput(command.input);
      if (command.input.dueAt <= now)
        throw new Error("新待办的截止时间需要晚于现在");
      if (
        typeof command.id !== "string" ||
        !command.id ||
        state.tasks.some((t) => t.id === command.id)
      )
        throw new Error("待办编号重复");
      next = {
        ...state,
        tasks: [
          ...state.tasks,
          {
            ...command.input,
            title: command.input.title.trim(),
            id: command.id,
            createdAt: now,
            completedAt: null,
          },
        ],
      };
      break;
    case "update": {
      validateInput(command.input);
      const task = state.tasks.find((t) => t.id === command.id);
      if (!task || task.completedAt !== null || task.cancelledAt)
        throw new Error("只能编辑还挂在便签架上的待办");
      next = {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === command.id
            ? { ...t, ...command.input, title: command.input.title.trim() }
            : t,
        ),
      };
      break;
    }
    case "cancel":
    case "complete":
    case "restore":
      if (
        command.type === "restore" &&
        state.tasks.some(
          (t) =>
            t.id === command.id && t.completedAt === null && !t.cancelledAt,
        )
      )
        return state;
      if (
        command.type === "complete" &&
        state.tasks.some((t) => t.id === command.id && t.cancelledAt)
      )
        throw Error("请先恢复已取消任务");
      if (!state.tasks.some((t) => t.id === command.id))
        throw new Error("这张便签已经不存在");
      next = {
        ...state,
        currentTaskId:
          state.currentTaskId === command.id ? null : state.currentTaskId,
        tasks: state.tasks.map((t) =>
          t.id === command.id
            ? {
                ...t,
                ...(command.type === "cancel"
                  ? { cancelledAt: t.cancelledAt ?? now }
                  : command.type === "restore"
                    ? {
                        cancelledAt: null,
                        snoozedUntil: 0,
                        cooldownUntil: now + 1000,
                        ...(command.dueAt ? { dueAt: command.dueAt } : {}),
                      }
                    : {}),
                completedAt:
                  command.type === "complete" ? (t.completedAt ?? now) : null,
              }
            : t,
        ),
      };
      break;
    case "reminded":
    case "stop":
    case "snooze":
    case "start": {
      const t = state.tasks.find((t) => t.id === command.id);
      if (!t || t.completedAt !== null || t.cancelledAt)
        throw Error("这件事已收起");
      const interval = (command.interval ?? 60) * 1000;
      if (!Number.isFinite(interval) || interval < 10000 || interval > 3600000)
        throw Error("提醒间隔无效");
      next = {
        ...state,
        ...(command.type === "start" ? { currentTaskId: t.id } : {}),
        tasks: state.tasks.map((t) =>
          t.id !== command.id
            ? t
            : {
                ...t,
                ...(command.type === "reminded"
                  ? {
                      lastReminderAt: now,
                      lastReminderPhase: command.phase,
                      nextReminderAt: now + interval,
                    }
                  : command.type === "stop"
                    ? {
                        cooldownUntil: now + interval,
                        nextReminderAt: now + interval,
                      }
                    : {
                        snoozedUntil: now + 600000,
                        cooldownUntil: now + 600000,
                      }),
              },
        ),
      };
      break;
    }
    case "unassign":
      next = {
        ...state,
        tasks: state.tasks.map((t) =>
          t.companionId === command.id ? { ...t, companionId: null } : t,
        ),
      };
      break;
    case "settings":
      next = { ...state, settings: { ...command.input } };
      break;
    case "demo": {
      if (state.tasks.some((t) => t.completedAt === null && !t.cancelledAt))
        throw new Error("先收完现有便签，再体验示例");
      const seeds = [
        {
          title: "完成今天的创作",
          note: "示例待办 · 点开便签，完成后就可以收下。",
          category: "工作",
          color: "sage",
          minutes: 120,
        },
        {
          title: "记得起来喝水",
          note: "示例待办 · 快到时间时，便签会开始甩动。",
          category: "健康",
          color: "lavender",
          minutes: 3,
        },
        {
          title: "把新的灵感记下来",
          note: "示例待办 · 每张便签都可以修改内容和纸色。",
          category: "灵感",
          color: "peach",
          minutes: 300,
        },
        {
          title: "出门散散步",
          note: "示例待办 · 做完一件，今天就轻一点。",
          category: "生活",
          color: "blue",
          minutes: 60,
        },
      ] as const;
      next = {
        ...state,
        tasks: [
          ...state.tasks,
          ...seeds.map((t, i) => ({
            ...t,
            id: `demo-${now}-${i}`,
            dueAt: now + t.minutes * 60000,
            createdAt: now,
            completedAt: null,
            demo: true,
          })),
        ],
      };
      break;
    }
    default:
      throw new Error("不支持的待办操作");
  }
  return validateState(next);
}
export type Urgency = "calm" | "soon" | "urgent" | "overdue";
export function urgency(task: LaundryTask, now: number, minutes = 15): Urgency {
  const remaining = task.dueAt - now;
  return remaining <= 0
    ? "overdue"
    : remaining <= minutes * 60000
      ? "urgent"
      : remaining <= 3600000
        ? "soon"
        : "calm";
}
export function countdown(dueAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil(Math.abs(dueAt - now) / 1000));
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  const value =
    h >= 24
      ? `${Math.floor(h / 24)}天 ${h % 24}小时`
      : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return dueAt <= now ? `已超时 ${value}` : value;
}
