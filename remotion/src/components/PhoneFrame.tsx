import { Img, staticFile } from "remotion";
import { COLORS } from "../theme";

type Props = {
  src: string;
  width?: number;
  innerStyle?: React.CSSProperties;
  imgStyle?: React.CSSProperties;
};

// Realistic phone mockup with gold bezel + notch — matches LAST ZONE brand
export const PhoneFrame: React.FC<Props> = ({ src, width = 460, innerStyle, imgStyle }) => {
  const height = Math.round(width * 2.05);
  const radius = Math.round(width * 0.11);
  const innerRadius = radius - 6;
  return (
    <div
      style={{
        width,
        height,
        padding: 10,
        borderRadius: radius,
        background: `linear-gradient(160deg, ${COLORS.primary}, #6b4a1a 45%, #0a0a0a 60%, #1a1a1a)`,
        boxShadow: `0 40px 100px ${COLORS.primary}55, 0 0 0 2px ${COLORS.primary}88, inset 0 0 0 1px #00000088`,
        position: "relative",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: innerRadius,
          overflow: "hidden",
          background: COLORS.bg,
          position: "relative",
          ...innerStyle,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
            ...imgStyle,
          }}
        />
        {/* Notch */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: width * 0.32,
            height: 26,
            background: "#000",
            borderRadius: 16,
            zIndex: 5,
          }}
        />
      </div>
    </div>
  );
};
