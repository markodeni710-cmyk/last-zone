import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";

const body = loadBody("normal", { weights: ["700", "900"] });

const features = [
  { icon: "💬", label: "سيرفرات صوتية" },
  { icon: "🎯", label: "بحث عن سكواد" },
  { icon: "🎬", label: "مقاطع الأبطال" },
  { icon: "🏅", label: "نظام الرتب" },
];

export const Scene4Community: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: body.fontFamily,
          fontWeight: 900,
          fontSize: 80,
          color: COLORS.text,
          direction: "rtl",
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 40}px)`,
          marginBottom: 50,
        }}
      >
        كل ما يحتاجه <span style={{ color: COLORS.cyan }}>المحترف</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 28 }}>
        {features.map((f, i) => {
          const d = 10 + i * 8;
          const v = spring({ frame: frame - d, fps, config: { damping: 12, stiffness: 130 } });
          const hover = Math.sin((frame + i * 15) / 18) * 6;
          return (
            <div
              key={i}
              style={{
                width: 380,
                height: 140,
                background: `linear-gradient(135deg, ${COLORS.surface}, ${COLORS.bgDeep})`,
                border: `2px solid ${COLORS.cyan}55`,
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "0 32px",
                direction: "rtl",
                transform: `translateX(${(1 - v) * (i % 2 === 0 ? 80 : -80)}px) translateY(${hover}px) scale(${v})`,
                opacity: v,
                boxShadow: `0 10px 40px ${COLORS.cyan}22`,
              }}
            >
              <div style={{ fontSize: 70 }}>{f.icon}</div>
              <div
                style={{
                  fontFamily: body.fontFamily,
                  fontWeight: 900,
                  fontSize: 36,
                  color: COLORS.text,
                }}
              >
                {f.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
