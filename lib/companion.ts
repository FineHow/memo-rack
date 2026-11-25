export type PhotoEdit = {
  zoom: number;
  stretchX: number;
  stretchY: number;
  x: number;
  y: number;
  rotation: number;
  ratio: string;
  frame: string;
  anchor: number;
  headX: number;
  headY: number;
  headScale: number;
};
export type Dialogue = Record<"chat" | "near" | "overdue" | "done", string[]>;
export function dialogueFor(member: Companion): Dialogue {
  return (
    member.dialogue ?? {
      chat: [],
      near: member.phrases ?? [],
      overdue: member.phrases ?? [],
      done: [],
    }
  );
}
export const CAT_PHOTO = "/brand/starter-cat.jpg";
export type CustomDoll = {
  source: string;
  cutout: string;
  opening: [number, number][];
  openingMask?: string | null;
};
export type Companion = {
  customDoll?: CustomDoll | null;
  id: string;
  name: string;
  mode: "doll" | "sticker" | "photo";
  template: string;
  original: string;
  working?: string;
  repairSource?: string;
  result: string;
  chasePhoto: string;
  edit: PhotoEdit;
  dialogue?: Dialogue;
  tone: "gentle" | "boss" | "fun";
  phrases: string[];
  phraseMode: "mixed" | "only";
};
export type CompanionState = {
  starterApplied?: boolean;
  version: 2;
  revision: number;
  members: Companion[];
  currentId: string;
  displayedIds: string[];
  enabled: boolean;
  reminders: boolean;
  autoChat: boolean;
  chatSeconds: number;
  relief: "off" | "slap" | "sling" | "both";
  interval: number;
  motion: "swing" | "mirror" | "lash" | "text";
  nearSeconds: number;
  chaseEnabled: boolean;
  chaseSeconds: number;
  allMembers: boolean;
};
export const DEFAULT_EDIT: PhotoEdit = {
  zoom: 1,
  stretchX: 1,
  stretchY: 1,
  x: 0,
  y: 0,
  rotation: 0,
  ratio: "original",
  frame: "plain",
  anchor: 0.16,
  headX: 0,
  headY: 0,
  headScale: 1,
};
export const EMPTY_COMPANIONS: CompanionState = {
  version: 2,
  revision: 0,
  members: [],
  currentId: "",
  displayedIds: [],
  enabled: true,
  reminders: true,
  autoChat: true,
  chatSeconds: 60,
  relief: "sling",
  interval: 60,
  motion: "mirror",
  nearSeconds: 6,
  chaseEnabled: true,
  chaseSeconds: 6,
  allMembers: true,
};
export function newCompanion(id: string): Companion {
  return {
    id,
    name: "新好友",
    mode: "photo",
    template: "varsity",
    original: CAT_PHOTO,
    result: CAT_PHOTO,
    chasePhoto: "",
    edit: { ...DEFAULT_EDIT },
    tone: "gentle",
    phrases: [],
    phraseMode: "mixed",
  };
}
export function starterCompanions(revision = 0): CompanionState {
  const cat = { ...newCompanion("starter-cat"), name: "小猫" };
  return {
    ...EMPTY_COMPANIONS,
    starterApplied: true,
    revision,
    members: [cat],
    currentId: cat.id,
    displayedIds: [cat.id],
  };
}
export function validateCompanions(s: CompanionState): CompanionState {
  if (!s || s.version !== 2 || !Array.isArray(s.members))
    throw Error("搭子文件格式不正确，请保留原文件后恢复备份");
  s = {
    ...EMPTY_COMPANIONS,
    ...s,
    members: s.members.map((m) => {
      if (!m || m.edit === null) throw Error("搭子记录损坏");
      return {
        ...newCompanion(m.id),
        ...m,
        dialogue: Object.fromEntries(
          (["chat", "near", "overdue", "done"] as const).map((key) => {
            const lines = dialogueFor(m)[key];
            if (
              !Array.isArray(lines) ||
              lines.length > 40 ||
              lines.some(
                (line) => typeof line !== "string" || line.trim().length > 120,
              )
            )
              throw Error("每种场景最多 40 句，每句最多 120 字");
            return [key, lines.map((line) => line.trim()).filter(Boolean)];
          }),
        ) as Dialogue,
        mode: m.mode === "sticker" ? "photo" : m.mode,
        name:
          typeof m.name === "string"
            ? m.name.trim()
            : m.name === undefined
              ? "新好友"
              : m.name,
        phrases:
          m.phrases === undefined
            ? []
            : Array.isArray(m.phrases)
              ? m.phrases
                  .map((p) => (typeof p === "string" ? p.trim() : p))
                  .filter(Boolean)
              : m.phrases,
        edit: { ...DEFAULT_EDIT, ...m.edit },
      };
    }),
  };
  if (
    !s ||
    s.version !== 2 ||
    !Array.isArray(s.members) ||
    !Number.isInteger(s.revision) ||
    s.revision < 0
  )
    throw Error("搭子文件格式不正确，请保留原文件后恢复备份");
  const ids = new Set<string>();
  for (const m of s.members) {
    if (!m.name || m.name.length > 40)
      throw Error("请填写搭子姓名，最多 40 字");
    if (m.phraseMode === "only" && !m.phrases?.length)
      throw Error("只使用我的台词时，请至少填写一句台词");
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(m.id) ||
      ids.has(m.id) ||
      !m.name?.trim() ||
      m.name.length > 40 ||
      !["doll", "sticker", "photo"].includes(m.mode) ||
      !["gentle", "boss", "fun"].includes(m.tone) ||
      !["only", "mixed"].includes(m.phraseMode) ||
      !Array.isArray(m.phrases) ||
      m.phrases.length > 40 ||
      m.phrases.some((p) => typeof p !== "string" || p.length > 120)
    )
      throw Error("搭子记录损坏");
    ids.add(m.id);
    if (m.template === "uploaded" && !m.customDoll)
      throw Error("缺少自定义模板");
    if (m.customDoll) {
      const { source, cutout, opening } = m.customDoll;
      if (
        !source ||
        !cutout ||
        !Array.isArray(opening) ||
        opening.length < 3 ||
        opening.length > 2048 ||
        opening.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            p.some((v) => !Number.isFinite(v) || v < 0 || v > 1),
        )
      )
        throw Error("模板开口数据无效");
    }
    for (const ref of [
      m.original,
      m.result,
      m.chasePhoto,
      m.working || "",
      m.repairSource || "",
      m.customDoll?.source || "",
      m.customDoll?.cutout || "",
      m.customDoll?.openingMask ?? "",
    ])
      if (
        typeof ref !== "string" ||
        (!/^\/assets\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(ref) &&
          !/^asset:[a-f0-9-]{36}$/.test(ref) &&
          ref !== CAT_PHOTO &&
          ref !== "")
      )
        throw Error("照片素材引用无效");
    if (
      !m.edit ||
      [m.edit.stretchX, m.edit.stretchY].some((v) => v < 0.7 || v > 1.3) ||
      !["original", "1:1", "3:4", "4:3", "9:16"].includes(m.edit.ratio) ||
      !["plain", "white", "dark"].includes(m.edit.frame) ||
      Object.entries(m.edit).some(
        ([k, v]) =>
          !["ratio", "frame"].includes(k) &&
          (!Number.isFinite(v) || Math.abs(Number(v)) > 10000),
      )
    )
      throw Error("照片编辑参数无效");
  }
  if (
    typeof s.currentId !== "string" ||
    !Array.isArray(s.displayedIds) ||
    (s.currentId && !ids.has(s.currentId)) ||
    new Set(s.displayedIds).size !== s.displayedIds.length ||
    s.displayedIds.some((id) => !ids.has(id))
  )
    throw Error("上架名单中包含无效或重复的搭子");
  if (
    !["off", "slap", "sling", "both"].includes(s.relief) ||
    typeof s.autoChat !== "boolean" ||
    s.chatSeconds < 10 ||
    s.chatSeconds > 3600 ||
    ![s.chatSeconds, s.interval, s.nearSeconds, s.chaseSeconds].every(
      Number.isInteger,
    ) ||
    s.interval < 10 ||
    s.interval > 3600 ||
    s.nearSeconds < 1 ||
    s.nearSeconds > 60 ||
    s.chaseSeconds < 1 ||
    s.chaseSeconds > 60 ||
    !["swing", "mirror", "lash", "text"].includes(s.motion) ||
    [s.enabled, s.reminders, s.chaseEnabled, s.allMembers].some(
      (v) => typeof v !== "boolean",
    )
  )
    throw Error("提醒偏好无效");
  if (s.currentId && (s.enabled || s.displayedIds.includes(s.currentId)))
    s.displayedIds = [
      s.currentId,
      ...s.displayedIds.filter((id) => id !== s.currentId),
    ];
  return s;
}
// Deterministic IDs make migration retryable. Legacy data remains untouched.
export function migrateCompanions(
  old: Record<string, unknown>,
): CompanionState {
  const rows = [
    {
      id: "legacy-main",
      template: old.template,
      name: "我的搭子",
      face: old.face,
      sticker: old.sticker,
    },
    ...((old.members as Record<string, unknown>[]) || []),
  ];
  const members = rows.map((r, i) => ({
    ...newCompanion(String(r.id || `legacy-${i}`)),
    name: String(r.name || "我的搭子"),
    template: String(r.template || "varsity"),
    mode: r.template === "custom" ? ("photo" as const) : ("doll" as const),
    original: String(r.sticker || r.face || ""),
    result: String(r.sticker || r.face || ""),
    chasePhoto: String(r.sticker || r.face || ""),
    phrases: (old.phrases as string[]) || [],
  }));
  const speaker = String(old.speaker || "main");
  const currentId =
    speaker === "main"
      ? "legacy-main"
      : members.find((m) => m.id === speaker)?.id || "legacy-main";
  return {
    ...EMPTY_COMPANIONS,
    members,
    currentId,
    displayedIds: [
      currentId,
      ...members.filter((m) => m.id !== currentId).map((m) => m.id),
    ],
    enabled: !!old.enabled,
    reminders: old.reminders !== false,
    interval: Math.max(10, Math.min(3600, Number(old.interval) || 60)),
    motion:
      old.motion === "mirror"
        ? "mirror"
        : old.motion === "lash"
          ? "lash"
          : "swing",
  };
}
