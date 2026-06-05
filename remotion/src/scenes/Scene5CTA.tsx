import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";

const body = loadBody("normal", { weights: ["700", "900"] });

export const Scene5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({ frame, fps, config: { damping: 11, stiffness: 130 } });
  const subIn = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const urlIn = spring({ frame: frame - 30, fps, config: { damping: 13 } });
  const pulse = Math.sin(frame / 9) * 0.03 + 1;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* expanding gold ring */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          border: `3px solid ${COLORS.primary}`,
          transform: `scale(${interpolate(frame, [0, 70], [0.2, 2.8])})`,
          opacity: interpolate(frame, [0, 70], [0.8, 0]),
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          border: `2px solid ${COLORS.primaryGlow}`,
          transform: `scale(${interpolate(frame, [15, 85], [0.2, 2.8])})`,
          opacity: interpolate(frame, [15, 85], [0.6, 0]),
        }}
      />

      <div
        style={{
          transform: `scale(${logoIn * pulse})`,
          filter: `drop-shadow(0 0 60px ${COLORS.primary}aa) drop-shadow(0 0 120px ${COLORS.primary}55)`,
        }}
      >
        <Img
          src={staticFile("images/logo.png")}
          style={{ width: 1100, height: "auto", display: "block" }}
        />
      </div>

      <div
        style={{
          fontFamily: body.fontFamily,
          fontWeight: 900,
          fontSize: 50,
          color: COLORS.text,
          opacity: subIn,
          marginTop: 40,
          direction: "rtl",
          textAlign: "center",
        }}
      >
        انضم الآن وكن من <span style={{ color: COLORS.primary }}>الأبطال</span>
      </div>

      <div
        style={{
          marginTop: 50,
          padding: "24px 70px",
          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryGlow})`,
          borderRadius: 12,
          fontFamily: body.fontFamily,
          fontWeight: 900,
          fontSize: 46,
          color: COLORS.bg,
          letterSpacing: 2,
          transform: `scale(${urlIn})`,
          boxShadow: `0 20px 60px ${COLORS.primary}aa`,
        }}
      >
        LAST-ZONE.LOVABLE.APP
      </div>
    </AbsoluteFill>
  );
};
