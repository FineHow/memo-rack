import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  applyCommand,
  validateState,
  EMPTY_LAUNDRY,
  type LaundryCommand,
  type LaundryState,
} from "../../lib/laundry";
import {
  starterCompanions,
  validateCompanions,
  type CompanionState,
} from "../../lib/companion";
import {
  reminderPhase,
  nextReminder,
  companionLine,
  isQuiet,
} from "../../lib/reminders";
import type { DesktopCue } from "../../lib/desktop-bridge";

export function atomicWrite(file: string, value: unknown) {
  const tmp = file + ".tmp";
  const data = JSON.stringify(value);
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, file + ".bak.tmp");
    fs.renameSync(file + ".bak.tmp", file + ".bak");
  }
  fs.renameSync(tmp, file);
}
export class Repository {
  tasks: LaundryState;
  friends: CompanionState;
  constructor(public directory: string) {
    fs.mkdirSync(path.join(directory, "assets"), { recursive: true });
    const read = (name: string, fallback: unknown) =>
      fs.existsSync(path.join(directory, name))
        ? JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))
        : fallback;
    this.tasks = validateState(
      read("tasks-v2.json", structuredClone(EMPTY_LAUNDRY)),
    );
    this.friends = validateCompanions(
      read("companions-v2.json", starterCompanions()),
    );
  }
  command(command: LaundryCommand, now = Date.now()) {
    const next = applyCommand(this.tasks, command, now);
    atomicWrite(path.join(this.directory, "tasks-v2.json"), next);
    this.tasks = next;
    return next;
  }
  saveFriends(draft: CompanionState) {
    const next = validateCompanions(structuredClone(draft));
    if (next.revision !== this.friends.revision)
      throw Error("其他窗口已更新搭子，请重新读取后编辑");
    for (const m of next.members)
      for (const r of [
        m.original,
        m.result,
        m.chasePhoto,
        m.working,
        m.repairSource,
        m.customDoll?.source,
        m.customDoll?.cutout,
        m.customDoll?.openingMask,
      ]) {
        if (!r || r === "/brand/starter-cat.jpg") continue;
        if (!/^\/assets\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(r))
          throw Error("素材引用无效");
        const file = path.join(this.directory, "assets", path.basename(r));
        if (
          !fs.existsSync(file) ||
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(file))
            .digest("hex") !== path.parse(file).name
        )
          throw Error("照片素材缺失或损坏，请重新上传");
      }
    next.revision++;
    next.starterApplied = true;
    atomicWrite(path.join(this.directory, "companions-v2.json"), next);
    this.friends = next;
    return next;
  }
  asset(bytes: Buffer, ext: string) {
    if (
      bytes.length > 20 * 1024 * 1024 ||
      !["png", "jpg", "webp"].includes(ext)
    )
      throw Error("照片格式或大小无效");
    const name =
      crypto.createHash("sha256").update(bytes).digest("hex") + "." + ext;
    const file = path.join(this.directory, "assets", name);
    fs.writeFileSync(file + ".tmp", bytes, { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
    return "/assets/" + name;
  }
}

// One active cue. Persistent pursuit rotates only when another task is waiting.
export class ReminderEngine {
  cue: DesktopCue | null = null;
  tick(s: LaundryState, f: CompanionState, now: number, reduced = false) {
    if (isQuiet(s, now) || (!f.enabled && this.cue?.phase !== "overdue")) {
      this.cue = null;
      return this.cue;
    }
    const active = s.tasks.find((t) => t.id === this.cue?.id);
    if (
      this.cue &&
      (!active ||
        reminderPhase(active, s, now) !== this.cue.phase ||
        (this.cue.phase === "near" &&
          now - this.cue.startedAt >= f.nearSeconds * 1000))
    )
      this.cue = null;
    const next = f.enabled ? nextReminder(s, now, f.interval) : undefined;
    if (
      this.cue &&
      now - this.cue.startedAt >= Math.max(10, f.interval) * 1000 &&
      next &&
      next.id !== this.cue.id
    )
      this.cue = null;
    if (!this.cue && next) {
      const phase = reminderPhase(next, s, now) as "near" | "overdue";
      const member =
        f.members.find(
          (m) =>
            m.id ===
            (phase === "overdue"
              ? f.currentId
              : next.companionId || f.currentId),
        ) || f.members.find((m) => m.id === f.currentId);
      if (member)
        this.cue = {
          id: next.id,
          phase,
          memberId: member.id,
          text: companionLine(member, phase, next, now),
          startedAt: now,
          chase: phase === "overdue" && f.chaseEnabled && !reduced,
        };
    }
    if (this.cue) {
      this.cue = {
        ...this.cue,
        chase: this.cue.phase === "overdue" && f.chaseEnabled && !reduced,
      };
      // Identity changes switch the displayed companion without adding a second follower.
      if (this.cue.phase === "overdue" && this.cue.memberId !== f.currentId)
        this.cue = null;
    }
    return this.cue;
  }
}
