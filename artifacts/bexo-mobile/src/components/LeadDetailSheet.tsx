import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Sheet } from "@/components/ui/Sheet";
import { useLeadThread, useReplyToLead, type Lead } from "@/lib/analytics-api";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

/**
 * One enquiry as a chat thread: their message, then any real replies already
 * sent from the account, then a composer. `canReply` comes straight from the
 * plan gate on the server — free plans see the message with no composer,
 * rather than a button that would just fail.
 */
export function LeadDetailSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { c } = useTheme();
  const { data: thread, isLoading } = useLeadThread(lead?.id ?? null);
  const reply = useReplyToLead(lead?.id ?? null);
  const [draft, setDraft] = useState("");

  if (!lead) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const send = () => {
    if (!draft.trim()) return;
    reply.mutate(draft.trim(), { onSuccess: () => setDraft("") });
  };

  return (
    <Sheet visible onClose={onClose} maxHeightRatio={0.76}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.accentWash,
          }}
        >
          <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: c.accentSoft }}>
            {initialsOf(lead.senderName)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.sans700, fontSize: 16, color: c.ink }}>
            {lead.senderName ?? "Someone"}
          </Text>
          {lead.senderEmail ? (
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
              {lead.senderEmail}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Feather name="x" size={20} color={c.muted} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={c.accentSoft} />
        </View>
      ) : (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
          <View
            style={{
              alignSelf: "flex-start",
              maxWidth: "86%",
              borderRadius: 18,
              borderBottomLeftRadius: 6,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
              padding: 14,
            }}
          >
            <Text style={{ fontFamily: fonts.sans400, fontSize: 13, lineHeight: 20, color: c.ink }}>
              {lead.message ?? "No message"}
            </Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint, marginTop: 6 }}>
              {new Date(lead.createdAt).toLocaleDateString()}
            </Text>
          </View>

          {(thread?.replies ?? []).map((r) => (
            <View
              key={r.id}
              style={{
                alignSelf: "flex-end",
                maxWidth: "86%",
                borderRadius: 18,
                borderBottomRightRadius: 6,
                backgroundColor: c.accentWash,
                borderWidth: 1,
                borderColor: c.accentEdge,
                padding: 14,
              }}
            >
              <Text style={{ fontFamily: fonts.sans400, fontSize: 13, lineHeight: 20, color: c.ink }}>
                {r.body}
              </Text>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint, marginTop: 6 }}>
                You · {new Date(r.createdAt).toLocaleDateString()}
                {r.status === "failed" ? " · not delivered" : ""}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {thread?.canReply ? (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a reply…"
            placeholderTextColor={c.faint}
            multiline
            style={{
              flex: 1,
              minHeight: 46,
              maxHeight: 100,
              borderRadius: 14,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontFamily: fonts.sans400,
              fontSize: 13.5,
              color: c.ink,
            }}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || reply.isPending}
            style={{
              minHeight: 46,
              paddingHorizontal: 20,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: draft.trim() ? c.cta : c.deep,
            }}
          >
            <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: draft.trim() ? c.onCta : c.faint }}>
              {reply.isPending ? "Sending…" : "Send"}
            </Text>
          </Pressable>
        </View>
      ) : thread ? (
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            padding: 14,
            borderRadius: 14,
            backgroundColor: c.panel,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Feather name="lock" size={15} color={c.faint} />
          <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted }}>
            In-app replies need a paid plan. Reply from {lead.senderEmail ?? "their email"} directly for now.
          </Text>
        </View>
      ) : null}

      {reply.isError ? (
        <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.danger }}>
          {reply.error instanceof Error ? reply.error.message : "Could not send that reply."}
        </Text>
      ) : null}
    </Sheet>
  );
}

function initialsOf(name?: string | null): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}
