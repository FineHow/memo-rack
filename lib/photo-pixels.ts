export type Photo = { pixels: HTMLCanvasElement; ref?: string };
export async function loadPhoto(url: string): Promise<Photo> {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (img.width * img.height > 40000000)
    throw Error("请选择 4000 万像素以内的照片");
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const pixels = document.createElement("canvas");
  pixels.width = Math.max(1, Math.round(img.width * scale));
  pixels.height = Math.max(1, Math.round(img.height * scale));
  pixels.getContext("2d")!.drawImage(img, 0, 0, pixels.width, pixels.height);
  return { pixels };
}

export function encode(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("照片保存失败"))),
      "image/png",
    ),
  );
}

export async function matte(
  source: HTMLCanvasElement,
  signal: AbortSignal,
  progress: (text: string) => void,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(source);
  if (signal.aborted) {
    bitmap.close();
    throw new DOMException("已取消", "AbortError");
  }
  const worker = new Worker("/matting-worker.js", { type: "module" });
  try {
    const alpha = await new Promise<ImageBitmap>((resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("已取消", "AbortError")),
        { once: true },
      );
      worker.onerror = () => reject(Error("自动抠图失败，请重试"));
      worker.onmessage = ({ data }) => {
        if (data.stage) progress(data.stage);
        if (data.error) reject(Error(data.error));
        if (data.alpha) resolve(data.alpha);
      };
      worker.postMessage({ bitmap }, [bitmap]);
    });
    const pixels = source.cloneNode(false) as HTMLCanvasElement;
    const ctx = pixels.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(alpha, 0, 0, pixels.width, pixels.height);
    alpha.close();
    ctx.globalCompositeOperation = "source-over";
    return pixels;
  } finally {
    worker.terminate();
    bitmap.close();
  }
}
