import { describe, it, expect } from "vitest";
import {
  applyCommand,
  validateState,
  EMPTY_LAUNDRY,
  type LaundryTask,
} from "@/lib/laundry";
import { nextReminder, reminderPhase } from "@/lib/reminders";
import {
  validateCompanions,
  EMPTY_COMPANIONS,
  newCompanion,
} from "@/lib/companion";
const clock = 1800000000000;
const task = (i: number): LaundryTask => ({
  id: `backlog-${i}`,
  title: `旧待办 ${i}`,
  note: "",
  category: "工作",
  color: "sage",
  createdAt: clock - 86400000,
  dueAt: clock - i * 10000,
  completedAt: null,
});
describe("大量待办、跨天与重新读取", () => {
  it("五百个旧超时公平轮转，新临期和新超时可以及时插入", () => {
    let state = validateState({
      ...EMPTY_LAUNDRY,
      tasks: Array.from({ length: 500 }, (_, i) => task(i)),
    });
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const selected = nextReminder(state, clock + i, 60)!;
      expect(seen.has(selected.id)).toBe(false);
      seen.add(selected.id);
      state = applyCommand(
        state,
        { type: "reminded", id: selected.id, phase: "overdue", interval: 60 },
        clock + i,
      );
      if (i % 50 === 0)
        state = validateState(JSON.parse(JSON.stringify(state)));
    }
    expect(seen.size).toBe(500);
    expect(nextReminder(state, clock + 500, 60)).toBeUndefined();
    state = applyCommand(
      state,
      {
        type: "add",
        id: "just-added",
        input: {
          title: "新的报价单",
          note: "",
          category: "工作",
          color: "blue",
          dueAt: clock + 1000,
        },
      },
      clock + 500,
    );
    expect(nextReminder(state, clock + 501, 60)?.id).toBe("just-added");
    state = applyCommand(
      state,
      { type: "reminded", id: "just-added", phase: "near", interval: 60 },
      clock + 501,
    );
    expect(nextReminder(state, clock + 1000, 60)?.id).toBe("just-added");
  });
  it("安静跨天恢复后仍轮转，不因重新读取而重复触发", () => {
    let state = validateState({
      ...EMPTY_LAUNDRY,
      tasks: [task(1), task(2)],
      settings: { ...EMPTY_LAUNDRY.settings, quietUntil: clock + 86400000 },
    });
    expect(nextReminder(state, clock + 86399999, 60)).toBeUndefined();
    const next = nextReminder(state, clock + 86400000, 60)!;
    state = applyCommand(
      state,
      { type: "stop", id: next.id, interval: 60 },
      clock + 86400000,
    );
    state = validateState(JSON.parse(JSON.stringify(state)));
    expect(nextReminder(state, clock + 86400001, 60)?.id).not.toBe(next.id);
    expect(state.tasks.find((t) => t.id === next.id)?.dueAt).toBe(next.dueAt);
    expect(reminderPhase(next, state, clock + 86400000)).toBe("overdue");
  });
  it("空闲和全部完成时不产生提醒", () => {
    expect(nextReminder(EMPTY_LAUNDRY, clock, 60)).toBeUndefined();
    const state = validateState({
      ...EMPTY_LAUNDRY,
      tasks: [
        { ...task(1), completedAt: clock },
        { ...task(2), cancelledAt: clock },
      ],
    });
    expect(nextReminder(state, clock + 99999999, 60)).toBeUndefined();
  });
  it("只用自定义台词不能静默退回内置台词，默认参数可规范化", () => {
    const state = {
      ...EMPTY_COMPANIONS,
      members: [
        { ...newCompanion("a"), phraseMode: "only" as const, phrases: ["  "] },
      ],
      currentId: "a",
      displayedIds: ["a"],
    };
    expect(() => validateCompanions(state)).toThrow("至少填写一句");
    const normalized = validateCompanions({
      ...state,
      members: [{ ...state.members[0], phrases: ["  {任务名}，快干活  "] }],
    });
    expect(normalized.members[0].phrases).toEqual(["{任务名}，快干活"]);
    expect(() =>
      validateCompanions({ ...normalized, interval: 10.5 }),
    ).toThrow();
  });
});
