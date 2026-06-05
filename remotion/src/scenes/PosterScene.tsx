import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../theme";

type Props = {
  src: string;
  // 0 = zoom-in, 1 = zoom-out, 2 = pan-up, 3 = pan-down
  motion?: 0 | 1 | 2 | 3;
  caption?: string;
};

export const PosterScene: React.FC<Props> = ({ src, motion = 0, caption }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const t = frame / durationInFrames; // 0..1

  let scale = 1;
  let tx = 0;
  let ty = 0;
  if (motion === 0) scale = interpolate(t, [0, 1], [1.0, 1.15]);
  if (motion === 1) scale = interpolate(t, [0, 1], [1.18, 1.0]);
  if (motion === 2) { scale = 1.12; ty = interpolate(t, [0, 1], [40, -40]); }
  if (motion === 3) { scale = 1.12; ty = interpolate(t, [0, 1], [-40, 40]); }

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  // gold flash sweep at the start
  const sweep = interpolate(frame, [0, 22], [-120, 220], { extrapolateRight: "clamp" });

  // caption animation
  const capIn = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 120 } });
  const capY = interpolate(capIn, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          opacity,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* gold sheen sweep */}
      <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: 0.35 }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${sweep}%`,
            width: "30%",
            height: "100%",
            background: `linear-gradient(100deg, transparent 0%, ${COLORS.primaryGlow}aa 50%, transparent 100%)`,
            filter: "blur(20px)",
            transform: "skewX(-12deg)",
          }}
        />
      </AbsoluteFill>

      {/* vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {caption && (
        <div
          style={{
            position: "absolute",
            bottom: 110,
            left: 0,
            right: 0,
            textAlign: "center",
            transform: `translateY(${capY}px)`,
            opacity: capIn,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "18px 38px",
              background: "rgba(0,0,0,0.55)",
              border: `2px solid ${COLORS.primary}`,
              borderRadius: 16,
              color: COLORS.cream,
              fontSize: 54,
              fontWeight: 800,
              letterSpacing: 1,
              fontFamily: "system-ui, -apple-system, sans-serif",
              direction: "rtl",
              boxShadow: `0 0 40px ${COLORS.primary}55`,
            }}
          >
            {caption}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
