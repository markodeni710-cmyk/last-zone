import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { PosterScene } from "./scenes/PosterScene";
import { COLORS } from "./theme";

const SCENE = 96;
const TR = 12;

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <PosterScene src="posters/p1.png" motion={0} caption="مجتمع لاعبي ببجي العربي" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TR })} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <PosterScene src="posters/p2.png" motion={2} caption="كل ما يحتاجه المحترف" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TR })} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <PosterScene src="posters/p4.png" motion={1} caption="بطولات وكؤوس بجوائز ضخمة" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: TR })} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <PosterScene src="posters/p5.png" motion={3} caption="آلاف اللاعبين في مكان واحد" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TR })} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <PosterScene src="posters/p3.png" motion={1} caption="ابدأ الآن — مجاناً تماماً" />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
