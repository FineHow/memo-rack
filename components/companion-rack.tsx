"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import cast from "@/public/brand/cast.json";
import { useSystemReducedMotion } from "@/lib/use-reduced-motion";
import type { Companion, CompanionState } from "@/lib/companion";
import {
  nativeToken,
  saveCompanions,
  useCompanions,
  useAssetResource,
} from "@/lib/companion-store";
import { dispatchLaundry, useClock, useLaundry } from "@/lib/laundry-store";
import { DollArt } from "./doll-art";
import { createPortal } from "react-dom";
import {
  isQuiet,
  nextReminder,
  reminderPhase,
  companionLine,
} from "@/lib/reminders";
export function MemberArt({ member }: { member: Companion }) {
  const resource = useAssetResource(member.result),
    src = resource.url;
  const [failed, setFailed] = useState<{
    url: string;
    member: Companion;
  } | null>(null);
  if (
    resource.error ||
    (src && failed?.url === src && failed.member === member)
  )
    return (
      <span
        className="photo-unavailable"
        role="img"
        aria-label={`${member.name}的照片暂不可用`}
      >
        照片暂不可用<small>请重新编辑照片</small>
      </span>
    );
  if (member.mode !== "doll" || member.template === "uploaded")
    return (
      <img
        draggable={false}
        alt={member.name}
        src={src || undefined}
        onError={() => setFailed({ url: src, member })}
        style={{
          objectFit: "contain",
          objectPosition: "center bottom",
          border:
            member.mode === "photo" && member.edit.frame !== "plain"
              ? `3px solid ${member.edit.frame === "dark" ? "#26344d" : "white"}`
              : undefined,
        }}
      />
    );
  return (
    <DollArt template={member.template} name={member.name}>
      {src ? (
        <img
          draggable={false}
          alt=""
          src={src}
          onError={() => setFailed({ url: src, member })}
        />
      ) : null}
    </DollArt>
  );
}
type Cue = {
  id: string;
  memberId: string;
  phase: "near" | "overdue";
  choice: number;
  until: number;
  preview: boolean;
  pursuit: boolean;
};
export function CompanionRack({
  preferences,
  previewOnly = false,
  onMember,
  onReorder,
  onAdd,
  selectedId,
}: {
  selectedId?: string;
  preferences?: CompanionState;
  previewOnly?: boolean;
  onMember?: (id: string) => void;
  onAdd?: () => void;
  onReorder?: (ids: string[]) => void;
}) {
  const companions = useCompanions(),
    { state } = useLaundry(),
    now = useClock();
  const pref = preferences || companions.state;
  const membersById = useMemo(
    () => new Map(pref.members.map((m) => [m.id, m])),
    [pref.members],
  );
  const [cue, setCue] = useState<Cue | null>(null),
    [message, setMessage] = useState(""),
    [point, setPoint] = useState({ x: 60, y: 150 });
  const [chat, setChat] = useState<{
    id: string;
    text: string;
    done?: boolean;
    until: number;
  } | null>(null);
  const nextChat = useRef(0);
  useEffect(() => {
    nextChat.current = 0;
  }, [pref.enabled, pref.autoChat, pref.chatSeconds, pref.currentId]);
  function speak(m: Companion) {
    const task = state.tasks.find(
      (t) =>
        !t.completedAt &&
        !t.cancelledAt &&
        (t.companionId || pref.currentId) === m.id,
    );
    setChat({
      id: m.id,
      text: companionLine(m, "chat", task),
      until: now + 5500,
    });
    nextChat.current = now + pref.chatSeconds * 1000;
  }
  useEffect(() => {
    if (previewOnly || !pref.enabled) return;
    const complete = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      const speakerId =
        cue?.id === id && cue.phase === "overdue"
          ? pref.currentId
          : task.companionId || pref.currentId;
      const m =
        pref.members.find((m) => m.id === speakerId) ||
        pref.members.find((m) => m.id === pref.currentId);
      if (m)
        setChat({
          id: m.id,
          text: companionLine(m, "done", task),
          done: true,
          until: Date.now() + 5500,
        });
    };
    window.addEventListener("laundry-completed", complete);
    return () => window.removeEventListener("laundry-completed", complete);
  }, [previewOnly, pref, state.tasks, cue]);
  const pending = useRef(false),
    area = useRef<HTMLDivElement>(null);
  const systemReduce = useSystemReducedMotion();
  const reduced = state.settings.reducedMotion || systemReduce;

  const task = state.tasks.find((t) => t.id === cue?.id),
    member =
      pref.members.find(
        (m) =>
          m.id ===
          (cue?.phase === "overdue"
            ? pref.currentId
            : cue?.memberId || (previewOnly ? selectedId : undefined)),
      ) || pref.members.find((m) => m.id === pref.currentId);
  useEffect(() => {
    const tick = setTimeout(() => {
      if (!now) return;
      if (cue) {
        if (
          !cue.preview &&
          (!task ||
            task.completedAt !== null ||
            task.cancelledAt ||
            isQuiet(state, now) ||
            (cue.phase === "near" &&
              reminderPhase(task, state, now) !== "near") ||
            (!cue.pursuit && !pref.enabled))
        ) {
          setCue(null);
          return;
        }
        if (now >= cue.until) {
          setCue(null);
          return;
        }
        return;
      }
      if (
        (!previewOnly && !pref.enabled) ||
        pending.current ||
        isQuiet(state, now)
      )
        return;
      // A desktop-hosted board reflects native reminders without acknowledging them twice.
      const native = !!nativeToken();
      const next = previewOnly
        ? undefined
        : native
          ? state.tasks.find((t) => {
              const phase = reminderPhase(t, state, now);
              return (
                phase === "overdue" ||
                (phase === "near" &&
                  t.lastReminderPhase === "near" &&
                  (t.lastReminderAt ?? 0) + pref.nearSeconds * 1000 > now)
              );
            })
          : nextReminder(state, now, pref.interval);
      if (!next) {
        if (!pref.autoChat || pref.chatSeconds < 10 || pref.chatSeconds > 3600)
          return;
        if (!nextChat.current) nextChat.current = now;
        if (now >= nextChat.current && (!chat || chat.until <= now)) {
          const m = pref.members.find((m) => m.id === pref.currentId);
          if (m) {
            setChat({
              id: m.id,
              text: companionLine(
                m,
                "chat",
                state.tasks.find((t) => !t.completedAt && !t.cancelledAt),
              ),
              until: now + 5500,
            });
            nextChat.current = now + pref.chatSeconds * 1000;
          }
        }
        return;
      }

      const m =
        pref.members.find(
          (m) =>
            m.id ===
            (next.dueAt <= now
              ? pref.currentId
              : next.companionId || pref.currentId),
        ) || pref.members.find((m) => m.id === pref.currentId);
      if (!m) return;
      const phase = reminderPhase(next, state, now) as "near" | "overdue";
      pending.current = true;
      const record = native
        ? Promise.resolve()
        : dispatchLaundry({
            type: "reminded",
            id: next.id,
            phase,
            interval: pref.interval,
          });
      void record
        .then(() =>
          setCue({
            id: next.id,
            memberId: m.id,
            phase,
            until: phase === "near" ? now + 1000 * pref.nearSeconds : Infinity,
            choice: Math.random(),
            preview: false,
            pursuit: !native && phase === "overdue" && pref.chaseEnabled,
          }),
        )
        .catch((e) => setMessage(e.message))
        .finally(() => {
          pending.current = false;
        });
    }, 0);
    return () => clearTimeout(tick);
  }, [now, state, cue, task, pref, previewOnly, chat]);
  const chase =
    !!cue &&
    cue.phase === "overdue" &&
    now < cue.until &&
    cue.pursuit &&
    !reduced &&
    !!member;
  useEffect(() => {
    if (!chase) return;
    const move = (e: PointerEvent) => {
      const r = previewOnly ? area.current?.getBoundingClientRect() : null;
      const width = r?.width ?? window.innerWidth,
        height = r?.height ?? window.innerHeight;
      const x = e.clientX - (r?.left ?? 0),
        y = e.clientY - (r?.top ?? 0);
      setPoint({
        x: Math.max(
          4,
          Math.min(width - 206, x + 232 < width ? x + 30 : x - 232),
        ),
        y: Math.max(4, Math.min(height - 264, y + 20)),
      });
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [chase, previewOnly]);
  function preview(phase: "near" | "overdue", choice: number) {
    if (!member) return;
    setCue({
      id: state.tasks.find((t) => !t.completedAt && !t.cancelledAt)?.id || "",
      memberId: member.id,
      phase,
      until: phase === "near" ? now + 1000 * pref.nearSeconds : Infinity,
      choice,
      preview: true,
      pursuit: phase === "overdue" && pref.chaseEnabled,
    });
    setMessage("预览中 · 不改变真实任务与冷却记录");
  }
  const doneChat =
    (!cue || task?.completedAt) && chat?.done && chat.until > now ? chat : null;
  const speakingId = doneChat
    ? doneChat.id
    : cue
      ? member?.id
      : chat && chat.until > now
        ? chat.id
        : undefined;
  const baseIds =
    !previewOnly && speakingId && !pref.displayedIds.includes(speakingId)
      ? [...pref.displayedIds, speakingId]
      : pref.displayedIds;
  const displayIds =
    previewOnly && selectedId && !pref.displayedIds.includes(selectedId)
      ? [...pref.displayedIds, selectedId]
      : baseIds;
  const previewTask = state.tasks.find((t) => !t.completedAt && !t.cancelledAt);
  const displayed =
    pref.enabled || previewOnly
      ? displayIds
          .map((id) => membersById.get(id))
          .filter((m): m is Companion => !!m)
      : [];
  function reorder(id: string, delta: number) {
    const ids = [...pref.displayedIds];
    const from = ids.indexOf(id);
    const to = Math.min(
      ids.length - 1,
      Math.max(ids.includes(pref.currentId) ? 1 : 0, from + delta),
    );
    if (id === pref.currentId || from < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    if (onReorder) onReorder(ids);
    else
      void saveCompanions({ ...pref, displayedIds: ids }).catch((e) =>
        setMessage(e.message),
      );
  }
  const speechTask = task?.title || "把报价单发出去",
    due = cue?.preview
      ? cue.phase === "near"
        ? now + 300000
        : now - 60000
      : task?.dueAt || now;
  const line = doneChat
    ? doneChat.text
    : cue && member
      ? companionLine(
          member,
          cue.phase,
          { title: speechTask, dueAt: due },
          now,
          cue.choice,
        )
      : chat && chat.until > now
        ? chat.text
        : "";
  const speech = line && (
    <div className="friend-bubble" role="status">
      {line}
    </div>
  );
  const follower = chase && member && (
    <div
      className={`companion-chase ${previewOnly ? "preview-chase" : ""}`}
      data-chase={member.mode}
      style={{ left: point.x, top: point.y }}
    >
      {speakingId === member.id ? (
        speech
      ) : (
        <div className="friend-bubble">
          {companionLine(
            member,
            "overdue",
            { title: speechTask, dueAt: due },
            now,
            cue.choice,
          )}
        </div>
      )}
      <div className="chase-mirror">
        <MemberArt member={member} />
      </div>
    </div>
  );
  return (
    <section
      className={`companion-stage ${displayed.length > 1 ? "has-extra-members" : ""}`}
      ref={area}
      aria-label={previewOnly ? "完整挂架预览" : "当前陪伴"}
    >
      <div className="companion-stage-heading">
        <strong>
          {previewOnly ? "完整挂架预览" : "当前陪伴"} ·{" "}
          {pref.members.find((m) => m.id === pref.currentId)?.name ||
            "等待好友"}
        </strong>
        <small>
          {previewOnly
            ? "预览中 · 保存后上架"
            : pref.enabled
              ? "已上架"
              : "尚未上架"}
        </small>
      </div>

      {!previewOnly && !displayed.length && (
        <div className="companion-empty">
          <span aria-hidden="true">＋</span>
          <b>让好友来陪我</b>
          <p>上传熟悉的照片，陪你把事情做完。</p>
          <button className="button" onClick={onAdd}>
            添加好友
          </button>
        </div>
      )}
      <div className="friend-scroll">
        <div
          className="friend-row"
          style={
            !previewOnly && !displayed.length ? { display: "none" } : undefined
          }
        >
          {displayed.map((m, i) => (
            <div
              className={`friend-slot ${i ? "extra-friend" : ""}`}
              key={m.id}
            >
              <HangingFriend
                member={m}
                reduced={reduced}
                relief={pref.relief}
                onShift={
                  m.id !== pref.currentId && pref.displayedIds.includes(m.id)
                    ? (delta) => reorder(m.id, delta)
                    : undefined
                }
                active={
                  cue?.phase === "near" &&
                  (pref.allMembers || cue.memberId === m.id)
                }
                motion={pref.motion}
                faded={chase && member?.id === m.id}
                onSelect={() => {
                  onMember?.(m.id);
                  speak(m);
                }}
              />

              {(!chase || member?.id !== m.id) && speakingId === m.id && speech}
            </div>
          ))}
          {previewOnly && previewTask && (
            <div className="preview-task">
              <b>{task?.title || previewTask.title}</b>
              <small>提醒搭子：{member?.name || "等待好友"}</small>
            </div>
          )}
        </div>
      </div>
      {follower &&
        (previewOnly ? follower : createPortal(follower, document.body))}
      {(previewOnly || message) && (
        <p role="status" className="companion-feedback">
          {message ||
            (!state.tasks.some((t) => !t.completedAt && !t.cancelledAt)
              ? "没有待办，空闲陪伴。"
              : "好友陪你把小事做完。")}
        </p>
      )}
      {previewOnly && (
        <div className="preview-actions">
          <button
            className="button"
            disabled={!member}
            onClick={() => preview("near", Math.random())}
          >
            预览临期提醒
          </button>
          <button
            className="button"
            disabled={!member}
            onClick={() => preview("overdue", Math.random())}
          >
            预览超时追逐
          </button>
          {cue?.preview && (
            <button
              className="button"
              onClick={() => {
                setCue(null);
                setMessage("");
              }}
            >
              结束预览
            </button>
          )}
          <small>网页仅在此页面内追逐；系统减少动态偏好同样生效。</small>
        </div>
      )}
    </section>
  );
}
type RigPose = {
  x: number;
  y: number;
  angle: number;
  flip: boolean;
  detached: boolean;
  flying: boolean;
  heading?: number;
  held?: boolean;
  slap?: boolean;
  recoil?: { x: number; y: number };
};
const resting: RigPose = {
  x: 0,
  y: 0,
  angle: 0,
  flip: false,
  detached: false,
  flying: false,
};
const gravity = 620;
function trajectory(home: DOMRect, x: number, y: number) {
  const distance = Math.hypot(x, y);
  const direction = { x: -x / (distance || 1), y: -y / (distance || 1) };
  const cx = home.left + 80 + x,
    cy = home.top + artTop + 80 + y;
  const margin = 256;
  const tx =
    Math.abs(direction.x) < 0.0001
      ? Infinity
      : ((direction.x > 0 ? window.innerWidth + margin : -margin) - cx) /
        direction.x;
  const ty =
    Math.abs(direction.y) < 0.0001
      ? Infinity
      : ((direction.y > 0 ? window.innerHeight + margin : -margin) - cy) /
        direction.y;
  const travel = Math.max(180, Math.min(tx, ty));
  const duration = Math.max(
    0.25,
    Math.min(0.86, travel / (1350 + Math.min(distance, 900) * 3)),
  );

  const shotX = (direction.x * travel) / duration,
    shotY = (direction.y * travel) / duration - (gravity * duration) / 2;
  return { shotX, shotY, duration };
}
const artTop = 96,
  artSize = 160,
  hookEnd = 13;

function HangingFriend({
  member,
  reduced,
  active,
  motion,
  faded,
  onSelect,
  relief,
  onShift,
}: {
  member: Companion;
  reduced: boolean;
  active: boolean;
  motion: string;
  faded: boolean;
  relief: CompanionState["relief"];
  onSelect: () => void;
  onShift?: (delta: number) => void;
}) {
  const slingEnabled = relief === "sling" || relief === "both";
  const slapEnabled = relief === "slap" || relief === "both";
  const rig = useRef<HTMLDivElement>(null);
  const [pose, setPose] = useState<RigPose>(resting);
  const [overlay, setOverlay] = useState<DOMRect | null>(null);
  const [ratio, setRatio] = useState(1);
  const frame = useRef(0),
    busy = useRef(false),
    suppress = useRef(false);
  const grip = useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const sortStart = useRef<number | null>(null);
  const style = cast.find((s) => s.id === member.template) || cast[0];
  const photoW = Math.min(1, ratio),
    photoH = Math.min(1, 1 / ratio);
  const pins =
    member.mode === "doll" && member.template !== "uploaded"
      ? style.pins
      : [
          0.5 - 0.23 * photoW,
          0.5 + 0.23 * photoW,
          1 - photoH + Math.min(0.025, member.edit.anchor * photoH),
        ];
  const pinY = pins[2] * artSize;
  const length = artTop + pinY - hookEnd;

  useEffect(() => {
    let request = 0;
    if (active && !reduced && motion !== "text" && !faded) {
      const start = performance.now();
      const swing = (now: number) => {
        if (!busy.current) {
          const t = (now - start) / 1000;
          const theta =
            motion === "swing"
              ? Math.sin(t * 4.8) * 0.77
              : motion === "lash"
                ? Math.sin(t * 9) * 0.48
                : 0;
          setPose({
            ...resting,
            x: length * Math.sin(theta),
            y: length * (Math.cos(theta) - 1),
            flip: motion === "mirror" && Math.cos(t * 13) < 0,
          });
        }
        request = requestAnimationFrame(swing);
      };
      request = requestAnimationFrame(swing);
    }
    return () => {
      cancelAnimationFrame(request);
      if (!busy.current) setPose(resting);
    };
  }, [active, reduced, motion, length, faded]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frame.current);
      busy.current = false;
      grip.current = null;
      setPose(resting);
      setOverlay(null);
    };
  }, [reduced, relief, faded]);

  const floating = overlay !== null;
  useEffect(() => {
    if (!floating) return;
    const align = () => {
      if (rig.current) setOverlay(rig.current.getBoundingClientRect());
    };
    window.addEventListener("scroll", align, true);
    window.addEventListener("resize", align);
    return () => {
      window.removeEventListener("scroll", align, true);
      window.removeEventListener("resize", align);
    };
  }, [floating]);
  function release(cancelled: boolean) {
    const g = grip.current;
    if (!g) return;
    grip.current = null;
    suppress.current = g.moved || cancelled;
    const home = rig.current?.getBoundingClientRect();
    const settle = () => {
      busy.current = false;
      setPose(resting);
      setOverlay(null);
    };
    if (!home || reduced || cancelled) {
      settle();
      return;
    }
    const distance = Math.hypot(g.dx, g.dy);
    const launch = slingEnabled && distance >= 45;
    const slap = slapEnabled && !g.moved;
    if (!g.moved && !slap) {
      settle();
      return;
    }
    let x = g.dx,
      y = g.dy,
      angle = 0,
      elapsed = 0,
      last = performance.now();
    const { shotX, shotY, duration } = launch
      ? trajectory(home, x, y)
      : { shotX: 0, shotY: 0, duration: 0 };
    const windup = 0.14;
    let vx = slap ? 650 : 0,
      vy = slap ? -215 : 0;
    if (launch)
      void new Audio("/brand/sling-whoosh.wav").play().catch(() => {});
    setOverlay(home);
    const step = (time: number) => {
      const dt = Math.min(0.032, (time - last) / 1000);
      elapsed += dt;
      last = time;
      const flightAge = Math.max(0, elapsed - windup);
      const flying = launch && elapsed >= windup && flightAge < duration;
      const charging = launch && elapsed < windup;
      if (charging) {
        const pulse = Math.sin(elapsed * 157) * (1 - elapsed / windup);
        x = g.dx + 7 * pulse;
        y = g.dy;
        angle = 12 * pulse;
      } else if (launch && flightAge < duration + 0.16) {
        const t = Math.min(flightAge, duration);
        x = g.dx + shotX * t;
        y = g.dy + shotY * t + 0.5 * gravity * t * t;
        angle = (g.dx > 0 ? -1 : 1) * (560 + Math.min(distance, 650)) * t;
      } else if (relief === "off") {
        const remaining = Math.max(0, 1 - elapsed / 0.35);
        x = g.dx * remaining ** 3;
        y = g.dy * remaining ** 3;
        angle = Math.atan(x / 125) * 29;
        if (remaining === 0) {
          settle();
          return;
        }
      } else {
        vx += (-56 * x - 12 * vx) * dt;
        vy += (-68 * y - 13 * vy) * dt;
        x += vx * dt;
        y += vy * dt;
        angle = slap
          ? 720 * (1 - Math.max(0, 1 - elapsed / 0.83) ** 2)
          : ((((angle % 360) + 540) % 360) - 180) * Math.exp(-8 * dt);
        if (
          (!slap || elapsed >= 0.83) &&
          Math.abs(x) + Math.abs(y) + Math.abs(vx) + Math.abs(vy) < 1
        ) {
          settle();
          return;
        }
      }
      const spring = launch
        ? Math.exp(-22 * flightAge) * Math.cos(23 * flightAge)
        : 0;
      setPose({
        recoil: { x: g.dx * spring, y: g.dy * spring },
        slap,
        x,
        y,
        angle,
        heading:
          (Math.atan2(shotY + gravity * flightAge, shotX) * 180) / Math.PI,
        flip: false,
        detached:
          launch &&
          !charging &&
          (flightAge < duration + 0.16 || Math.abs(x) + Math.abs(y) > 5),
        flying,
      });
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }
  function startPull(e: React.PointerEvent<Element>) {
    if (!e.isPrimary || e.button !== 0 || faded) return;
    cancelAnimationFrame(frame.current);
    busy.current = true;
    suppress.current = false;
    grip.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: pose.x,
      startY: pose.y,
      dx: pose.x,
      dy: pose.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function movePull(e: React.PointerEvent<Element>) {
    const g = grip.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    g.dx = dx + g.startX;
    g.dy = dy + g.startY;
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (g.moved) {
      if (!overlay) setOverlay(rig.current!.getBoundingClientRect());
      setPose({
        ...resting,
        held: true,
        x: g.dx,
        y: g.dy,
        angle: Math.atan(g.dx / 125) * 29,
      });
    }
  }
  const handlers = {
    onPointerDown: startPull,
    onPointerMove: movePull,
    onPointerUp: (e: React.PointerEvent<Element>) => {
      if (grip.current?.id === e.pointerId) release(false);
    },
    onPointerCancel: () => release(true),
    onLostPointerCapture: () => release(true),
  };
  const rad = (pose.angle * Math.PI) / 180;
  const cords = (floating: boolean) =>
    pins.slice(0, 2).map((pin, i) => {
      const px = artSize * pin,
        delta = px - 80;
      const end = {
        x1: px,
        y1: hookEnd,
        x2: pose.detached
          ? px + (pose.recoil?.x ?? 0)
          : 80 + pose.x + delta * Math.cos(rad),
        y2: pose.detached
          ? artTop + pinY + (pose.recoil?.y ?? 0)
          : artTop + pinY + pose.y + delta * Math.sin(rad),
      };
      return (
        <g key={i}>
          {(!overlay || floating || pose.detached) &&
            !(floating && pose.detached) && (
              <line {...end} stroke="#838b92" strokeWidth="1.6" />
            )}
          {!floating && (
            <>
              <line
                {...end}
                stroke="transparent"
                strokeWidth="14"
                style={{
                  pointerEvents: "stroke",
                  cursor: "grab",
                  touchAction: "none",
                }}
                {...handlers}
              />
              <path
                d={`M${px - 4},5 c0,-7 10,-8 10,-1 c0,5 -6,5 -6,9`}
                fill="none"
                stroke="#51585e"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </>
          )}
        </g>
      );
    });
  const transform = `translate(${pose.x}px,${pose.y}px) rotate(${pose.angle}deg) scaleX(${pose.flip ? -1 : 1})`;
  const artStyle = { top: artTop, transform, transformOrigin: `50% ${pinY}px` };
  const aim =
    overlay && pose.held && slingEnabled && Math.hypot(pose.x, pose.y) >= 45
      ? trajectory(overlay, pose.x, pose.y)
      : null;
  return (
    <div
      ref={rig}
      className={`friend-hanging anchored-rig ${active && !reduced ? `near-${motion}` : ""}`}
      style={{ opacity: faded ? 0.15 : 1 }}
      onLoadCapture={(e) => {
        const img = e.target;
        if (
          (member.mode !== "doll" || member.template === "uploaded") &&
          img instanceof HTMLImageElement &&
          img.naturalHeight
        )
          setRatio(img.naturalWidth / img.naturalHeight);
      }}
    >
      <svg className="friend-cords" viewBox="0 0 160 256" aria-hidden="true">
        {cords(false)}
      </svg>
      <button
        aria-label={member.name}
        className="rig-art"
        style={{ ...artStyle, opacity: overlay ? 0 : 1 }}
        {...handlers}
        onClick={() => {
          if (!suppress.current) onSelect();
          suppress.current = false;
        }}
      >
        <MemberArt member={member} />
      </button>
      {onShift && (
        <button
          className="rack-sort-grip"
          title="左右拖动挂钩排序"
          aria-label={"调整" + member.name + "的位置"}
          onPointerDown={(e) => {
            if (!e.isPrimary || e.button !== 0) return;
            sortStart.current = e.clientX;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (sortStart.current !== null)
              onShift(Math.round((e.clientX - sortStart.current) / 176));
            sortStart.current = null;
          }}
          onPointerCancel={() => {
            sortStart.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              onShift(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        />
      )}
      {overlay &&
        createPortal(
          <div
            className="rig-overlay"
            style={{ left: overlay.left, top: overlay.top }}
          >
            <svg viewBox="0 0 160 256" aria-hidden="true">
              {cords(true)}
              {aim &&
                slingEnabled &&
                !reduced &&
                Math.hypot(pose.x, pose.y) >= 45 &&
                [0, 1, 2, 3, 4].map((i) => {
                  const t = 0.065 + i * 0.044;
                  return (
                    <circle
                      key={i}
                      cx={80 + pose.x + aim.shotX * t}
                      cy={
                        artTop +
                        80 +
                        pose.y +
                        aim.shotY * t +
                        (gravity * t * t) / 2
                      }
                      r={3.5 - i * 0.33}
                      fill="white"
                      stroke="#487873"
                      opacity={1 - i * 0.12}
                    />
                  );
                })}
              {pose.flying && (
                <g
                  transform={`translate(${80 + pose.x} ${artTop + 80 + pose.y}) rotate(${pose.heading})`}
                >
                  {[-1, 0, 1].map((i) => (
                    <line
                      key={i}
                      x1={-71}
                      y1={i * 14}
                      x2={i === 0 ? -112 : -99}
                      y2={i * 14}
                      stroke={i === 0 ? "#ffaa45" : "#49958e"}
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              )}
            </svg>
            <div
              className={
                "rig-art" +
                (pose.flying ? " soaring" : pose.slap ? " smacked" : "")
              }
              style={artStyle}
            >
              <MemberArt member={member} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
