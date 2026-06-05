import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../theme";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame / 22) * 0.5 + 0.5;
  const drift = interpolate(frame, [0, 450], [0, 60]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, ${COLORS.surface} 0%, ${COLORS.bg} 75%)`,
        }}
      />
      {/* tactical crosshair grid */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.08 }}>
        <defs>
          <pattern
            id="grid"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${drift} ${-drift})`}
          >
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke={COLORS.primary} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* gold glow */}
      <div
        style={{
          position: "absolute",
          width: 1500,
          height: 1500,
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${0.7 + pulse * 0.2})`,
          background: `radial-gradient(circle, ${COLORS.primary}22 0%, transparent 60%)`,
          filter: "blur(40px)",
        }}
      />
      {/* film grain via repeating gradient */}
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
