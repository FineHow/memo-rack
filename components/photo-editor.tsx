"use client";
import { FaceAdjustments } from "./face-adjustments";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CAT_PHOTO, DEFAULT_EDIT, type Companion } from "@/lib/companion";
import { assetUrl, putAsset } from "@/lib/companion-store";
import cast from "@/public/brand/cast.json";
import { Modal } from "./laundry-dialogs";
import { DollArt, dollStyle } from "./doll-art";

import { loadPhoto, encode, matte, type Photo } from "@/lib/photo-pixels";
import {
  CustomTemplateEditor,
  type TemplateResult,
} from "./custom-template-editor";
export function PhotoEditor({
  member,
  close,
  save,
}: {
  member: Companion;
  close: () => void;
  save: (member: Companion) => void;
}) {
  const [mode, setMode] = useState<"doll" | "photo">(
    member.mode === "doll" ? "doll" : "photo",
  );
  const [template, setTemplate] = useState(member.template);
  const [edit, setEdit] = useState({
    ...DEFAULT_EDIT,
    ...(member.mode === "doll" ? member.edit : {}),
  });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [status, setStatus] = useState(
    member.original || member.result ? "读取照片中…" : "",
  );
  const [customOpened, setCustomOpened] = useState(
    member.template === "uploaded",
  );
  const custom = mode === "doll" && template === "uploaded";
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const job = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const grip = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const style = dollStyle(template);
  const plainCat =
    mode === "doll" && template === "cat" && photo?.ref === CAT_PHOTO;
  const original = member.original || member.result;
  const savedSource =
    (member.mode === "doll" ? member.working : member.result) || original;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (savedSource) {
      void assetUrl(savedSource)
        .then(loadPhoto)
        .then((loaded) => {
          if (active) setPhoto({ ...loaded, ref: savedSource });
        })
        .catch(() => {
          if (active) setError("无法读取照片，请重新选择。");
        })
        .finally(() => {
          if (active) setStatus("");
        });
    }
    return () => {
      active = false;
      mounted.current = false;
      job.current?.abort();
    };
  }, [savedSource]);

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || !photo || mode !== "doll" || custom) return;
    const src = photo.pixels;
    c.width = 400;
    c.height = Math.round((c.width * style.face[3]) / style.face[2]);
    const ctx = c.getContext("2d")!;
    const scale =
      Math.max(c.width / src.width, c.height / src.height) * edit.zoom;
    ctx.translate(
      c.width * (0.5 + edit.x / 100),
      c.height * (0.5 + edit.y / 100),
    );
    ctx.rotate((edit.rotation * Math.PI) / 180);
    ctx.scale(scale * edit.stretchX, scale * edit.stretchY);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
  }, [photo, edit, mode, style, custom]);
  useLayoutEffect(() => {
    if (mode !== "photo" || !photo || !canvas.current) return;
    const c = canvas.current;
    c.width = photo.pixels.width;
    c.height = photo.pixels.height;
    c.getContext("2d")!.drawImage(photo.pixels, 0, 0);
  }, [mode, photo]);

  async function choose(file?: File) {
    setStatus("读取照片中…");
    setError("");
    let url = "";
    try {
      if (
        file &&
        (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 20 * 1024 * 1024)
      )
        throw Error("请选择 20MB 以内的 PNG、JPG 或 WebP 图片");
      const sourceFile = file || originalFile;
      url = sourceFile
        ? URL.createObjectURL(sourceFile)
        : await assetUrl(original);
      const loaded = await loadPhoto(url);
      if (!mounted.current) return false;
      setPhoto({ ...loaded, ref: sourceFile ? undefined : original });
      if (file) setOriginalFile(file);
      if (file || mode === "photo") setEdit({ ...DEFAULT_EDIT });
      return true;
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "照片读取失败");
      return false;
    } finally {
      if ((file || originalFile) && url) URL.revokeObjectURL(url);
      if (mounted.current) setStatus("");
    }
  }

  async function cutout() {
    if (!photo) return;
    setError("");
    setStatus("正在自动抠图…");
    const abort = new AbortController();
    job.current = abort;
    try {
      const pixels = await matte(photo.pixels, abort.signal, setStatus);
      if (mounted.current) setPhoto({ pixels });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "抠图失败");
    } finally {
      if (mounted.current) setStatus("");
    }
  }
  async function confirmPhoto(upload?: TemplateResult) {
    setStatus("保存中…");
    setError("");
    try {
      const originalRef = originalFile
        ? await putAsset(originalFile)
        : original;
      const working = photo
        ? photo.ref || (await putAsset(await encode(photo.pixels)))
        : "";
      const result = upload
        ? await putAsset(await encode(upload.composite))
        : plainCat
          ? ""
          : mode === "doll" && photo
            ? await putAsset(await encode(canvas.current!))
            : working;
      if (mounted.current)
        save({
          ...member,
          mode,
          template:
            template === "uploaded" && !upload && !member.customDoll
              ? "varsity"
              : template,
          customDoll: upload ? upload.template : member.customDoll,
          edit: mode === "doll" ? edit : { ...DEFAULT_EDIT },
          original: originalRef,
          working,
          result,
          repairSource: "",
          chasePhoto: "",
        });
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "照片保存失败");
        setStatus("");
      }
    }
  }
  const face = photo ? <canvas ref={canvas} aria-label="照片预览" /> : null;
  return (
    <Modal
      title="陪伴造型"
      className={`photo-editor simple-editor ${custom ? "template-editor-modal" : ""}`}
      close={close}
    >
      <fieldset disabled={!!status}>
        <div className="task-tabs">
          {(["doll", "photo"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              className={mode === value ? "active" : ""}
              onClick={() => setMode(value)}
            >
              {value === "doll" ? "陪伴小人" : "照片卡"}
            </button>
          ))}
        </div>
        {mode === "doll" && (
          <div className="doll-options" aria-label="选择小人">
            {cast
              .filter((s) => s.id === "varsity" || s.id === "cat")
              .map((s) => (
                <button
                  key={s.id}
                  aria-label={s.id === "varsity" ? "棒球衫员工" : "小猫"}
                  title={s.id === "varsity" ? "棒球衫员工" : "小猫"}
                  aria-pressed={template === s.id}
                  onClick={() => setTemplate(s.id)}
                >
                  <img alt="" src={`/brand/${s.image || s.art + ".png"}`} />
                  <span>{s.id === "varsity" ? "棒球衫员工" : "小猫"}</span>
                </button>
              ))}
            <button
              className="custom-template-choice"
              aria-pressed={custom}
              onClick={() => {
                setCustomOpened(true);
                setTemplate("uploaded");
              }}
            >
              自定义模板
            </button>
          </div>
        )}
        {customOpened && (
          <div hidden={!custom}>
            <CustomTemplateEditor
              initial={member.customDoll}
              photo={photo?.pixels ?? null}
              edit={edit}
              onEdit={setEdit}
              chooseFace={choose}
              restoreFace={() => {
                setPhoto(photo);
                setOriginalFile(originalFile);
              }}
              active={custom}
              save={confirmPhoto}
              setStatus={setStatus}
              setError={setError}
              close={close}
            />
          </div>
        )}
        {!custom && (
          <>
            <div
              className={`companion-art-preview ${mode}`}
              tabIndex={mode === "doll" && photo ? 0 : undefined}
              role={mode === "doll" && photo ? "group" : undefined}
              aria-label={
                mode === "doll" && photo
                  ? "脸部位置，可拖动或使用方向键调整"
                  : undefined
              }
              onKeyDown={(e) => {
                if (mode !== "doll" || !photo || status) return;
                const offsets: Record<string, [number, number]> = {
                  ArrowLeft: [-2, 0],
                  ArrowRight: [2, 0],
                  ArrowUp: [0, -2],
                  ArrowDown: [0, 2],
                };
                const offset = offsets[e.key];
                if (!offset) return;
                e.preventDefault();
                setEdit({
                  ...edit,
                  x: Math.max(-500, Math.min(500, edit.x + offset[0])),
                  y: Math.max(-500, Math.min(500, edit.y + offset[1])),
                });
              }}
              onPointerDown={(e) => {
                if (!photo || mode !== "doll" || status) return;
                grip.current = {
                  x: e.clientX,
                  y: e.clientY,
                  startX: edit.x,
                  startY: edit.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const g = grip.current;
                if (!g || !canvas.current) return;
                const r = canvas.current.getBoundingClientRect();
                setEdit({
                  ...edit,
                  x: Math.max(
                    -500,
                    Math.min(
                      500,
                      g.startX + ((e.clientX - g.x) * 100) / r.width,
                    ),
                  ),
                  y: Math.max(
                    -500,
                    Math.min(
                      500,
                      g.startY + ((e.clientY - g.y) * 100) / r.height,
                    ),
                  ),
                });
              }}
              onLostPointerCapture={() => {
                grip.current = null;
              }}
            >
              {mode === "doll" ? (
                <DollArt template={template} name={style.name}>
                  {plainCat ? null : face}
                </DollArt>
              ) : (
                face || (
                  <button
                    className="button"
                    onClick={() => input.current?.click()}
                  >
                    选择照片
                  </button>
                )
              )}
            </div>
            {mode === "doll" && photo && !plainCat && (
              <>
                <p className="edit-hint">拖动照片，让五官对齐小人的脸。</p>
                <FaceAdjustments edit={edit} onChange={setEdit} />
              </>
            )}
            <div className="photo-tools">
              {(mode === "doll" || photo) && (
                <button
                  className="button"
                  onClick={() => input.current?.click()}
                >
                  {plainCat ? "上传脸部照片" : photo ? "更换照片" : "贴上照片"}
                </button>
              )}
              {photo && (
                <>
                  <button className="button" onClick={() => void cutout()}>
                    自动抠图
                  </button>
                  <button className="text-button" onClick={() => void choose()}>
                    使用原图
                  </button>
                </>
              )}
              <input
                hidden
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void choose(file);
                }}
              />
            </div>
          </>
        )}
      </fieldset>
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!custom && (
        <div className="modal-actions">
          <button className="button" onClick={close}>
            取消
          </button>
          <button
            className="button primary"
            disabled={!!status || (!photo && (mode === "photo" || !!original))}
            onClick={() => void confirmPhoto()}
          >
            使用这个造型
          </button>
        </div>
      )}
    </Modal>
  );
}
