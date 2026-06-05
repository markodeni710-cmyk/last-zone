import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";
import { PhoneFrame } from "../components/PhoneFrame";

const body = loadBody("normal", { weights: ["700", "900"] });

// Hero screenshot inside a phone mockup with brand label
export const Scene2Showcase: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mockIn = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const labelIn = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: "clamp" });
  const tiltY = Math.sin(frame / 30) * 2;
  const float = Math.sin(frame / 22) * 8;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          transform: `perspective(2200px) rotateY(${tiltY}deg) translateY(${float}px) scale(${mockIn})`,
          opacity: mockIn,
        }}
      >
        <PhoneFrame src="images/mobile-hero.png" width={500} />
      </div>

      {/* corner label */}
      <div
        style={{
          position: "absolute",
          top: 110,
          right: 120,
          padding: "16px 32px",
          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryGlow})`,
          borderRadius: 8,
          fontFamily: body.fontFamily,
          fontWeight: 900,
          fontSize: 30,
          color: COLORS.bg,
          letterSpacing: 2,
          opacity: labelIn,
          transform: `translateX(${(1 - labelIn) * 60}px)`,
          boxShadow: `0 12px 36px ${COLORS.primary}aa`,
          direction: "rtl",
        }}
      >
        تجربة موبايل احترافية
      </div>

      {/* bottom caption */}
      <div
        style={{
          position: "absolute",
          bottom: 90,
          fontFamily: body.fontFamily,
          fontWeight: 700,
          fontSize: 28,
          color: COLORS.muted,
          direction: "rtl",
          opacity: labelIn,
          letterSpacing: 4,
        }}
      >
        مصمم للاعب العربي على الموبايل
      </div>
    </AbsoluteFill>
  );
};
