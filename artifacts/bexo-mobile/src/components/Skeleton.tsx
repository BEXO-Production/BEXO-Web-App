import { View } from "react-native";
import { SweepShimmer } from "@/components/ui/Loaders";

/**
 * The Home loading state: three blocks shaped like the card, the insights
 * strip and the feed. The sheen is staggered down the stack so the eye reads
 * the page filling top-to-bottom rather than three things flashing at once.
 */
export function HomeSkeleton() {
  return (
    <View style={{ gap: 20 }}>
      <SweepShimmer height={221} radius={20} delay={0} />
      <SweepShimmer height={86} radius={22} delay={150} />
      <SweepShimmer height={150} radius={22} delay={300} />
    </View>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SweepShimmer key={i} height={66} radius={16} delay={i * 120} />
      ))}
    </View>
  );
}

/** A single block, for one-off placeholders. */
export function Skeleton({
  height = 66,
  radius = 16,
  delay = 0,
}: {
  height?: number;
  radius?: number;
  delay?: number;
}) {
  return <SweepShimmer height={height} radius={radius} delay={delay} />;
}
