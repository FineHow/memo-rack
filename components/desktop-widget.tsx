"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clothesline } from "./clothesline";
import { CompanionRack } from "./companion-rack";
import { TaskDetail, TaskForm } from "./laundry-dialogs";
import { dispatchLaundry, useClock, useLaundry } from "@/lib/laundry-store";
import { desktopBridge } from "@/lib/desktop-bridge";
import { isQuiet } from "@/lib/reminders";
import "./desktop-surfaces.css";

export function DesktopWidget() {
  const { state, ready, error } = useLaundry(),
    now = useClock();
  const [dialog, setDialog] = useState<"add" | "edit" | null>(null),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState(""),
    [toolbarVisible, setToolbarVisible] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const close = useCallback(() => {
    setDialog(null);
    setSelected("");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.surface = "widget";
    const bridge = desktopBridge();
    let holding = false,
      last = "",
      inside = false,
      toolbarShown = false;
    const showToolbar = (visible: boolean) => {
      if (toolbarShown !== visible) setToolbarVisible(visible);
      toolbarShown = visible;
    };
    const hit = (e: PointerEvent) => {
      inside = !!(e.target as Element)?.closest?.(
        "button,input,select,textarea,[role=dialog],.desktop-grip,.friend-hanging line",
      );
      const rail = document
        .querySelector(".orbit-world")
        ?.getBoundingClientRect();
      const toolbar = document
        .querySelector(".desktop-toolbar")
        ?.getBoundingClientRect();
      // Keep an unbroken hover path from the rail up to the hidden toolbar.
      // Forwarded pointer moves still reach this zone while the window is click-through.
      if (
        toolbar &&
        e.clientX >= toolbar.left &&
        e.clientX <= toolbar.right &&
        e.clientY >= toolbar.top &&
        e.clientY <= (rail ? rail.top + 17 : toolbar.bottom)
      )
        inside = true;
      if (
        rail &&
        e.clientY >= rail.top + 2 &&
        e.clientY <= rail.top + 17 &&
        e.clientX >= rail.left + 16 &&
        e.clientX <= rail.right - 16
      )
        inside = true;
      // Captured pointerup can still target the original button outside the window.
      if (
        e.clientX < 0 ||
        e.clientY < 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      )
        inside = false;
      showToolbar(inside || holding);
      const value = `${inside}:${holding}`;
      if (value !== last) {
        bridge?.interact(inside, holding);
        last = value;
      }
    };
    const down = (e: PointerEvent) => {
      holding = true;
      hit(e);
    };
    const up = (e: PointerEvent) => {
      holding = false;
      hit(e);
    };
    const reset = () => {
      holding = false;
      last = "";
      showToolbar(false);
      bridge?.interact(false);
    };
    const leave = () => {
      if (!holding) reset();
    };
    window.addEventListener("pointermove", hit, true);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      delete document.documentElement.dataset.surface;
      window.removeEventListener("pointermove", hit, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);
  const task = state.tasks.find(
    (t) => t.id === selected && t.completedAt === null && !t.cancelledAt,
  );
  const perform = async (command: Parameters<typeof dispatchLaundry>[0]) => {
    try {
      await dispatchLaundry(command);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    }
  };
  return (
    <div
      className="desktop-surface"
      data-toolbar-visible={toolbarVisible || undefined}
    >
      <div className="desktop-toolbar">
        <button
          className="desktop-grip"
          title="拖动便签架"
          onPointerDown={async (e) => {
            const element = e.currentTarget,
              x = e.screenX,
              y = e.screenY;
            element.setPointerCapture(e.pointerId);
            const b = await desktopBridge()?.geometry();
            if (b && element.hasPointerCapture(e.pointerId))
              drag.current = { x, y, left: b.x, top: b.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d)
              void desktopBridge()?.widget("move", {
                x: d.left + e.screenX - d.x,
                y: d.top + e.screenY - d.y,
              });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          晾一晾便签
        </button>
        <button onClick={() => void desktopBridge()?.widget("board")}>
          看板
        </button>
        <button
          onClick={() =>
            void perform({
              type: "settings",
              input: {
                ...state.settings,
                quiet: !isQuiet(state, now),
                quietUntil: 0,
              },
            })
          }
        >
          {isQuiet(state, now) ? "恢复提醒" : "安静"}
        </button>
        <button onClick={() => void desktopBridge()?.widget("hide")}>
          收起
        </button>
        <button
          className="desktop-add"
          disabled={!ready || !!error}
          onClick={() => setDialog("add")}
        >
          ＋ 写便签
        </button>
      </div>
      <Clothesline
        tasks={state.tasks
          .filter((t) => t.completedAt === null && !t.cancelledAt)
          .sort((a, b) => a.dueAt - b.dueAt)}
        settings={state.settings}
        now={now}
        companions={
          <CompanionRack onAdd={() => void desktopBridge()?.widget("board")} />
        }
        onSelect={(t) => setSelected(t.id)}
        onComplete={(id) => void perform({ type: "complete", id })}
        onAdd={() => setDialog("add")}
      />
      {(error || message) && (
        <p className="desktop-message" role="alert">
          {error || message}
          <button onClick={() => setMessage("")}>×</button>
        </p>
      )}
      {dialog && (
        <TaskForm
          task={dialog === "edit" ? task : undefined}
          close={close}
          notify={setMessage}
        />
      )}
      {task && !dialog && (
        <TaskDetail
          task={task}
          now={now}
          close={close}
          edit={() => setDialog("edit")}
          notify={setMessage}
        />
      )}
    </div>
  );
}
