import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { RevealText, Rise } from "@/components/ui/Motion";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { SubScreenHeader } from "@/components/ui/SubScreenHeader";
import { CtaButton } from "@/components/ui/CtaButton";
import { Skeleton } from "@/components/Skeleton";
import { useProfile } from "@/lib/use-profile";
import { useUpdateProfile } from "@/lib/profile-api";
import { describeError } from "@/lib/errors";
import { SECTION_CONFIGS, newEntryId, type SectionType } from "@/lib/section-fields";
import { colors } from "@/lib/theme";
import { fonts } from "@/lib/fonts";

/** Section-agnostic list editor for Education/Experience/Projects/
 * Certificates — the field layout comes from section-fields.ts, the entries
 * themselves come straight off the real profile response. PATCH always
 * resends the whole array: the server diffs by `id` against what's already
 * saved to decide how many monthly update credits a save consumes (see
 * profile.ts's countNetNewEntries), so a partial write would misreport
 * which rows are "new". */
export default function SectionListEditor() {
  const { type } = useLocalSearchParams<{ type: SectionType }>();
  // `config` can be undefined — e.g. this route opened with no/invalid
  // `type` param — but every hook below must still run unconditionally on
  // every render (React's rules of hooks), so the "nothing to show" case is
  // handled only in the JSX return at the bottom, never as an early return
  // up here.
  const config = type ? SECTION_CONFIGS[type] : undefined;

  const patchKey = `${config?.type}Entries` as
    | "educationEntries"
    | "experienceEntries"
    | "projectEntries"
    | "certificateEntries"
    | "achievementEntries"
    | "researchEntries";

  const { data, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  type Entry = { id: string } & Record<string, string>;
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const serverEntries = config ? ((data?.[patchKey] as Entry[] | undefined) ?? undefined) : undefined;

  // Seed local editable state once from the server — after that this screen
  // owns the list until it saves, so in-progress edits don't get clobbered
  // by a background refetch.
  useEffect(() => {
    if (entries === null && serverEntries) setEntries(serverEntries);
  }, [entries, serverEntries]);

  const editingEntry = useMemo(
    () => entries?.find((e) => e.id === editingId) ?? null,
    [entries, editingId],
  );

  if (!config) {
    return (
      <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <SubScreenHeader title="Section" onBack={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const openNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const blank = { id: newEntryId(), ...config.empty() } as Entry;
    setEntries((prev) => [...(prev ?? []), blank]);
    setForm(blank as Record<string, string>);
    setEditingId(blank.id);
  };

  const openEdit = (entry: Entry) => {
    Haptics.selectionAsync();
    setForm(entry as Record<string, string>);
    setEditingId(entry.id);
  };

  const cancelEdit = () => {
    // A freshly-added entry that was never filled in shouldn't linger —
    // a real (previously-saved) entry can never be all-blank, so this only
    // ever drops the placeholder `openNew` just created.
    setEntries((prev) =>
      prev?.filter((e) => {
        if (e.id !== editingId) return true;
        const { id: _id, ...rest } = e;
        return Object.values(rest).some((v) => v && v !== "Present");
      }) ?? prev,
    );
    setEditingId(null);
  };

  const saveEdit = () => {
    setEntries((prev) => prev?.map((e) => (e.id === editingId ? ({ ...e, ...form } as Entry) : e)) ?? prev);
    setEditingId(null);
  };

  const deleteEntry = (id: string) => {
    Alert.alert("Delete entry?", "This can't be undone once you publish.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setEntries((prev) => prev?.filter((e) => e.id !== id) ?? prev);
        },
      },
    ]);
  };

  const publish = () => {
    if (!entries) return;
    setError("");
    updateProfile.mutate(
      { [patchKey]: entries } as Parameters<typeof updateProfile.mutate>[0],
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (err) => setError(describeError(err).message),
      },
    );
  };

  if (editingEntry) {
    return (
      <EntryFormScreen
        title={config.heading(editingEntry as never)}
        fields={config.fields}
        form={form}
        setForm={setForm}
        onCancel={cancelEdit}
        onSave={saveEdit}
      />
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <SubScreenHeader title={config.title} onBack={() => router.back()} />

        {isLoading || entries === null ? (
          <View style={{ gap: 8 }}>
            {[0, 1].map((i) => (
              <Skeleton key={i} height={72} radius={16} />
            ))}
          </View>
        ) : entries.length === 0 ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 36 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentWash }}>
              <Feather name="plus" size={24} color={colors.accentSoft} />
            </View>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: colors.muted, textAlign: "center", maxWidth: 260 }}>
              {config.emptyBody}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {entries.map((entry, i) => (
              <Rise key={entry.id} delay={i * 40}>
                <Pressable
                  onPress={() => openEdit(entry)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.sans600, fontSize: 14.5, color: colors.ink }}>
                      {config.heading(entry as never)}
                    </Text>
                    {config.summary(entry as never) ? (
                      <Text numberOfLines={1} style={{ fontFamily: fonts.sans400, fontSize: 12, color: colors.faint }}>
                        {config.summary(entry as never)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => deleteEntry(entry.id)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={colors.danger} />
                  </Pressable>
                  <Feather name="chevron-right" size={15} color={colors.whisper} />
                </Pressable>
              </Rise>
            ))}
          </View>
        )}

        <Pressable
          onPress={openNew}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: 50,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderStyle: "dashed",
          }}
        >
          <Feather name="plus" size={16} color={colors.ink} />
          <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: colors.ink }}>{config.addLabel}</Text>
        </Pressable>

        {error ? (
          <RevealText
            duration={200} y={0}  style={{ fontFamily: fonts.sans500, fontSize: 12.5, color: colors.danger, textAlign: "center" }}
          >
            {error}
          </RevealText>
        ) : null}

        <CtaButton
          label="Publish changes"
          icon="upload-cloud"
          onPress={publish}
          disabled={entries === null}
          loading={updateProfile.isPending}
        />
      </ScrollView>
    </Screen>
  );
}

function EntryFormScreen({
  title,
  fields,
  form,
  setForm,
  onCancel,
  onSave,
}: {
  title: string;
  fields: (typeof SECTION_CONFIGS)[SectionType]["fields"];
  form: Record<string, string>;
  setForm: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SubScreenHeader title={title} onBack={onCancel} />

        <Rise duration={400}  style={{ gap: 16 }}>
          {fields.map((field) =>
            field.kind === "yearRange" ? (
              <YearRangeField
                key={field.key}
                startLabel={field.startLabel}
                endLabel={field.endLabel}
                start={form[field.startKey] ?? ""}
                end={form[field.endKey] ?? ""}
                onStart={(v) => set(field.startKey, v)}
                onEnd={(v) => set(field.endKey, v)}
              />
            ) : (
              <View key={field.key} style={{ gap: 8 }}>
                <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>{field.label}</Text>
                <TextInput
                  value={form[field.key] ?? ""}
                  onChangeText={(v) => set(field.key, v)}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.faint}
                  multiline={field.kind === "textarea"}
                  style={{
                    minHeight: field.kind === "textarea" ? 100 : 52,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.panel,
                    paddingHorizontal: 16,
                    paddingVertical: field.kind === "textarea" ? 12 : 0,
                    textAlignVertical: field.kind === "textarea" ? "top" : "center",
                    fontFamily: fonts.sans400,
                    fontSize: 15,
                    color: colors.ink,
                  }}
                />
              </View>
            ),
          )}
        </Rise>

        <CtaButton label="Done" icon="check" onPress={onSave} />
      </ScrollView>
    </Screen>
  );
}

function YearRangeField({
  startLabel,
  endLabel,
  start,
  end,
  onStart,
  onEnd,
}: {
  startLabel: string;
  endLabel: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const present = end === "Present";
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>{startLabel}</Text>
        <TextInput
          value={start}
          onChangeText={onStart}
          placeholderTextColor={colors.faint}
          style={{
            minHeight: 52,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            paddingHorizontal: 16,
            fontFamily: fonts.sans400,
            fontSize: 15,
            color: colors.ink,
          }}
        />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: colors.muted }}>{endLabel}</Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onEnd(present ? "" : "Present");
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <View
              style={{
                width: 15,
                height: 15,
                borderRadius: 4,
                borderWidth: 1.4,
                borderColor: present ? colors.accent : colors.borderStrong,
                backgroundColor: present ? colors.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {present ? <Feather name="check" size={10} color="#fff" /> : null}
            </View>
            <Text style={{ fontFamily: fonts.sans500, fontSize: 11, color: colors.muted }}>Still there</Text>
          </Pressable>
        </View>
        <TextInput
          value={present ? "" : end}
          onChangeText={onEnd}
          editable={!present}
          placeholderTextColor={colors.faint}
          style={{
            minHeight: 52,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: present ? colors.deep : colors.panel,
            paddingHorizontal: 16,
            fontFamily: fonts.sans400,
            fontSize: 15,
            color: colors.ink,
          }}
        />
      </View>
    </View>
  );
}
