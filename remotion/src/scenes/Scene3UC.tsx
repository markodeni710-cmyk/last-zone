import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Orbitron";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";

const display = loadDisplay("normal", { weights: ["900"] });
const body = loadBody("normal", { weights: ["700", "900"] });

export const Scene3UC: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 14 } });
  const counter = Math.floor(interpolate(frame, [10, 70], [0, 8500], { extrapolateRight: "clamp" }));
  const coinSpin = frame * 6;
  const ucPop = spring({ frame: frame - 15, fps, config: { damping: 8 } });

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
        }}
      >
        اسحب <span style={{ color: COLORS.primary }}>شدات UC</span> حقيقية
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 60 }}>
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: `conic-gradient(from ${coinSpin}deg, ${COLORS.accent}, ${COLORS.primary}, ${COLORS.accent})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: display.fontFamily,
            fontSize: 64,
            fontWeight: 900,
            color: COLORS.bg,
            transform: `scale(${ucPop})`,
            boxShadow: `0 0 60px ${COLORS.accent}aa`,
            border: `6px solid ${COLORS.accent}`,
          }}
        >
          UC
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 180,
            fontWeight: 900,
            color: COLORS.accent,
            textShadow: `0 0 40px ${COLORS.primary}aa`,
            opacity: titleIn,
            minWidth: 480,
          }}
        >
          {counter.toLocaleString()}
        </div>
      </div>

      <div
        style={{
          fontFamily: body.fontFamily,
          fontSize: 32,
          color: COLORS.muted,
          direction: "rtl",
          marginTop: 40,
          fontWeight: 700,
          opacity: interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        سحب فوري على معرف ببجي • بدون وسطاء
      </div>
    </AbsoluteFill>
  );
};
