"use client";
import { FaceAdjustments } from "./face-adjustments";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CustomDoll, PhotoEdit } from "@/lib/companion";
import { assetUrl, putAsset } from "@/lib/companion-store";
import { encode, loadPhoto, matte } from "@/lib/photo-pixels";

type Point = [number, number];
type Tool =
  | "subject"
  | "erase"
  | "restore"
  | "outline"
  | "open"
  | "patch"
  | "place";
export type TemplateResult = {
  template: CustomDoll;
  composite: HTMLCanvasElement;
};
const size = 768;
function makeLayer() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}
function square(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const scale = size / Math.max(source.width, source.height);
  const w = source.width * scale,
    h = source.height * scale;
  canvas.getContext("2d")!.drawImage(source, (size - w) / 2, size - h, w, h);
  return canvas;
}
function polygon(points: Point[]) {
  const path = new Path2D();
  points.forEach(([x, y], i) =>
    i ? path.lineTo(x * size, y * size) : path.moveTo(x * size, y * size),
  );
  path.closePath();
  return path;
}
function bounds(points: Point[]) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
function drawDoll(
  c: HTMLCanvasElement,
  body: HTMLCanvasElement,
  points: Point[],
  photo: HTMLCanvasElement | null,
  edit: PhotoEdit,
  mask: HTMLCanvasElement | null,
  layer: HTMLCanvasElement,
) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(body, 0, 0);
  if (points.length < 3) return;
  const box = bounds(points);
  const face = layer.getContext("2d")!;
  face.clearRect(0, 0, size, size);
  ctx.save();
  if (mask) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.clip(polygon(points));
    ctx.clearRect(0, 0, size, size);
  }
  if (photo) {
    const w = box.w * size,
      h = box.h * size;
    face.save();
    face.translate(
      box.x * size + w * (0.5 + edit.x / 100),
      box.y * size + h * (0.5 + edit.y / 100),
    );
    face.rotate((edit.rotation * Math.PI) / 180);
    const scale = Math.max(w / photo.width, h / photo.height) * edit.zoom;
    face.scale(scale * edit.stretchX, scale * edit.stretchY);
    face.drawImage(photo, -photo.width / 2, -photo.height / 2);
    face.restore();
    if (mask) {
      face.save();
      face.globalCompositeOperation = "destination-in";
      face.drawImage(mask, 0, 0);
      face.restore();
    }
    ctx.drawImage(layer, 0, 0);
  }
  ctx.restore();
}
type Body = {
  source: HTMLCanvasElement;
  pixels: HTMLCanvasElement;
  originalFile?: File;
  sourceRef: string;
  cutoutRef: string;
};
export function CustomTemplateEditor({
  initial,
  photo,
  edit,
  onEdit,
  chooseFace,
  restoreFace,
  active,
  save,
  setStatus,
  setError,
  close,
}: {
  initial?: CustomDoll | null;
  photo: HTMLCanvasElement | null;
  edit: PhotoEdit;
  onEdit: (e: PhotoEdit) => void;
  chooseFace: (file: File) => Promise<boolean>;
  restoreFace: () => void;
  active: boolean;
  save: (r: TemplateResult) => Promise<void>;
  setStatus: (s: string) => void;
  setError: (s: string) => void;
  close: () => void;
}) {
  const [loadingTemplate, setLoadingTemplate] = useState(Boolean(initial));
  const [body, setBody] = useState<Body | null>(null),
    [points, setPoints] = useState<Point[]>(initial?.opening || []);
  const [tool, setTool] = useState<Tool>(initial ? "place" : "subject"),
    [brush, setBrush] = useState(24);
  const openingMask = useRef<HTMLCanvasElement | null>(null);
  const maskAsset = useRef(initial?.openingMask || "");
  const [fineBrush, setFineBrush] = useState(8);
  const refining = tool === "open" || tool === "patch";
  const [faceLayer] = useState(() => makeLayer());
  const [revision, refresh] = useState(0);
  const drawing = useRef<HTMLCanvasElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    faceInput = useRef<HTMLInputElement>(null);
  const stroke = useRef<{
    pointer: number;
    start: Point;
    last: Point;
    path: Point[];
    paintLayer?: HTMLCanvasElement;
    moved?: boolean;
    x: number;
    y: number;
  } | null>(null);
  const subject = tool === "subject" || tool === "erase" || tool === "restore";
  const history = useRef<Array<ReturnType<typeof snapshot>>>([]);
  const [undoCount, setUndoCount] = useState(0);
  const sliderGesture = useRef(false),
    sliderRecorded = useRef(false);
  const undoButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z" &&
        undoButton.current &&
        !undoButton.current.matches(":disabled")
      ) {
        event.preventDefault();
        undoButton.current.click();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [active]);
  function snapshot() {
    return {
      body,
      points,
      mask: openingMask.current,
      maskRef: maskAsset.current,
      edit,
      tool,
      restoreFace,
    };
  }
  function remember(previous = snapshot()) {
    history.current.push(previous);
    if (history.current.length > 32) history.current.shift();
    setUndoCount(history.current.length);
  }
  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    stroke.current = null;
    openingMask.current = previous.mask;
    maskAsset.current = previous.maskRef;
    setBody(previous.body);
    setPoints(previous.points);
    setTool(previous.tool);
    previous.restoreFace();
    onEdit(previous.edit);
    setError("");
    setUndoCount(history.current.length);
    refresh((n) => n + 1);
  }
  function go(next: Tool) {
    if (next === tool) return;
    remember();
    setTool(next);
    setError("");
  }
  function adjustFace(next: PhotoEdit) {
    if (!sliderGesture.current || !sliderRecorded.current) remember();
    sliderRecorded.current = true;
    onEdit(next);
  }
  const alive = useRef(false),
    job = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    let current = true;
    if (initial) {
      Promise.all(
        [
          initial.source,
          initial.cutout,
          ...(initial.openingMask ? [initial.openingMask] : []),
        ].map(async (r) => square((await loadPhoto(await assetUrl(r))).pixels)),
      )
        .then(([source, pixels, mask]) => {
          if (!current) return;
          openingMask.current = mask || null;
          setBody({
            source,
            pixels,
            sourceRef: initial.source,
            cutoutRef: initial.cutout,
          });
        })
        .catch(() => {
          if (current) setError("模板读取失败，请重新上传模板。");
        })
        .finally(() => {
          if (current) setLoadingTemplate(false);
        });
    }
    return () => {
      alive.current = false;
      current = false;
      job.current?.abort();
    };
  }, [initial, setError]);
  useLayoutEffect(() => {
    const c = drawing.current;
    if (!c || !body) return;
    const ctx = c.getContext("2d")!;
    if (tool === "place") {
      drawDoll(
        c,
        body.pixels,
        points,
        photo,
        edit,
        openingMask.current,
        faceLayer,
      );
      return;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(body.pixels, 0, 0);
    if (
      refining ||
      (tool === "outline" && openingMask.current && !stroke.current)
    ) {
      ctx.save();
      ctx.globalAlpha = 0.49;
      if (openingMask.current) ctx.drawImage(openingMask.current, 0, 0);
      else {
        ctx.fillStyle = "#f2a91b";
        ctx.fill(polygon(points));
      }
      ctx.restore();
      return;
    }
    if (tool === "outline") {
      const outline = stroke.current?.path || points;
      if (!outline.length) return;
      const path = polygon(outline);
      ctx.save();
      ctx.fillStyle = "#ffc65452";
      ctx.fill(path);
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 4;
      ctx.stroke(path);
      ctx.strokeStyle = "#ffea97";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke(path);
      ctx.restore();
    }
  }, [body, points, tool, photo, edit, revision, refining, faceLayer]);
  async function upload(file: File) {
    setError("");
    setStatus("读取小人模板…");
    let url = "";
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      )
        throw Error("请选择 20MB 以内的 PNG、JPG 或 WebP 模板");
      url = URL.createObjectURL(file);
      const source = square((await loadPhoto(url)).pixels);
      if (!alive.current) return;
      remember();
      setBody({
        source,
        pixels: square(source),
        originalFile: file,
        sourceRef: "",
        cutoutRef: "",
      });
      openingMask.current = null;
      maskAsset.current = "";
      setPoints([]);
      setTool("subject");
      onEdit({
        ...edit,
        zoom: 1,
        stretchX: 1,
        stretchY: 1,
        x: 0,
        y: 0,
        rotation: 0,
      });
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "读取模板失败");
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (alive.current) setStatus("");
    }
  }
  async function removeBackground() {
    if (!body) return;
    const abort = new AbortController();
    job.current = abort;
    setError("");
    setStatus("正在抠出小人…");
    try {
      const pixels = await matte(body.source, abort.signal, setStatus);
      if (alive.current) {
        remember();
        setBody({ ...body, pixels, cutoutRef: "" });
        setTool("erase");
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "自动抠图失败");
    } finally {
      if (alive.current) setStatus("");
    }
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const r = e.currentTarget.getBoundingClientRect(),
      clamp = (n: number) => Math.max(0, Math.min(1, n));
    return [
      clamp((e.clientX - r.x) / r.width),
      clamp((e.clientY - r.y) / r.height),
    ];
  }
  function paint(from: Point, to: Point) {
    if (!body) return;
    const gesture = stroke.current;
    if (!gesture) return;
    if (!gesture.paintLayer) {
      remember();
      const layer = makeLayer(),
        ink = layer.getContext("2d")!;
      if (refining) {
        if (openingMask.current) ink.drawImage(openingMask.current, 0, 0);
        else {
          ink.fillStyle = "#f2a91b";
          ink.fill(polygon(points));
        }
        openingMask.current = layer;
        maskAsset.current = "";
      } else {
        ink.drawImage(body.pixels, 0, 0);
        setBody({ ...body, pixels: layer, cutoutRef: "" });
      }
      gesture.paintLayer = layer;
    }
    const ctx = gesture.paintLayer.getContext("2d")!;
    ctx.save();
    const radius = (refining ? fineBrush : brush) / 2;
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    ctx.beginPath();
    ctx.arc(
      from[0] * size,
      from[1] * size,
      radius,
      angle + Math.PI / 2,
      angle + (3 * Math.PI) / 2,
    );
    ctx.arc(
      to[0] * size,
      to[1] * size,
      radius,
      angle - Math.PI / 2,
      angle + Math.PI / 2,
    );
    ctx.closePath();
    ctx.clip();
    ctx.clearRect(0, 0, size, size);
    if (tool === "restore") ctx.drawImage(body.source, 0, 0);
    if (tool === "open") {
      ctx.fillStyle = "#f2a91b";
      ctx.fillRect(0, 0, size, size);
    }
    ctx.restore();
    refresh((n) => n + 1);
  }
  async function confirm() {
    if (!body || points.length < 3 || !photo) return;
    setError("");
    setStatus("保存模板与照片…");
    try {
      const mask = openingMask.current;
      if (
        mask &&
        !mask
          .getContext("2d")!
          .getImageData(0, 0, size, size)
          .data.some((v, i) => i % 4 === 3 && v > 0)
      )
        throw Error(
          "脸部开口已全部补回，请用「擦大开口」画出照片要显示的位置。",
        );
      const maskRef = mask
        ? maskAsset.current || (await putAsset(await encode(mask)))
        : undefined;
      const source = body.sourceRef || (await putAsset(body.originalFile!));
      const cutout =
        body.cutoutRef || (await putAsset(await encode(body.pixels)));
      const composite = document.createElement("canvas");
      composite.width = composite.height = size;
      drawDoll(composite, body.pixels, points, photo, edit, mask, faceLayer);
      if (alive.current)
        await save({
          template: { source, cutout, opening: points, openingMask: maskRef },
          composite,
        });
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "模板保存失败");
        setStatus("");
      }
    }
  }
  if (loadingTemplate) return <p role="status">读取自定义模板…</p>;
  return (
    <div className="template-workshop">
      <div className="wizard-bar">
        <div className="wizard-steps" aria-label="模板制作步骤">
          <button
            type="button"
            aria-current={subject ? "step" : undefined}
            onClick={() => go("subject")}
          >
            1 选择模板
          </button>
          <button
            type="button"
            disabled={!body}
            aria-current={!subject ? "step" : undefined}
            onClick={() => go(points.length >= 3 ? "place" : "outline")}
          >
            2 替换脸部
          </button>
        </div>
        <button
          type="button"
          ref={undoButton}
          className="wizard-undo"
          disabled={!undoCount}
          onClick={undo}
          title="Ctrl / ⌘ + Z"
        >
          撤销上一步
        </button>
      </div>
      <section className="wizard-workspace">
        <header>
          <h3>
            {subject
              ? "选择模板照片"
              : tool === "place"
                ? "放入脸部照片"
                : refining
                  ? "微调开口边缘"
                  : "圈脸部开口"}
          </h3>
          <p>
            {subject
              ? "可直接使用整张原图，也可以先抠出主体。"
              : tool === "place"
                ? "拖动照片对齐五官，或调整下方的比例。"
                : refining
                  ? "黄色区域会露出照片。沿边缘擦大，或把多擦的部分补回。"
                  : "沿脸部轮廓描一圈，松手闭合。保留头发和衣领会更自然。"}
          </p>
        </header>
        <input
          hidden
          type="file"
          ref={fileInput}
          aria-label="上传小人模板"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        {subject && (
          <div className="template-toolbar">
            <button
              className="button"
              onClick={() => fileInput.current?.click()}
            >
              {body ? "更换模板" : "上传小人模板"}
            </button>
            {body && (
              <button
                className="button"
                onClick={() => void removeBackground()}
              >
                模板自动抠图
              </button>
            )}
            {body && tool === "subject" && (
              <button className="text-button" onClick={() => go("erase")}>
                手动修边
              </button>
            )}
          </div>
        )}
        {body && (
          <>
            {(tool === "erase" || tool === "restore") && (
              <div className="template-toolbar" aria-label="主体修边">
                <button
                  className="button"
                  aria-pressed={tool === "erase"}
                  onClick={() => setTool("erase")}
                >
                  橡皮擦
                </button>
                <button
                  className="button"
                  aria-pressed={tool === "restore"}
                  onClick={() => setTool("restore")}
                >
                  恢复画笔
                </button>
              </div>
            )}
            {refining && (
              <div className="template-toolbar" aria-label="开口修边">
                <button
                  className="button"
                  aria-pressed={tool === "open"}
                  onClick={() => setTool("open")}
                >
                  擦大开口
                </button>
                <button
                  className="button"
                  aria-pressed={tool === "patch"}
                  onClick={() => setTool("patch")}
                >
                  补回边缘
                </button>
              </div>
            )}
            {tool === "place" && (
              <div className="template-toolbar">
                <button
                  className="button"
                  onClick={() => faceInput.current?.click()}
                >
                  {photo ? "更换脸部照片" : "上传脸部照片"}
                </button>
                <button className="text-button" onClick={() => go("outline")}>
                  编辑脸部开口
                </button>
              </div>
            )}
            <canvas
              ref={drawing}
              className="template-canvas checker"
              aria-label="自定义小人画布"
              width={size}
              height={size}
              onPointerDown={(e) => {
                if (e.button !== 0 || !e.isPrimary || tool === "subject")
                  return;
                const p = pos(e);
                stroke.current = {
                  pointer: e.pointerId,
                  start: p,
                  last: p,
                  path: [p],
                  x: edit.x,
                  y: edit.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
                if (tool === "restore" || tool === "erase" || refining)
                  paint(p, p);
                else refresh((n) => n + 1);
              }}
              onPointerMove={(e) => {
                const s = stroke.current;
                if (!s || s.pointer !== e.pointerId) return;
                const p = pos(e);
                if (tool === "outline") {
                  if (
                    s.path.length < 2048 &&
                    Math.hypot(p[0] - s.last[0], p[1] - s.last[1]) > 0.002
                  ) {
                    s.path.push(p);
                    s.last = p;
                    refresh((n) => n + 1);
                  }
                  return;
                }
                if (tool === "place") {
                  if (!s.moved) {
                    if (p[0] === s.start[0] && p[1] === s.start[1]) return;
                    remember();
                    s.moved = true;
                  }
                  const box = bounds(points);
                  const clamp = (n: number) => Math.max(-500, Math.min(500, n));
                  onEdit({
                    ...edit,
                    x: clamp(s.x + ((p[0] - s.start[0]) * 100) / box.w),
                    y: clamp(s.y + ((p[1] - s.start[1]) * 100) / box.h),
                  });
                } else paint(s.last, p);
                s.last = p;
              }}
              onPointerUp={(e) => {
                const s = stroke.current;
                if (!s || s.pointer !== e.pointerId) return;
                stroke.current = null;
                if (tool === "outline") {
                  const area =
                    Math.abs(
                      s.path.reduce((a, p, i) => {
                        const q = s.path[(i + 1) % s.path.length];
                        return a + p[0] * q[1] - q[0] * p[1];
                      }, 0),
                    ) / 2;
                  if (area > 0.0002) {
                    remember();
                    openingMask.current = null;
                    maskAsset.current = "";
                    setPoints(s.path);
                    setTool("outline");
                    setError("");
                    onEdit({
                      ...edit,
                      x: 0,
                      y: 0,
                      zoom: 1,
                      stretchX: 1,
                      stretchY: 1,
                      rotation: 0,
                    });
                  } else setError("请沿脸部轮廓描出一个有面积的开口。");
                }
                refresh((n) => n + 1);
              }}
              onLostPointerCapture={() => {
                stroke.current = null;
                refresh((n) => n + 1);
              }}
            />
            {(tool === "erase" || tool === "restore" || refining) && (
              <label className="adjust-photo">
                笔刷大小
                <input
                  type="range"
                  min={refining ? 1 : 3}
                  max={refining ? 32 : 100}
                  value={refining ? fineBrush : brush}
                  onChange={(e) =>
                    (refining ? setFineBrush : setBrush)(+e.target.value)
                  }
                />
                <output>{refining ? fineBrush : brush} px</output>
              </label>
            )}
            {tool === "place" && photo && (
              <div
                onPointerDownCapture={() => {
                  sliderGesture.current = true;
                  sliderRecorded.current = false;
                }}
                onPointerUpCapture={() => {
                  sliderGesture.current = false;
                }}
                onPointerCancel={() => {
                  sliderGesture.current = false;
                }}
              >
                <FaceAdjustments edit={edit} onChange={adjustFace} />
              </div>
            )}
            <input
              type="file"
              hidden
              ref={faceInput}
              aria-label="上传脸部照片"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) {
                  const previous = snapshot();
                  void chooseFace(f).then((ok) => {
                    if (ok && alive.current) remember(previous);
                  });
                }
              }}
            />
          </>
        )}
      </section>
      <div className="modal-actions wizard-actions">
        {subject ? (
          <>
            <button className="button" onClick={close}>
              取消
            </button>
            <button
              className="button primary"
              disabled={!body}
              onClick={() => go("outline")}
            >
              下一步 · 替换脸部
            </button>
          </>
        ) : (
          <>
            <button
              className="button"
              onClick={() =>
                go(tool === "place" || refining ? "outline" : "subject")
              }
            >
              上一步
            </button>
            {tool === "outline" && points.length >= 3 && (
              <button className="button" onClick={() => go("open")}>
                微调开口
              </button>
            )}
            {tool === "place" ? (
              <button
                className="button primary"
                disabled={!body || points.length < 3 || !photo}
                onClick={() => void confirm()}
              >
                使用这个造型
              </button>
            ) : (
              <button
                className="button primary"
                disabled={points.length < 3}
                onClick={() => go("place")}
              >
                放入照片
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
