import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Orbitron";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";

const display = loadDisplay("normal", { weights: ["900"] });
const body = loadBody("normal", { weights: ["700", "900"] });

export const Scene2Tournaments: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const trophyIn = spring({ frame: frame - 12, fps, config: { damping: 9, stiffness: 110 } });
  const trophyFloat = Math.sin(frame / 12) * 12;

  const stats = [
    { label: "بطولات يومية", value: "24/7", delay: 20 },
    { label: "جوائز كؤوس", value: "+5K", delay: 30 },
    { label: "لاعب فعّال", value: "12K+", delay: 40 },
  ];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: body.fontFamily,
          fontWeight: 900,
          fontSize: 90,
          color: COLORS.text,
          direction: "rtl",
          textAlign: "center",
          transform: `translateY(${(1 - titleIn) * 60}px)`,
          opacity: titleIn,
          textShadow: `0 0 30px ${COLORS.accent}88`,
        }}
      >
        بطولات <span style={{ color: COLORS.accent }}>وكؤوس</span>
      </div>
      {/* trophy icon */}
      <div
        style={{
          fontSize: 200,
          transform: `scale(${trophyIn}) translateY(${trophyFloat}px)`,
          margin: "20px 0",
          filter: `drop-shadow(0 20px 40px ${COLORS.accent}aa)`,
        }}
      >
        🏆
      </div>
      <div style={{ display: "flex", gap: 50, marginTop: 30 }}>
        {stats.map((s, i) => {
          const v = interpolate(frame, [s.delay, s.delay + 25], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={i}
              style={{
                background: `linear-gradient(135deg, ${COLORS.surface}, ${COLORS.bgDeep})`,
                border: `2px solid ${COLORS.accent}66`,
                padding: "24px 40px",
                borderRadius: 12,
                textAlign: "center",
                transform: `translateY(${(1 - v) * 40}px)`,
                opacity: v,
                boxShadow: `0 10px 30px ${COLORS.accent}22`,
                direction: "rtl",
              }}
            >
              <div style={{ fontFamily: display.fontFamily, fontSize: 56, color: COLORS.accent, fontWeight: 900 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: body.fontFamily, fontSize: 24, color: COLORS.muted, fontWeight: 700, marginTop: 6 }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
