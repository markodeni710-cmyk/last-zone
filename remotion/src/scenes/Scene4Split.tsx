import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadBody } from "@remotion/google-fonts/Cairo";
import { COLORS } from "../theme";
import { PhoneFrame } from "../components/PhoneFrame";

const body = loadBody("normal", { weights: ["700", "900"] });

const features = [
  { icon: "🏆", label: "بطولات وكؤوس" },
  { icon: "💰", label: "سحب شدات UC" },
  { icon: "🎯", label: "بحث عن سكواد" },
  { icon: "🎙️", label: "سيرفرات صوتية" },
];

// Split layout: phone mockup on side + features list
export const Scene4Split: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const imgIn = spring({ frame, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: 100 }}>
      {/* phone mockup */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateX(${(1 - imgIn) * -100}px) rotate(${interpolate(frame, [0, 100], [-4, 0])}deg)`,
          opacity: imgIn,
        }}
      >
        <PhoneFrame src="images/mobile-cta.png" width={440} />
      </div>


      {/* features list */}
      <div style={{ flex: 1, paddingRight: 60, direction: "rtl" }}>
        <div
          style={{
            fontFamily: body.fontFamily,
            fontWeight: 900,
            fontSize: 64,
            color: COLORS.text,
            marginBottom: 50,
            opacity: interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateY(${(1 - interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" })) * 30}px)`,
          }}
        >
          كل المميزات <span style={{ color: COLORS.primary }}>في تطبيق واحد</span>
        </div>
        {features.map((f, i) => {
          const d = 12 + i * 8;
          const v = spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 130 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 30,
                padding: "22px 30px",
                marginBottom: 20,
                background: `linear-gradient(90deg, ${COLORS.surface}, transparent)`,
                borderRight: `4px solid ${COLORS.primary}`,
                borderRadius: 10,
                transform: `translateX(${(1 - v) * 80}px)`,
                opacity: v,
              }}
            >
              <div style={{ fontSize: 56 }}>{f.icon}</div>
              <div
                style={{
                  fontFamily: body.fontFamily,
                  fontWeight: 900,
                  fontSize: 42,
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
