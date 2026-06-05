import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";
import { PhoneFrame } from "../components/PhoneFrame";

const body = loadBody("normal", { weights: ["700", "900"] });

// Mobile features screenshot in phone + animated stat counters beside it
export const Scene3Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneIn = spring({ frame, fps, config: { damping: 18 } });
  const titleIn = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });

  const stats = [
    { value: Math.floor(interpolate(frame, [15, 70], [0, 85], { extrapolateRight: "clamp" })), suffix: "+", label: "بطولة" },
    { value: Math.floor(interpolate(frame, [20, 75], [0, 340], { extrapolateRight: "clamp" })), suffix: "+", label: "كلان" },
    { value: Math.floor(interpolate(frame, [25, 80], [0, 12], { extrapolateRight: "clamp" })), suffix: "K+", label: "لاعب" },
  ];

  return (
    <AbsoluteFill>
      {/* dimmed bg from mobile screenshot */}
      <AbsoluteFill style={{ opacity: 0.18 }}>
        <Img
          src={staticFile("images/mobile-features.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${interpolate(frame, [0, 100], [1.05, 1.15])})`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${COLORS.bg}dd, ${COLORS.bg}ee)` }} />

      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 140px" }}>
        {/* phone on left */}
        <div
          style={{
            flex: "0 0 auto",
            transform: `translateX(${(1 - phoneIn) * -120}px) rotate(${interpolate(frame, [0, 100], [-4, 0])}deg)`,
            opacity: phoneIn,
          }}
        >
          <PhoneFrame src="images/mobile-features.png" width={420} />
        </div>

        {/* title + stats */}
        <div style={{ flex: 1, paddingRight: 80, direction: "rtl" }}>
          <div
            style={{
              fontFamily: body.fontFamily,
              fontWeight: 900,
              fontSize: 76,
              color: COLORS.text,
              opacity: titleIn,
              transform: `translateY(${(1 - titleIn) * 40}px)`,
              marginBottom: 50,
              lineHeight: 1.1,
            }}
          >
            كل شيء يحتاجه <span style={{ color: COLORS.primary }}>المحترف</span>
          </div>
          <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
            {stats.map((s, i) => {
              const d = 15 + i * 8;
              const v = spring({ frame: frame - d, fps, config: { damping: 14 } });
              return (
                <div
                  key={i}
                  style={{
                    background: `linear-gradient(180deg, ${COLORS.surface}, ${COLORS.bgDeep})`,
                    border: `2px solid ${COLORS.primary}66`,
                    padding: "30px 40px",
                    borderRadius: 14,
                    textAlign: "center",
                    transform: `translateY(${(1 - v) * 60}px) scale(${v})`,
                    opacity: v,
                    boxShadow: `0 20px 50px ${COLORS.primary}33`,
                    minWidth: 200,
                  }}
                >
                  <div
                    style={{
                      fontFamily: body.fontFamily,
                      fontSize: 80,
                      fontWeight: 900,
                      color: COLORS.primary,
                      lineHeight: 1,
                      textShadow: `0 0 30px ${COLORS.primary}77`,
                    }}
                  >
                    +{s.value}
                    {s.suffix === "K+" ? "K" : ""}
                  </div>
                  <div
                    style={{
                      fontFamily: body.fontFamily,
                      fontSize: 26,
                      color: COLORS.muted,
                      fontWeight: 700,
                      marginTop: 10,
                      direction: "rtl",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
