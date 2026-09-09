import { useEffect, useRef, useState } from "react";
import { Pop, Rise } from "@/components/ui/Motion";
import { Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { CircleIconButton } from "@/components/ui/Controls";
import { PulseRing, Spin } from "@/components/ui/Effects";
import { useTheme } from "@/lib/theme-context";
import { useOverlay } from "@/lib/overlay-context";
import { useProfile } from "@/lib/use-profile";
import {
  getResumeParseStatus,
  uploadResume,
  useUpdateProfile,
  type ParsedResumeData,
  type ResumeUploadResult,
} from "@/lib/profile-api";
import { layout } from "@/lib/theme";
import { fonts } from "@/lib/fonts";

type Icon = keyof typeof Feather.glyphMap;

const SECTION_ROWS: { key: keyof ParsedResumeData; icon: Icon; name: string }[] = [
  { key: "education", icon: "book-open", name: "Education" },
  { key: "experience", icon: "briefcase", name: "Experience" },
  { key: "projects", icon: "folder", name: "Projects" },
  { key: "certificates", icon: "award", name: "Certificates" },
  { key: "skills", icon: "zap", name: "Skills" },
];

/**
 * "17 Resume parse" — a real PDF goes to `POST /api/profile/resume`, this
 * screen polls `GET /api/profile/resume/status/:attemptId` until the AI job
 * finishes, and the counts shown are exactly what that job extracted — no
 * fabricated "17 entries" number, no scripted status text.
 */
export default function ResumeParse() {
  const { c } = useTheme();
  const { toast } = useOverlay();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [state, setState] = useState<"idle" | "uploading" | "running" | "done" | "failed">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeUploadResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  const parsesLeft = profile?.limits ? profile.limits.parsesRemaining : null;

  const poll = (attemptId: string) => {
    pollTimer.current = setTimeout(async () => {
      try {
        const status = await getResumeParseStatus(attemptId);
        if (status.status === "succeeded") {
          setResult(status);
          setState("done");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else if (status.status === "failed") {
          setErrorText(status.error ?? "Could not read that resume.");
          setState("failed");
        } else {
          setState("running");
          poll(attemptId);
        }
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : "Could not check parse status.");
        setState("failed");
      }
    }, 1500);
  };

  const pickAndUpload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setFileName(asset.name);
    setErrorText(null);
    setState("uploading");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      const upload = await uploadResume({ uri: asset.uri, name: asset.name, mimeType: "application/pdf" });
      if (upload.status === "succeeded") {
        setResult(upload);
        setState("done");
      } else if (upload.attemptId) {
        setState("running");
        poll(upload.attemptId);
      } else {
        throw new Error("The server didn't start a parse job.");
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Could not upload that file.");
      setState("failed");
    }
  };

  const counts = result?.data
    ? SECTION_ROWS.map((row) => ({ ...row, count: (result.data![row.key] as unknown[]).length }))
    : [];
  const totalCount = counts.reduce((sum, row) => sum + row.count, 0);

  const applyToProfile = () => {
    if (!result?.data || !profile) return;
    const data = result.data;
    const withIds = <T extends object>(items: T[]) =>
      items.map((item) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...item }));

    updateProfile.mutate(
      {
        educationEntries: [...(profile.educationEntries ?? []), ...withIds(data.education)] as never,
        experienceEntries: [...(profile.experienceEntries ?? []), ...withIds(data.experience)] as never,
        projectEntries: [...(profile.projectEntries ?? []), ...withIds(data.projects)] as never,
        certificateEntries: [...(profile.certificateEntries ?? []), ...withIds(data.certificates)] as never,
        skillEntries: [...(profile.skillEntries ?? []), ...withIds(data.skills)] as never,
      },
      {
        onSuccess: () => {
          setApplied(true);
          toast("Added to your sections");
          router.push("/(app)/edit-profile");
        },
        onError: () => toast("Could not save those entries"),
      },
    );
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <CircleIconButton icon="arrow-left" accessibilityLabel="Back" onPress={() => router.back()} />
          <Text style={{ flex: 1, fontFamily: fonts.serif600, fontSize: 24, letterSpacing: -0.4, color: c.ink }}>
            Parse resume
          </Text>
        </View>

        {state === "idle" ? (
          <Rise duration={400} style={{ gap: 14 }}>
            <Pressable
              onPress={pickAndUpload}
              style={{
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: c.border,
                height: 150,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.panel,
              }}
            >
              <Feather name="upload" size={26} color={c.accentSoft} />
              <Text style={{ marginTop: 10, fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>
                Choose a PDF resume
              </Text>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                Text-based PDF, not a scan or photo
              </Text>
            </Pressable>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                padding: 14,
                borderRadius: 16,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <Feather name="eye" size={16} color={c.accentSoft} />
              <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted }}>
                Nothing is published from this file. You review every extracted entry before it appears on your
                site.
              </Text>
            </View>

            {parsesLeft !== null ? (
              <Text style={{ textAlign: "center", fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                {parsesLeft} monthly {parsesLeft === 1 ? "parse" : "parses"} left
              </Text>
            ) : null}
          </Rise>
        ) : null}

        {state === "uploading" || state === "running" ? (
          <Rise duration={400} style={{ alignItems: "center", gap: 22, paddingTop: 36 }}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <PulseRing size={104} color={c.accentEdge} duration={2200} />
              <Spin duration={900}>
                <View
                  style={{
                    width: 78,
                    height: 78,
                    borderRadius: 39,
                    borderWidth: 2,
                    borderColor: c.border,
                    borderTopColor: c.accent,
                  }}
                />
              </Spin>
              <View style={{ position: "absolute" }}>
                <Feather name="file-text" size={24} color={c.accentSoft} />
              </View>
            </View>

            <View style={{ alignItems: "center", gap: 6 }}>
              <Text style={{ fontFamily: fonts.serif600, fontSize: 21, color: c.ink }}>
                {state === "uploading" ? "Uploading your resume" : "Reading your resume"}
              </Text>
              <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted, textAlign: "center" }}>
                {fileName ? `${fileName} · this can take up to a minute` : "This can take up to a minute"}
              </Text>
            </View>
          </Rise>
        ) : null}

        {state === "failed" ? (
          <Rise duration={400} style={{ gap: 14, alignItems: "center", paddingTop: 20 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(217,56,67,0.1)",
              }}
            >
              <Feather name="alert-triangle" size={24} color={c.danger} />
            </View>
            <Text style={{ fontFamily: fonts.serif600, fontSize: 19, color: c.ink, textAlign: "center" }}>
              Couldn't read that resume
            </Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted, textAlign: "center" }}>
              {errorText}
            </Text>
            <Pressable
              onPress={() => {
                setState("idle");
                setErrorText(null);
              }}
              style={{
                minHeight: 48,
                paddingHorizontal: 24,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.cta,
              }}
            >
              <Text style={{ fontFamily: fonts.sans700, fontSize: 14, color: c.onCta }}>Try again</Text>
            </Pressable>
          </Rise>
        ) : null}

        {state === "done" ? (
          <Rise duration={400} style={{ gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: 18,
                backgroundColor: "rgba(14,159,93,0.08)",
                borderWidth: 1,
                borderColor: "rgba(14,159,93,0.3)",
              }}
            >
              <Pop style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.panel }}>
                <Feather name="check" size={18} color={c.success} />
              </Pop>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.sans700, fontSize: 14.5, color: c.ink }}>
                  {totalCount} {totalCount === 1 ? "entry" : "entries"} extracted
                </Text>
                <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
                  {applied ? "Added to your sections" : "Add them to your profile, then review"}
                </Text>
              </View>
            </View>

            <View
              style={{
                borderRadius: 20,
                backgroundColor: c.panel,
                borderWidth: 1,
                borderColor: c.border,
                overflow: "hidden",
              }}
            >
              {counts.map((row) => (
                <View
                  key={row.key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  }}
                >
                  <Feather name={row.icon} size={15} color={c.accentSoft} />
                  <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 14, color: c.ink }}>{row.name}</Text>
                  <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>{row.count}</Text>
                </View>
              ))}
            </View>

            {!applied ? (
              <Pressable
                onPress={applyToProfile}
                disabled={updateProfile.isPending || totalCount === 0}
                style={{
                  minHeight: 54,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: totalCount === 0 ? c.deep : c.cta,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans700,
                    fontSize: 15,
                    color: totalCount === 0 ? c.faint : c.onCta,
                  }}
                >
                  {updateProfile.isPending ? "Saving…" : "Add to my profile"}
                </Text>
              </Pressable>
            ) : null}
          </Rise>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
