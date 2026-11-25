// Local portrait matting. Worker termination cancels both loading and inference.
import * as ort from "./ort/ort.wasm.min.mjs";
ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1;
self.onmessage = async ({ data: { bitmap } }) => {
  let session;
  try {
    self.postMessage({ stage: "正在载入本地人像模型（25MB）" });
    session = await ort.InferenceSession.create("/models/modnet.onnx", {
      executionProviders: ["wasm"],
    });
    const scale = Math.min(512 / Math.min(bitmap.width, bitmap.height), 1024 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(32, Math.round((bitmap.width * scale) / 32) * 32),
      h = Math.max(32, Math.round((bitmap.height * scale) / 32) * 32);
    const canvas = new OffscreenCanvas(w, h),
      ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data,
      input = new Float32Array(3 * w * h);
    for (let i = 0; i < w * h; i++)
      for (let c = 0; c < 3; c++)
        input[c * w * h + i] = pixels[i * 4 + c] / 127.5 - 1;
    self.postMessage({ stage: "正在本机识别人像边缘；可随时取消" });
    const result = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]),
    });
    const mask = result[session.outputNames[0]],
      mw = mask.dims.at(-1),
      mh = mask.dims.at(-2);
    const out = new OffscreenCanvas(mw, mh),
      oc = out.getContext("2d"),
      image = oc.createImageData(mw, mh);
    for (let i = 0; i < mw * mh; i++) {
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = Math.max(
        0,
        Math.min(255, Math.round(mask.data[i] * 255)),
      );
    }
    oc.putImageData(image, 0, 0);
    const alpha = out.transferToImageBitmap();
    self.postMessage({ alpha }, [alpha]);
  } catch (e) {
    self.postMessage({
      error:
        "本地去背景失败：" + e.message + "。可以重试或使用原图。",
    });
  } finally {
    bitmap.close();
    if (session) await session.release();
  }
};
