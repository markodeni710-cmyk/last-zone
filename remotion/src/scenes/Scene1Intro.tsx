import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";

const body = loadBody("normal", { weights: ["400", "700", "900"] });

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const sweepX = interpolate(frame, [10, 50], [-100, 100], { extrapolateRight: "clamp" });
  const subFade = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [80, 100], [1, 0], { extrapolateRight: "clamp" });
  const lineScale = interpolate(frame, [15, 45], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: exitFade }}>
      {/* gold sweep lines */}
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${COLORS.primary}, transparent)`,
          transform: `scaleX(${lineScale}) translateY(-180px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${COLORS.primary}55, transparent)`,
          transform: `scaleX(${lineScale}) translateY(180px)`,
        }}
      />
      <div
        style={{
          transform: `scale(${0.5 + logoIn * 0.5})`,
          opacity: logoIn,
          filter: `drop-shadow(0 0 40px ${COLORS.primary}88)`,
          position: "relative",
        }}
      >
        <Img
          src={staticFile("images/logo.png")}
          style={{ width: 1200, height: "auto", display: "block" }}
        />
        {/* sweep highlight */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(105deg, transparent 40%, ${COLORS.cream}66 50%, transparent 60%)`,
            mixBlendMode: "screen",
            transform: `translateX(${sweepX}%)`,
            pointerEvents: "none",
          }}
        />
      </div>
      <div
        style={{
          fontFamily: body.fontFamily,
          fontWeight: 700,
          fontSize: 44,
          color: COLORS.primary,
          opacity: subFade,
          marginTop: 50,
          letterSpacing: 6,
          direction: "rtl",
        }}
      >
        مجتمع لاعبي ببجي في مكان واحد
      </div>
    </AbsoluteFill>
  );
};
