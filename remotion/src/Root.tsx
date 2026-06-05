import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 5 posters × 90f + 4 transitions × 12f (overlap) = 450 - 48 = 402f → use 402
// Easier: 5 sequences of 96f, 4 transitions of 12f overlap → 5*96 - 4*12 = 432f ≈ 14.4s
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={432}
    fps={30}
    width={1080}
    height={1920}
  />
);
