import { useId, type ReactNode } from "react";
import cast from "@/public/brand/cast.json";

export function dollStyle(template: string) {
  return cast.find((style) => style.id === template) || cast[0];
}

export function DollArt({
  template,
  name,
  children,
}: {
  template: string;
  name: string;
  children?: ReactNode;
}) {
  const clipId = useId();
  const {
    art,
    image,
    opening,
    face: [x, y, width, height],
  } = dollStyle(template);
  return (
    <div className="doll-photo" role="img" aria-label={name}>
      {opening && children && (
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          style={{ position: "absolute" }}
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <path clipRule="evenodd" d={`M0 0 H1 V1 H0 Z ${opening}`} />
            </clipPath>
          </defs>
        </svg>
      )}
      {children && (
        <div
          className="doll-face"
          style={{
            borderRadius: opening ? 0 : undefined,
            left: x * 100 + "%",
            top: y * 100 + "%",
            width: width * 100 + "%",
            height: height * 100 + "%",
          }}
        >
          {children}
        </div>
      )}
      <img
        draggable={false}
        alt=""
        src={`/brand/${image || art + (children ? "-frame" : "") + ".png"}`}
        style={
          opening && children ? { clipPath: `url(#${clipId})` } : undefined
        }
      />
    </div>
  );
}
