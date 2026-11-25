"use client";

import { useRef, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  countdown,
  categoryLabel,
  urgency,
  type LaundrySettings,
  type LaundryTask,
} from "@/lib/laundry";

import { useSystemReducedMotion } from "@/lib/use-reduced-motion";
import { companionSettings } from "./companion-panel";

const statusText = {
  calm: "NEXT UP",
  soon: "NEXT UP",
  urgent: "DUE SOON",
  overdue: "OVERDUE!",
};

export function Clothesline({
  tasks,
  companions,
  settings,
  now,
  onSelect,
  onComplete,
  onAdd,
}: {
  companions?: React.ReactNode;
  tasks: LaundryTask[];
  settings: LaundrySettings;
  now: number;
  onComplete: (id: string) => void;
  onSelect: (task: LaundryTask) => void;
  onAdd: () => void;
}) {
  const world = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    time: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const frame = useRef(0);
  const motion = useRef(
    new Map<
      HTMLElement,
      { bend: number; rate: number; twist: number; spin: number }
    >(),
  );
  const wind = useRef({ x: 0, y: 0, time: 0 });

  const [crewAlerts, setCrewAlerts] = useState(false);
  useEffect(() => {
    let mounted = true;
    const read = () =>
      void companionSettings("read")
        .then((p) => {
          if (mounted) setCrewAlerts(p.enabled);
        })
        .catch(() => {});
    read();
    window.addEventListener("focus", read);
    window.addEventListener("storage", read);
    return () => {
      mounted = false;
      window.removeEventListener("focus", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const systemReduce = useSystemReducedMotion();
  const still = settings.reducedMotion || systemReduce;
  const basket = useRef<HTMLDivElement>(null);
  const sheetDrag = useRef<{
    id: string;
    pointer: number;
    paper: HTMLElement;
    box: DOMRect;
    x: number;
    y: number;
    copy: HTMLElement | null;
    flight: Animation | null;
  } | null>(null);
  function clearSheet() {
    const d = sheetDrag.current;
    if (d) {
      d.flight?.cancel();
      d.copy?.remove();
      d.paper.style.removeProperty("visibility");
    }
    if (basket.current) basket.current.hidden = true;
    sheetDrag.current = null;
  }
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSheet();
    };
    window.addEventListener("keydown", cancel);
    window.addEventListener("blur", clearSheet);
    return () => {
      clearSheet();
      window.removeEventListener("keydown", cancel);
      window.removeEventListener("blur", clearSheet);
    };
  }, []);
  function dropTarget(x: number, y: number) {
    const b = basket.current!.getBoundingClientRect(),
      r = track.current!.getBoundingClientRect();
    return (
      (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) ||
      x < r.left ||
      x > r.right ||
      y < r.top ||
      y > r.bottom
    );
  }
  function moveSheet(e: React.PointerEvent) {
    const d = sheetDrag.current;
    if (!d || e.pointerId !== d.pointer || d.flight) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (!d.copy && Math.hypot(dx, dy) < 5) return;
    if (!d.copy) {
      d.copy = d.paper.cloneNode(true) as HTMLElement;
      d.copy.classList.add("loose-memo");
      d.copy.setAttribute("aria-hidden", "true");
      Object.assign(d.copy.style, {
        width: d.box.width + "px",
        height: d.box.height + "px",
        left: d.box.left + "px",
        top: d.box.top + "px",
      });
      document.body.appendChild(d.copy);
      d.paper.style.visibility = "hidden";
      basket.current!.hidden = false;
      suppressClick.current = true;
    }
    const reduce =
      still || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tilt = reduce
      ? ""
      : `perspective(600px) rotateY(${Math.tanh(dx / 100) * 20}deg) rotateX(${-Math.tanh(dy / 90) * 10}deg) rotateZ(${Math.tanh(dx / 160) * 4}deg)`;
    d.copy.style.transform = `translate(${dx}px,${dy}px) ${tilt}`;
    basket.current!.dataset.ready = String(dropTarget(e.clientX, e.clientY));
  }
  function releaseSheet(e: React.PointerEvent) {
    const d = sheetDrag.current;
    if (!d || e.pointerId !== d.pointer || d.flight) return;
    if (!d.copy) {
      clearSheet();
      return;
    }
    const thrown = dropTarget(e.clientX, e.clientY),
      bin = basket.current!.getBoundingClientRect();
    const x = bin.left + bin.width / 2 - d.box.left - d.box.width / 2,
      y = bin.top + bin.height / 2 - d.box.top - d.box.height / 2;
    const reduce =
      still || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const begin = d.copy.style.transform;
    const end = thrown
      ? `translate(${x}px,${y}px) scale(.06) rotate(${reduce ? 0 : 275}deg)`
      : "none";
    const frames: Keyframe[] = [{ transform: begin }];
    if (thrown && !reduce)
      frames.push({
        offset: 0.34,
        transform: begin + " translateY(-20px) scale(.55,.32) rotate(38deg)",
        borderRadius: "24%",
        boxShadow: "inset 0 7px 8px #24314c55",
      });
    frames.push({
      transform: end,
      opacity: thrown ? 0.12 : 1,
      borderRadius: thrown ? "48%" : "0",
    });
    if (thrown && !reduce) d.copy.classList.add("rolling");
    d.flight = d.copy.animate(frames, {
      duration: reduce ? 160 : thrown ? 1160 : 300,
      easing: "cubic-bezier(.4,0,.25,1)",
      fill: "forwards",
    });
    d.flight.onfinish = () => {
      clearSheet();
      if (thrown) onComplete(d.id);
    };
  }

  useEffect(() => {
    const bodies = motion.current;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    function stop() {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      for (const el of bodies.keys()) el.style.removeProperty("transform");
      bodies.clear();
      wind.current.x = wind.current.y = 0;
    }
    preference.addEventListener("change", stop);
    return () => {
      stop();
      preference.removeEventListener("change", stop);
    };
  }, [still]);

  function advance(time: number) {
    const gust = wind.current;
    const dt = Math.min(0.032, Math.max(0, (time - gust.time) / 1000));
    gust.time = time;
    let peak = 0;
    for (const [el, b] of motion.current) {
      if (!el.isConnected) {
        motion.current.delete(el);
        continue;
      }
      const a = Number(el.dataset.angle);
      b.rate +=
        ((gust.x * Math.cos(a) + gust.y * 0.45) * 240 -
          38 * b.bend -
          5.6 * b.rate) *
        dt;
      b.spin +=
        ((gust.x * (0.35 + Math.sin(a)) + gust.y * 0.5) * 300 -
          27 * b.twist -
          5 * b.spin) *
        dt;
      b.bend += b.rate * dt;
      b.twist += b.spin * dt;
      el.style.transform = `perspective(580px) rotateY(${Math.max(-22, Math.min(22, b.twist * 1.65))}deg) rotateX(${Math.max(-6, Math.min(6, b.bend * 0.22))}deg) rotateZ(${b.bend}deg)`;
      peak = Math.max(
        peak,
        Math.abs(b.rate) +
          Math.abs(b.spin) +
          Math.abs(b.bend) +
          Math.abs(b.twist),
      );
    }
    gust.x *= Math.exp(-11 * dt);
    gust.y *= Math.exp(-11 * dt);
    if (peak > 0.08 || Math.abs(gust.x) + Math.abs(gust.y) > 0.01)
      frame.current = requestAnimationFrame(advance);
    else {
      frame.current = 0;
      for (const el of motion.current.keys())
        el.style.removeProperty("transform");
      motion.current.clear();
    }
  }
  function blow(x: number, y: number) {
    if (still || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gust = wind.current;
    gust.x = Math.max(-5, Math.min(5, x));
    gust.y = Math.max(-4, Math.min(4, y));
    world.current
      ?.querySelectorAll<HTMLElement>(".orbit-load")
      .forEach((el) => {
        if (!motion.current.has(el))
          motion.current.set(el, { bend: 0, rate: 0, twist: 0, spin: 0 });
      });
    if (!frame.current) {
      gust.time = performance.now();
      frame.current = requestAnimationFrame(advance);
    }
  }
  return (
    <section
      className="orbit-stage"
      data-reduced={still || undefined}
      aria-label="水平待办便签架"
    >
      <div
        className="orbit-scene"
        ref={track}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary || sheetDrag.current?.flight)
            return;
          if ((e.target as Element).closest(".companion-stage")) {
            suppressClick.current = false;
            return;
          }
          const paper = (e.target as HTMLElement).closest<HTMLElement>(
            ".memo-paper[data-task]",
          );
          if (paper) {
            suppressClick.current = false;
            sheetDrag.current = {
              id: paper.dataset.task!,
              pointer: e.pointerId,
              paper,
              box: paper.getBoundingClientRect(),
              x: e.clientX,
              y: e.clientY,
              copy: null,
              flight: null,
            };
            paper.setPointerCapture(e.pointerId);
            return;
          }
          suppressClick.current = false;
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            time: e.timeStamp,
            moved: false,
          };
          (e.target as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (sheetDrag.current) {
            moveSheet(e);
            return;
          }
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const x = e.clientX - d.x,
            y = e.clientY - d.y;
          if (!d.moved && Math.hypot(x, y) < 5) return;
          d.moved = true;
          suppressClick.current = true;
          const dx = (x * 6) / e.currentTarget.clientWidth,
            dy = (y * 1.1) / e.currentTarget.clientHeight;
          const dt = Math.max(0.008, (e.timeStamp - d.time) / 1000);
          e.currentTarget.scrollLeft -= x;
          blow(dx / dt, dy / dt);
          d.x = e.clientX;
          d.y = e.clientY;
          d.time = e.timeStamp;
        }}
        onLostPointerCapture={() => {
          if (sheetDrag.current && !sheetDrag.current.flight) clearSheet();
          drag.current = null;
        }}
        onPointerUp={(e) => {
          if (sheetDrag.current) releaseSheet(e);
          drag.current = null;
        }}
        onPointerCancel={() => {
          clearSheet();
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (e.detail && suppressClick.current) {
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        <div className="orbit-world" ref={world}>
          {companions}
          {tasks.map((task, i) => {
            const a = (i % 4) * 0.12;
            const level = now
              ? urgency(task, now, settings.urgentMinutes)
              : "calm";
            return (
              <div
                key={task.id}
                className="orbit-fixture"
                data-alert={
                  (crewAlerts &&
                    i === 0 &&
                    !settings.quiet &&
                    !(settings.quietUntil && settings.quietUntil > now) &&
                    !still &&
                    (level === "urgent" || level === "overdue")) ||
                  undefined
                }
              >
                <span className="orbit-block" />
                <button
                  type="button"
                  className={`orbit-item color-${task.color}`}
                  aria-label={`查看待办：${task.title}`}
                  onClick={() => onSelect(task)}
                >
                  <span className="orbit-load" data-angle={a}>
                    <svg viewBox="0 0 180 79" fill="none" aria-hidden="true">
                      <path
                        d="M80 12a11 11 0 1 1 11 11v14L4 76h172L91 37"
                        stroke="#65666b"
                        strokeWidth="3.7"
                      />
                      <path
                        d="M79 11a11 11 0 1 1 11 11v14L3 75h172L90 36"
                        stroke="#d9dadd"
                        strokeWidth="1.4"
                      />
                    </svg>
                    <span
                      className="memo-paper"
                      data-task={task.id}
                      style={{
                        backgroundImage: `url(/memo-pads/${task.color}.png)`,
                      }}
                    >
                      <span className="memo-category">
                        {categoryLabel(task.category)}
                      </span>
                      <span className="memo-reference">
                        {"# " + task.id.slice(-6).toUpperCase()}
                      </span>
                      <strong>{task.title}</strong>
                      <time>
                        {new Date(task.dueAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      <span className="memo-note">{task.note}</span>
                      <em>{statusText[level]}</em>
                      <span className="memo-countdown">
                        {now ? countdown(task.dueAt, now) : ""}
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div ref={basket} className="memo-basket" hidden aria-label="完成收起">
        <Trash2 size={24} />
        <span>完成收起</span>
      </div>
      <div className="orbit-actions" role="group" aria-label="便签工具">
        <span>横拖便签</span>
        {tasks.length > 1 && (
          <div className="orbit-paging">
            <button
              aria-label="上一件待办"
              onClick={() => track.current?.scrollBy({ left: -186 })}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="下一件待办"
              onClick={() => track.current?.scrollBy({ left: 186 })}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <button className="orbit-add" onClick={onAdd}>
          <Plus size={15} />
          写便签
        </button>
      </div>
    </section>
  );
}

export function CompletedStamp() {
  return (
    <span className="completed-stamp">
      <Check size={14} />
      已完成
    </span>
  );
}
