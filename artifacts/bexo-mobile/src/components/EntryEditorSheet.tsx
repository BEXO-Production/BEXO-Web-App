import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Sheet } from "@/components/ui/Sheet";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

export interface DraftEntry {
  sectionIndex: number;
  /** -1 when adding something the resume didn't have. */
  entryIndex: number;
  title: string;
  detail: string;
  date: string;
}

/** The generic entry editor used from the wizard's review step and Edit profile. */
export function EntryEditorSheet({
  draft,
  sectionName,
  onClose,
  onSave,
  onDelete,
}: {
  draft: DraftEntry | null;
  sectionName: string;
  onClose: () => void;
  onSave: (entry: DraftEntry) => void;
  onDelete: (entry: DraftEntry) => void;
}) {
  const { c } = useTheme();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    setTitle(draft?.title ?? "");
    setDetail(draft?.detail ?? "");
    setDate(draft?.date ?? "");
  }, [draft]);

  if (!draft) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const inputStyle = {
    borderRadius: 14,
    backgroundColor: c.panel,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingHorizontal: 14,
    fontFamily: fonts.sans400,
    color: c.ink,
  } as const;

  return (
    <Sheet visible onClose={onClose} maxHeightRatio={0.82}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.sans700, fontSize: 16, color: c.ink }}>
            {draft.entryIndex === -1 ? "Add item" : "Edit entry"}
          </Text>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>{sectionName}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Feather name="x" size={20} color={c.muted} />
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Senior Product Designer"
          placeholderTextColor={c.faint}
          style={[inputStyle, { minHeight: 50, fontSize: 15 }]}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Detail</Text>
        <TextInput
          value={detail}
          onChangeText={setDetail}
          placeholder="Short description"
          placeholderTextColor={c.faint}
          multiline
          style={[inputStyle, { minHeight: 70, paddingVertical: 12, fontSize: 14, lineHeight: 20 }]}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Date range (optional)</Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="e.g. 2022 – present"
          placeholderTextColor={c.faint}
          style={[inputStyle, { minHeight: 50, fontSize: 15 }]}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 10, paddingTop: 4 }}>
        {draft.entryIndex !== -1 ? (
          <Pressable
            accessibilityLabel="Delete entry"
            onPress={() => onDelete(draft)}
            style={{
              minHeight: 50,
              paddingHorizontal: 18,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(217,56,67,0.08)",
              borderWidth: 1,
              borderColor: "rgba(217,56,67,0.3)",
            }}
          >
            <Feather name="trash-2" size={17} color={c.danger} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onSave({ ...draft, title, detail, date })}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cta,
          }}
        >
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.onCta }}>Save</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
