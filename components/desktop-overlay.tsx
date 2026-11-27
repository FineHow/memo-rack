"use client";
import { useEffect, useRef, useState } from "react";
import { desktopBridge, type OverlayFrame } from "@/lib/desktop-bridge";
import { urgency } from "@/lib/laundry";
import { useClock } from "@/lib/laundry-store";
import { useDesktopStatus } from "@/lib/use-desktop-status";
import { useCompanions } from "@/lib/companion-store";
import { MemberArt, RigDrawing } from "./companion-rack";
import { MemoFace } from "./clothesline";
import "./desktop-surfaces.css";
export function DesktopOverlay() {
  const [frame, setFrame] = useState<OverlayFrame | null>(null);
  const chase = desktopBridge()?.surface === "chase",
    now = useClock();
  const status = useDesktopStatus(),
    { state } = useCompanions(),
    memo = useRef<HTMLDivElement>(null),
    runner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chase) return;
    return desktopBridge()?.onPursuit(({ lean, stride }) => {
      const el = runner.current;
      if (!el) return;
      el.style.setProperty("--chase-lean", `${lean.toFixed(2)}deg`);
      el.style.setProperty("--chase-lift", `${(stride * 4).toFixed(2)}px`);
    });
  }, [chase]);
  useEffect(() => {
    document.documentElement.dataset.surface = "overlay";
    return desktopBridge()?.onOverlay(setFrame);
  }, []);
  useEffect(() => {
    const el = memo.current,
      f = frame?.flight;
    if (!el || !f) return;
    const begin = frame.transform || "none";
    const frames: Keyframe[] = [{ transform: begin }];
    if (f.thrown && !f.reduced)
      frames.push({
        offset: 0.34,
        transform: begin + " translateY(-20px) scale(.55,.32) rotate(38deg)",
        borderRadius: "24%",
      });
    frames.push({
      transform: f.thrown
        ? `translate(${f.targetX}px,${f.targetY}px) scale(.06) rotate(${f.reduced ? 0 : 275}deg)`
        : "none",
      opacity: f.thrown ? 0.12 : 1,
      borderRadius: f.thrown ? "48%" : "0",
    });
    const animation = el.animate(frames, {
      duration: f.reduced ? 160 : f.thrown ? 1160 : 300,
      easing: "cubic-bezier(.4,0,.25,1)",
      fill: "forwards",
    });
    return () => animation.cancel();
  }, [frame]);
  if (chase) {
    const member = state.members.find((m) => m.id === status?.cue?.memberId);
    return status?.cue && member ? (
      <div className="desktop-follower">
        <div className="friend-bubble">{status.cue.text}</div>
        <div className="desktop-chase-motion" ref={runner}>
          <div className="desktop-chase-step">
            <div className="chase-mirror">
              <MemberArt member={member} />
            </div>
          </div>
        </div>
      </div>
    ) : null;
  }
  if (!frame) return null;
  if (frame.kind === "buddy" && frame.member && frame.pose && frame.pins)
    return (
      <RigDrawing
        member={frame.member}
        pose={frame.pose}
        pins={frame.pins}
        home={frame.home}
        aim={frame.aim}
      />
    );
  if (frame.kind === "memo" && frame.task)
    return (
      <div
        ref={memo}
        className={`loose-memo ${frame.flight?.thrown ? "rolling" : ""}`}
        style={{
          left: frame.home.x,
          top: frame.home.y,
          width: frame.home.width,
          height: frame.home.height,
          transform: frame.transform,
        }}
      >
        <MemoFace
          task={frame.task}
          now={now}
          level={urgency(frame.task, now, frame.urgentMinutes ?? 15)}
        />
      </div>
    );
  return null;
}
