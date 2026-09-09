import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Sheet } from "@/components/ui/Sheet";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";
import {
  connectionColor,
  personInitials,
  useRespondToConnection,
  type ConnectionEdge,
} from "@/lib/connections-api";

const SOURCE_LABEL: Record<string, string> = {
  qr: "Met by QR",
  nfc: "Met by tap",
  link: "Met by link",
  manual: "Added manually",
};

/**
 * Tapping a node opens that person in place — a mini "their site" preview with
 * how you met, when you connected, and how many people you both know. An
 * incoming request is answered right here rather than in a separate inbox.
 */
export function PersonSheet({
  edge,
  onClose,
}: {
  edge: ConnectionEdge | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const respond = useRespondToConnection();

  if (!edge) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const { person } = edge;
  const color = connectionColor(edge);
  const pendingOnThem = edge.status === "pending" && !edge.incoming;
  const pendingOnMe = edge.status === "pending" && edge.incoming;

  const answer = (action: "accept" | "decline") => {
    respond.mutate({ id: edge.id, action });
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} maxHeightRatio={0.72} padded={false} scrim="rgba(5,7,15,0.5)">
      <LinearGradient
        colors={[`${color}CC`, `${color}55`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 128, justifyContent: "flex-end", marginTop: -16 }}
      >
        <Pressable onPress={onClose} hitSlop={10} style={{ position: "absolute", top: 16, right: 16 }}>
          <Feather name="x" size={20} color="rgba(255,255,255,0.85)" />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 14, paddingHorizontal: 22, paddingBottom: 18 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.14)",
              borderWidth: 2.5,
              borderColor: color,
              overflow: "hidden",
            }}
          >
            {person.photoUrl ? (
              <Image
                source={{ uri: person.photoUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ fontFamily: fonts.sans700, fontSize: 19, color: "#fff" }}>
                {personInitials(person)}
              </Text>
            )}
          </View>
          <View style={{ gap: 2, paddingBottom: 2, flex: 1 }}>
            <Text style={{ fontFamily: fonts.serif600, fontSize: 21, color: "#fff" }}>
              {person.name ?? "A BEXO member"}
            </Text>
            {person.headline ? (
              <Text numberOfLines={1} style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>
                {person.headline}
              </Text>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: fonts.mono500, fontSize: 12.5, color: c.accentSoft }}>
            {person.handle ? `${person.handle}.atbexo.com` : "No public page yet"}
          </Text>
          <View
            style={{
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: `${color}1a`,
              borderWidth: 1,
              borderColor: `${color}44`,
            }}
          >
            <Text style={{ fontFamily: fonts.sans700, fontSize: 11, color }}>
              {SOURCE_LABEL[edge.source] ?? "Connected"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <StatBox
            label={edge.status === "accepted" ? "Connected" : "Requested"}
            value={formatSince(edge.connectedSince)}
          />
          <StatBox label="Mutual" value={`${edge.mutuals} ${edge.mutuals === 1 ? "person" : "people"}`} />
        </View>

        {pendingOnMe ? (
          <View
            style={{
              borderRadius: 16,
              backgroundColor: c.accentWash,
              borderWidth: 1,
              borderColor: c.accentEdge,
              padding: 14,
              gap: 12,
            }}
          >
            <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.ink }}>
              They scanned your card and asked to connect.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => answer("accept")}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.cta,
                }}
              >
                <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.onCta }}>Accept</Text>
              </Pressable>
              <Pressable
                onPress={() => answer("decline")}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.borderStrong,
                }}
              >
                <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.muted }}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {pendingOnThem ? (
          <View
            style={{
              borderRadius: 16,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
              padding: 14,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Feather name="clock" size={15} color={c.warn} />
            <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted }}>
              You asked to connect. They’ll show up here properly once they accept.
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => person.siteUrl && Linking.openURL(person.siteUrl).catch(() => {})}
            disabled={!person.siteUrl}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: person.siteUrl ? c.cta : c.deep,
            }}
          >
            <Feather name="external-link" size={15} color={person.siteUrl ? c.onCta : c.faint} />
            <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: person.siteUrl ? c.onCta : c.faint }}>
              Visit their site
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.border,
        padding: 12,
        gap: 2,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.sans700,
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: c.faint,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.ink }}>{value}</Text>
    </View>
  );
}

/** "Aug 2026" — the month is the useful part of when you met someone. */
function formatSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
