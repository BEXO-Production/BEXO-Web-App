import { View } from "react-native";
import { Shimmer } from "@/components/ui/Effects";
import { useTheme } from "@/lib/theme-context";

/**
 * The Home loading state from the canvas: three breathing blocks shaped like
 * the card, the insights strip and the feed, staggered 150ms apart.
 */
export function HomeSkeleton() {
  const { c } = useTheme();
  const block = (height: number, radius: number, delay: number) => (
    <Shimmer delay={delay} style={{ height, borderRadius: radius, backgroundColor: c.deep }} />
  );

  return (
    <View style={{ gap: 20 }}>
      {block(221, 20, 0)}
      {block(86, 22, 150)}
      {block(150, 22, 300)}
    </View>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer
          key={i}
          delay={i * 120}
          style={{ height: 66, borderRadius: 16, backgroundColor: c.deep }}
        />
      ))}
    </View>
  );
}

/** A single breathing block, for one-off placeholders. */
export function Skeleton({ height = 66, radius = 16, delay = 0 }: { height?: number; radius?: number; delay?: number }) {
  const { c } = useTheme();
  return <Shimmer delay={delay} style={{ height, borderRadius: radius, backgroundColor: c.deep }} />;
}
