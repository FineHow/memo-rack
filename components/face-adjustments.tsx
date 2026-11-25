import type { PhotoEdit } from "@/lib/companion";

export function FaceAdjustments({
  edit,
  onChange,
}: {
  edit: PhotoEdit;
  onChange: (edit: PhotoEdit) => void;
}) {
  function slider(
    key: "zoom" | "rotation" | "stretchX" | "stretchY",
    label: string,
    min: number,
    max: number,
    step: number,
  ) {
    return (
      <label className="adjust-photo">
        {label}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={edit[key]}
          onChange={(e) => onChange({ ...edit, [key]: Number(e.target.value) })}
        />
        <output>
          {key === "rotation"
            ? edit[key] + "°"
            : Math.round(edit[key] * 100) + "%"}
        </output>
      </label>
    );
  }
  return (
    <>
      {slider("zoom", "缩放", 0.25, 10, 0.05)}
      {slider("rotation", "旋转", -180, 180, 1)}
      <details className="face-proportions">
        <summary>微调脸部比例</summary>
        {slider("stretchX", "脸部宽度", 0.7, 1.3, 0.01)}
        {slider("stretchY", "脸部高度", 0.7, 1.3, 0.01)}
        <button
          type="button"
          className="text-button"
          onClick={() => onChange({ ...edit, stretchX: 1, stretchY: 1 })}
        >
          恢复原比例
        </button>
      </details>
    </>
  );
}
