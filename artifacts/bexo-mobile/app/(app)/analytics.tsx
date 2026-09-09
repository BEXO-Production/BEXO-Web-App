import { useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Rise } from "@/components/ui/Motion";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Stop,
} from "react-native-svg";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { CircleIconButton, SectionLabel } from "@/components/ui/Controls";
import { useAnalytics } from "@/lib/analytics-api";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

const RANGES = [
  { key: 7, label: "7D" },
  { key: 30, label: "30D" },
  { key: 90, label: "90D" },
] as const;

const CHART_H = 150;
const CHART_PAD_Y = 16;
const CHART_PAD_X = 12;

interface FormattedSource {
  key: string;
  name: string;
  icon: keyof typeof Feather.glyphMap;
  isBexo: boolean;
  count: number;
  pct: number;
  color: string;
}

export default function Analytics() {
  const { c, dark } = useTheme();
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const { data, isLoading, error } = useAnalytics(days);

  const series = data?.series ?? [];
  const totals = data?.totals ?? null;

  // Touch scrubbing state
  const [chartWidth, setChartWidth] = useState(300);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  activeIndexRef.current = activeIndex;

  // Selected bar in weekly breakdown
  const weekly = series.slice(-7);
  const weekMax = Math.max(1, ...weekly.map((p) => p.displayViews));
  const [selectedWeeklyIndex, setSelectedWeeklyIndex] = useState<number | null>(null);

  // Smooth curved path computations
  const chartData = useMemo(() => {
    return buildSplineChart(
      series.map((p) => p.displayViews),
      chartWidth,
      CHART_H,
      CHART_PAD_X,
      CHART_PAD_Y,
    );
  }, [series, chartWidth]);

  // Handle pan gestures for interactive scrubbing with haptic feedback
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX;
          const idx = findNearestIndex(x, chartData.points);
          if (idx !== null && idx !== activeIndexRef.current) {
            setActiveIndex(idx);
            Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderMove: (evt) => {
          const x = evt.nativeEvent.locationX;
          const idx = findNearestIndex(x, chartData.points);
          if (idx !== null && idx !== activeIndexRef.current) {
            setActiveIndex(idx);
            Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderRelease: () => {
          setActiveIndex(null);
        },
        onPanResponderTerminate: () => {
          setActiveIndex(null);
        },
      }),
    [chartData.points],
  );

  const onChartLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - chartWidth) > 1) {
      setChartWidth(w);
    }
  };

  // Structured traffic sources with smart icons & BEXO engine detection
  const sources: FormattedSource[] = useMemo(() => {
    const refs = totals?.topReferrers ?? [];
    const total = refs.reduce((sum, r) => sum + r.count, 0) || 1;

    return refs.map((ref, i) => {
      const parsed = classifySource(ref.host);
      return {
        key: `${ref.host}-${i}`,
        name: parsed.label,
        icon: parsed.icon,
        isBexo: parsed.isBexo,
        count: ref.count,
        pct: Math.round((ref.count / total) * 100),
        color: parsed.isBexo ? "#2F6BFF" : getSourcePaletteColor(i),
      };
    });
  }, [totals]);

  // Device breakdown
  const deviceStats = useMemo(() => {
    const devices = totals?.devices ?? {};
    const mobileCount = devices.mobile || 0;
    const desktopCount = devices.desktop || 0;
    const otherCount = devices.unknown || 0;
    const sum = mobileCount + desktopCount + otherCount;
    if (sum === 0) return null;
    return {
      mobilePct: Math.round((mobileCount / sum) * 100),
      desktopPct: Math.round((desktopCount / sum) * 100),
      mobileCount,
      desktopCount,
    };
  }, [totals]);

  const activePoint =
    activeIndex !== null && series[activeIndex] ? series[activeIndex] : null;
  const activePointCoord =
    activeIndex !== null && chartData.points[activeIndex]
      ? chartData.points[activeIndex]
      : null;

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace + 30,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <CircleIconButton
            icon="arrow-left"
            accessibilityLabel="Back"
            onPress={() => router.back()}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: fonts.serif600,
                fontSize: 25,
                letterSpacing: -0.4,
                color: c.ink,
              }}
            >
              Analytics
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans400,
                fontSize: 12.5,
                color: c.muted,
                marginTop: 1,
              }}
            >
              Real-time portfolio & NFC telemetry
            </Text>
          </View>
        </View>

        {/* Time range selector pills */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {RANGES.map((option) => {
            const active = option.key === days;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setDays(option.key);
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  backgroundColor: active ? c.cta : c.panel,
                  borderWidth: 1,
                  borderColor: active ? "transparent" : c.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 12.5,
                    color: active ? c.onCta : c.muted,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 80, alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={c.accentSoft} size="large" />
            <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted }}>
              Loading analytics…
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              alignItems: "center",
              gap: 10,
              paddingVertical: 48,
              paddingHorizontal: 20,
            }}
          >
            <Feather name="bar-chart-2" size={26} color={c.faint} />
            <Text
              style={{
                fontFamily: fonts.sans600,
                fontSize: 15,
                color: c.ink,
                textAlign: "center",
              }}
            >
              Couldn't load analytics
            </Text>
          </View>
        ) : !data?.unlocked ? (
          <View
            style={{
              alignItems: "center",
              gap: 12,
              paddingVertical: 50,
              paddingHorizontal: 24,
              backgroundColor: c.panel,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: c.accentWash,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="lock" size={22} color={c.accent} />
            </View>
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 16,
                color: c.ink,
                textAlign: "center",
              }}
            >
              Analytics need an Essential or Growth plan
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans400,
                fontSize: 13,
                color: c.muted,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              {data?.message ??
                "Upgrade to track NFC taps, card QR scans, and visitor conversions."}
            </Text>
          </View>
        ) : (
          <>
            {/* Top Metric Cards */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <SummaryCard
                label="TOTAL VIEWS"
                value={fmt(totals?.displayViews)}
                sub="All page visits"
                icon="eye"
              />
              <SummaryCard
                label="UNIQUE VISITORS"
                value={fmt(totals?.uniquesApprox)}
                sub="Distinct people"
                icon="users"
              />
            </View>

            {/* Interactive Smooth Curved Area Chart */}
            <Rise
              duration={420}
              style={{
                borderRadius: 24,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
                padding: 20,
                gap: 14,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View>
                  <Text
                    style={{
                      fontFamily: fonts.sans700,
                      fontSize: 13,
                      letterSpacing: 0.2,
                      color: c.ink,
                    }}
                  >
                    Traffic Velocity
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.sans400,
                      fontSize: 11.5,
                      color: c.muted,
                      marginTop: 2,
                    }}
                  >
                    Touch & drag across the graph to inspect
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: c.accentWash,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sans700,
                      fontSize: 11,
                      color: c.accent,
                    }}
                  >
                    {fmt(totals?.displayViews)} total
                  </Text>
                </View>
              </View>

              {series.length === 0 ? (
                <Text
                  style={{
                    fontFamily: fonts.sans400,
                    fontSize: 13,
                    color: c.muted,
                    paddingVertical: 32,
                    textAlign: "center",
                  }}
                >
                  No visits recorded yet in this time window.
                </Text>
              ) : (
                <View onLayout={onChartLayout} style={{ marginTop: 6 }}>
                  {/* Floating scrubber pill tooltip */}
                  {activePoint && activePointCoord ? (
                    <View
                      style={{
                        position: "absolute",
                        left: Math.max(
                          0,
                          Math.min(chartWidth - 110, activePointCoord.x - 55),
                        ),
                        top: -6,
                        zIndex: 20,
                        backgroundColor: c.ink,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        shadowColor: "#000",
                        shadowOpacity: 0.18,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 6,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.sans700,
                          fontSize: 11,
                          color: c.panel,
                        }}
                      >
                        {shortDate(activePoint.day)}
                      </Text>
                      <Text
                        style={{
                          fontFamily: fonts.mono500,
                          fontSize: 13,
                          color: "#5B8CFF",
                          marginTop: 1,
                        }}
                      >
                        {fmt(activePoint.displayViews)} views
                      </Text>
                    </View>
                  ) : null}

                  {/* SVG Chart */}
                  <View {...panResponder.panHandlers}>
                    <Svg
                      width={chartWidth}
                      height={CHART_H}
                      viewBox={`0 0 ${chartWidth} ${CHART_H}`}
                    >
                      <Defs>
                        <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <Stop
                            offset="0%"
                            stopColor={c.accent}
                            stopOpacity={dark ? 0.45 : 0.3}
                          />
                          <Stop
                            offset="100%"
                            stopColor={c.accent}
                            stopOpacity={0.0}
                          />
                        </LinearGradient>
                      </Defs>

                      {/* Subtle horizontal grid lines */}
                      <Line
                        x1={CHART_PAD_X}
                        y1={CHART_PAD_Y}
                        x2={chartWidth - CHART_PAD_X}
                        y2={CHART_PAD_Y}
                        stroke={c.border}
                        strokeDasharray="4, 4"
                        strokeWidth={1}
                      />
                      <Line
                        x1={CHART_PAD_X}
                        y1={CHART_H / 2}
                        x2={chartWidth - CHART_PAD_X}
                        y2={CHART_H / 2}
                        stroke={c.border}
                        strokeDasharray="4, 4"
                        strokeWidth={1}
                      />
                      <Line
                        x1={CHART_PAD_X}
                        y1={CHART_H - CHART_PAD_Y}
                        x2={chartWidth - CHART_PAD_X}
                        y2={CHART_H - CHART_PAD_Y}
                        stroke={c.border}
                        strokeWidth={1}
                      />

                      {/* Smooth area & stroke */}
                      {chartData.area ? (
                        <Path d={chartData.area} fill="url(#chartGradient)" />
                      ) : null}
                      {chartData.line ? (
                        <Path
                          d={chartData.line}
                          fill="none"
                          stroke={c.accent}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}

                      {/* Active scrubber vertical guide line & dot */}
                      {activePointCoord ? (
                        <>
                          <Line
                            x1={activePointCoord.x}
                            y1={CHART_PAD_Y}
                            x2={activePointCoord.x}
                            y2={CHART_H - CHART_PAD_Y}
                            stroke={c.accent}
                            strokeWidth={1.5}
                            strokeDasharray="3, 3"
                          />
                          <Circle
                            cx={activePointCoord.x}
                            cy={activePointCoord.y}
                            r={6}
                            fill={c.accent}
                            stroke={c.panel}
                            strokeWidth={2.5}
                          />
                        </>
                      ) : (
                        /* Resting point indicators */
                        chartData.points.map((pt, i) => {
                          if (series.length > 15 && i % 3 !== 0 && i !== series.length - 1) {
                            return null;
                          }
                          return (
                            <Circle
                              key={i}
                              cx={pt.x}
                              cy={pt.y}
                              r={3}
                              fill={c.accent}
                              stroke={c.panel}
                              strokeWidth={1.5}
                            />
                          );
                        })
                      )}
                    </Svg>
                  </View>

                  {/* Date labels below graph */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 8,
                      paddingHorizontal: 4,
                    }}
                  >
                    {getDateTicks(series).map((point, i) => (
                      <Text
                        key={i}
                        style={{
                          fontFamily: fonts.sans400,
                          fontSize: 10,
                          color: c.faint,
                        }}
                      >
                        {shortDate(point.day)}
                      </Text>
                    ))}
                  </View>
                </View>
              )}
            </Rise>

            {/* Weekly Tactile Breakdown (Last 7 Days) */}
            {weekly.length > 0 ? (
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 20,
                  gap: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sans700,
                      fontSize: 13,
                      letterSpacing: 0.2,
                      color: c.ink,
                    }}
                  >
                    Daily Volume (Past 7 Days)
                  </Text>
                  {selectedWeeklyIndex !== null && weekly[selectedWeeklyIndex] ? (
                    <Text
                      style={{
                        fontFamily: fonts.mono500,
                        fontSize: 12,
                        color: c.accent,
                      }}
                    >
                      {weekly[selectedWeeklyIndex].displayViews} views
                    </Text>
                  ) : null}
                </View>

                <View
                  style={{
                    height: 130,
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 8,
                    paddingTop: 10,
                  }}
                >
                  {weekly.map((point, i) => {
                    const isSelected = selectedWeeklyIndex === i;
                    const isLatest = i === weekly.length - 1;
                    const heightPct = Math.max(
                      8,
                      (point.displayViews / weekMax) * 100,
                    );

                    return (
                      <Pressable
                        key={point.day}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSelectedWeeklyIndex(isSelected ? null : i);
                        }}
                        style={{ flex: 1, alignItems: "center", gap: 8 }}
                      >
                        <View
                          style={{
                            width: "100%",
                            height: `${heightPct}%`,
                            borderRadius: 8,
                            backgroundColor: isSelected
                              ? c.cta
                              : isLatest
                                ? c.accent
                                : c.accentWash,
                            borderWidth: 1,
                            borderColor: isSelected
                              ? c.cta
                              : isLatest
                                ? c.accent
                                : c.accentEdge,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: fonts.sans600,
                            fontSize: 10,
                            color: isSelected ? c.ink : c.faint,
                          }}
                        >
                          {dayName(point.day)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Device breakdown bar */}
            {deviceStats ? (
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 20,
                  gap: 14,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 13,
                    letterSpacing: 0.2,
                    color: c.ink,
                  }}
                >
                  Platform Distribution
                </Text>
                <View
                  style={{
                    height: 10,
                    borderRadius: 6,
                    backgroundColor: c.deep,
                    flexDirection: "row",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${deviceStats.mobilePct}%`,
                      backgroundColor: "#2F6BFF",
                    }}
                  />
                  <View
                    style={{
                      width: `${deviceStats.desktopPct}%`,
                      backgroundColor: "#9bb6ff",
                    }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingTop: 2,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="smartphone" size={13} color="#2F6BFF" />
                    <Text
                      style={{
                        fontFamily: fonts.sans400,
                        fontSize: 12,
                        color: c.muted,
                      }}
                    >
                      Mobile ({deviceStats.mobilePct}%)
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="monitor" size={13} color="#9bb6ff" />
                    <Text
                      style={{
                        fontFamily: fonts.sans400,
                        fontSize: 12,
                        color: c.muted,
                      }}
                    >
                      Desktop ({deviceStats.desktopPct}%)
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Smart Traffic Sources */}
            <View style={{ gap: 12 }}>
              <SectionLabel>Traffic Sources & Channels</SectionLabel>
              {sources.length === 0 ? (
                <View
                  style={{
                    borderRadius: 22,
                    backgroundColor: c.panel,
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: 24,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sans400,
                      fontSize: 13,
                      color: c.muted,
                    }}
                  >
                    No channel visits recorded yet.
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    borderRadius: 24,
                    backgroundColor: c.panel,
                    borderWidth: 1,
                    borderColor: c.border,
                    overflow: "hidden",
                  }}
                >
                  {sources.map((source, idx) => (
                    <View
                      key={source.key}
                      style={{
                        gap: 10,
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        borderBottomWidth: idx === sources.length - 1 ? 0 : 1,
                        borderBottomColor: c.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            backgroundColor: source.isBexo
                              ? c.accentWash
                              : c.deep,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Feather
                            name={source.icon}
                            size={16}
                            color={source.isBexo ? c.accent : c.muted}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: fonts.sans600,
                                fontSize: 13.5,
                                color: c.ink,
                              }}
                            >
                              {source.name}
                            </Text>
                            {source.isBexo ? (
                              <View
                                style={{
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  backgroundColor: c.accentWash,
                                }}
                              >
                                <Text
                                  style={{
                                    fontFamily: fonts.sans700,
                                    fontSize: 9,
                                    color: c.accent,
                                  }}
                                >
                                  BEXO CORE
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>

                        <Text
                          style={{
                            fontFamily: fonts.mono500,
                            fontSize: 13,
                            color: c.ink,
                          }}
                        >
                          {source.count}
                        </Text>
                        <Text
                          style={{
                            width: 36,
                            textAlign: "right",
                            fontFamily: fonts.sans600,
                            fontSize: 12,
                            color: c.muted,
                          }}
                        >
                          {source.pct}%
                        </Text>
                      </View>

                      {/* Proportion bar */}
                      <View
                        style={{
                          height: 5,
                          borderRadius: 5,
                          backgroundColor: c.deep,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            width: `${source.pct}%`,
                            height: "100%",
                            borderRadius: 5,
                            backgroundColor: source.color,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 22,
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.sans700,
            fontSize: 9.5,
            letterSpacing: 1.2,
            color: c.faint,
          }}
        >
          {label}
        </Text>
        <Feather name={icon} size={14} color={c.faint} />
      </View>
      <Text style={{ fontFamily: fonts.serif600, fontSize: 26, color: c.ink }}>
        {value}
      </Text>
      <Text style={{ fontFamily: fonts.sans400, fontSize: 11, color: c.muted }}>
        {sub}
      </Text>
    </View>
  );
}

function fmt(value?: number): string {
  return value === undefined || value === null ? "—" : value.toLocaleString();
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function dayName(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function getDateTicks<T extends { day: string }>(series: T[]): T[] {
  if (series.length <= 5) return series;
  const step = Math.floor(series.length / 4);
  const res: T[] = [];
  for (let i = 0; i < series.length; i += step) {
    res.push(series[i]);
  }
  if (res[res.length - 1] !== series[series.length - 1]) {
    res.push(series[series.length - 1]);
  }
  return res;
}

/** Classify referrers into human-friendly channels */
function classifySource(host: string): {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  isBexo: boolean;
} {
  const h = (host || "").toLowerCase().trim();
  if (h === "bexo:nfc" || h === "nfc") {
    return { label: "BEXO NFC Card Tap", icon: "wifi", isBexo: true };
  }
  if (h === "bexo:qr" || h === "qr" || h === "bexo:card" || h.includes("qr-codes.io")) {
    return { label: "BEXO Card QR Scan", icon: "maximize", isBexo: true };
  }
  if (!h || h === "direct") {
    return { label: "Direct URL Visit", icon: "globe", isBexo: false };
  }
  if (h.includes("linkedin")) {
    return { label: "LinkedIn", icon: "linkedin", isBexo: false };
  }
  if (h.includes("twitter") || h.includes("x.com")) {
    return { label: "X (Twitter)", icon: "twitter", isBexo: false };
  }
  if (h.includes("instagram")) {
    return { label: "Instagram", icon: "instagram", isBexo: false };
  }
  if (h.includes("google")) {
    return { label: "Google Search", icon: "search", isBexo: false };
  }
  if (h.includes("whatsapp")) {
    return { label: "WhatsApp", icon: "message-circle", isBexo: false };
  }
  return { label: h, icon: "external-link", isBexo: false };
}

function getSourcePaletteColor(index: number): string {
  const colors = ["#2F6BFF", "#5B8CFF", "#85ABFF", "#ACC8FF", "#D4E2FF"];
  return colors[index % colors.length];
}

/** Find index of nearest point given touch coordinate X */
function findNearestIndex(
  x: number,
  points: { x: number; y: number }[],
): number | null {
  if (points.length === 0) return null;
  let closestDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const dist = Math.abs(points[i].x - x);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  return closestIdx;
}

/**
 * Builds smooth cubic Bezier curve coordinates and area path
 */
function buildSplineChart(
  series: number[],
  width: number,
  height: number,
  padX: number,
  padY: number,
) {
  if (series.length === 0) {
    return { line: "", area: "", points: [] as { x: number; y: number }[] };
  }

  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const usableW = Math.max(10, width - padX * 2);
  const usableH = Math.max(10, height - padY * 2);

  const points = series.map((value, i) => ({
    x: padX + (series.length === 1 ? usableW / 2 : (i / (series.length - 1)) * usableW),
    y: padY + (1 - (value - min) / range) * usableH,
  }));

  if (points.length === 1) {
    const line = `M ${points[0].x} ${points[0].y}`;
    return { line, area: "", points };
  }

  // Generate cubic Bezier SVG spline
  let line = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const tension = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    line += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`;

  return { line, area, points };
}
