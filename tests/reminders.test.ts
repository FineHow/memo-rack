import { describe, it, expect } from "vitest";
import {
  applyCommand,
  EMPTY_LAUNDRY,
  validateState,
  type LaundryState,
  type LaundryTask,
} from "@/lib/laundry";
import { nextReminder, reminderPhase, companionLine } from "@/lib/reminders";
import {
  migrateCompanions,
  newCompanion,
  validateCompanions,
  EMPTY_COMPANIONS,
} from "@/lib/companion";
import samples from "./reminder-contract.json";
const now = samples.now,
  due = samples.due;
const task = (id = "a", dueAt = due): LaundryTask => ({
  id,
  title: "报价单",
  note: "",
  category: "工作",
  color: "sage",
  dueAt,
  createdAt: now - 1000,
  completedAt: null,
  companionId: "friend-a",
});
const state = (tasks = [task()]): LaundryState => ({
  ...EMPTY_LAUNDRY,
  tasks,
  settings: { urgentMinutes: 5, quiet: false, reducedMotion: false },
});
describe("跨端提醒契约", () => {
  for (const row of samples.boundaries)
    it(row.name, () =>
      expect(reminderPhase(task(), state(), row.at)).toBe(row.phase),
    );
  it("首次提醒、相位变更和旧超时公平轮转", () => {
    let s = state([task("old", now - 600000), task("new", now + 1000)]);
    expect(nextReminder(s, now, 60)?.id).toBe("old");
    s = applyCommand(
      s,
      { type: "reminded", id: "old", phase: "overdue", interval: 60 },
      now,
    );
    expect(nextReminder(s, now, 60)?.id).toBe("new");
    s = applyCommand(
      s,
      { type: "reminded", id: "new", phase: "near", interval: 60 },
      now,
    );
    expect(nextReminder(s, now + 999, 60)).toBeUndefined();
    expect(nextReminder(s, now + 1000, 60)?.id).toBe("new");
    s = applyCommand(s, { type: "stop", id: "new", interval: 60 }, now + 1000);
    expect(nextReminder(s, now + 2000, 60)).toBeUndefined();
    expect(nextReminder(s, now + 60000, 60)?.id).toBe("old");
  });
  it("暂缓和处理中不修改截止时间，重启保留且不阻塞其他任务", () => {
    const original = state([task("a", now - 1000), task("b", now + 1000)]);
    for (const type of ["start", "snooze"] as const) {
      const s = validateState(
        JSON.parse(
          JSON.stringify(applyCommand(original, { type, id: "a" }, now)),
        ),
      );
      expect(s.tasks[0].dueAt).toBe(original.tasks[0].dueAt);
      expect(reminderPhase(s.tasks[0], s, now)).toBe(
        type === "start" ? "processing" : "snoozed",
      );
      expect(nextReminder(s, now, 60)?.id).toBe("b");
      expect(reminderPhase(s.tasks[0], s, now + 600000)).toBe("overdue");
    }
  });
  it("完成、取消、安静立即退出，取消不计完成，撤销保留关联", () => {
    for (const type of ["complete", "cancel"] as const) {
      const s = applyCommand(state(), { type, id: "a" }, due);
      expect(nextReminder(s, due, 60)).toBeUndefined();
      expect(reminderPhase(s.tasks[0], s, due)).toBe(
        type === "complete" ? "completed" : "cancelled",
      );
      if (type === "cancel") expect(s.tasks[0].completedAt).toBeNull();
      const undo = applyCommand(s, { type: "restore", id: "a" }, due + 1);
      expect(undo.tasks[0]).toMatchObject({
        dueAt: due,
        companionId: "friend-a",
        completedAt: null,
      });
    }
    const s = state();
    s.settings.quietUntil = due + 60000;
    expect(nextReminder(s, due, 60)).toBeUndefined();
    expect(reminderPhase(task(), s, due)).toBe("quiet");
    expect(reminderPhase(task(), s, due + 60000)).toBe("overdue");
  });
  it("阶段台词不混淆，用户变量安全作为文本", () => {
    const m = {
      ...newCompanion("a"),
      name: "阿杰",
      dialogue: {
        chat: ["嗨！"],
        near: ["快到啦"],
        overdue: ["{姓名} {任务名} {剩余时间}"],
        done: ["收好啦！"],
      },
    };
    const todo = { title: "<script>", dueAt: due };
    expect(companionLine(m, "chat", todo, due)).toBe("嗨！");
    expect(companionLine(m, "near", todo, due - 1)).toBe("快到啦");
    expect(companionLine(m, "overdue", todo, due)).toBe(
      "阿杰 <script> 已超时 1 分钟",
    );
    expect(companionLine(m, "done", todo, due)).toBe("收好啦！");
  });
  it("旧配置全部成员保留，身份稳定、旧暴走只迁入临期", () => {
    const legacy = {
      enabled: true,
      speaker: "b",
      motion: "mirror",
      interval: 15,
      members: [{ id: "b", name: "上司", template: "mouse" }],
    };
    const a = migrateCompanions(legacy),
      b = migrateCompanions(legacy);
    expect(a).toEqual(b);
    expect(a.members).toHaveLength(2);
    expect(a.currentId).toBe("b");
    expect(a.motion).toBe("mirror");
    expect(a.chaseSeconds).toBe(6);
    expect(a.chaseEnabled).toBe(true);
    validateCompanions(a);
  });
  it("编辑搭子互不覆盖，可上架全部成员并保留顺序", () => {
    const members = Array.from({ length: 10 }, (_, i) =>
      newCompanion(`friend-${i}`),
    );
    const s = {
      ...EMPTY_COMPANIONS,
      members,
      currentId: members[0].id,
      displayedIds: members.slice(0, 3).map((m) => m.id),
    };
    validateCompanions(s);
    const next = {
      ...s,
      members: s.members.map((m) =>
        m.id === "friend-0" ? { ...m, name: "好友A" } : m,
      ),
    };
    expect(next.members[1]).toEqual(s.members[1]);
    const allIds = members.map(m => m.id);
    expect(validateCompanions({...next,displayedIds:allIds}).displayedIds).toEqual(allIds);
    expect(() => validateCompanions({...next,displayedIds:[...allIds,allIds[0]]})).toThrow();
    expect(() => validateCompanions({...next,displayedIds:[...allIds,"missing"]})).toThrow();
  });
});
