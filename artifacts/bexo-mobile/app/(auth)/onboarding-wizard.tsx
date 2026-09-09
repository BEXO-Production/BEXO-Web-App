import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import { Pop, Rise, SlideLeft } from "@/components/ui/Motion";
import Svg, { Circle, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { EntryEditorSheet, type DraftEntry } from "@/components/EntryEditorSheet";
import { Chip, CircleIconButton } from "@/components/ui/Controls";
import { PulseRing } from "@/components/ui/Effects";
import { WizardProgress } from "@/components/onboarding/WizardProgress";
import { useProfile } from "@/lib/use-profile";
import {
  getResumeParseStatus,
  linkGoogleAccount,
  suggestHandle,
  uploadFile,
  uploadResume,
  useCheckHandle,
  useUpdateProfile,
  type ParsedResumeData,
} from "@/lib/profile-api";
import { signInWithGoogle } from "@/lib/google-auth";
import { useOverlay } from "@/lib/overlay-context";
import { useTheme } from "@/lib/theme-context";
import { ease } from "@/lib/motion";
import { brand } from "@/lib/theme";
import {
  GENDER_OPTIONS,
  PLANS,
  PLAN_CTA_NAMES,
  PRONOUN_OPTIONS,
  PUBLISH_CHECKS,
  SITE_BACKGROUNDS,
  SITE_COLORS,
  SITE_FONT_IDS,
  SITE_TEMPLATES,
  WIZARD_STEPS,
  type ReviewSection,
} from "@/lib/design-data";
import {
  NativeWebsitePreview,
  SITE_FONT_FAMILY,
  type OverrideProfileData,
} from "@/components/portfolio/NativeWebsitePreview";
import { fonts } from "@/lib/fonts";

const RESUME_IMAGE = require("../../assets/brand/resume.jpg");
const PUBLISH_IMAGE = require("../../assets/brand/publish.jpg");
const TOTAL_STEPS = 9;

/**
 * "05 Wizard" — steps 2 through 9 (step 1 was the phone/OTP pair). Name,
 * handle, photo, resume and template all write to the live API; the review
 * step edits a local copy of the parsed sections, and the plan step records a
 * choice without pretending to take a payment.
 */
export default function OnboardingWizard() {
  const { c, shadow } = useTheme();
  const { wipe, toast } = useOverlay();
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState(2);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [gender, setGender] = useState("male");
  const [pronoun, setPronoun] = useState("he");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [resumeName, setResumeName] = useState<string | null>(null);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResumeData | null>(null);
  const [sectionsCommitted, setSectionsCommitted] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const sections: ReviewSection[] = parsedData ? sectionsFromParsed(parsedData) : [];
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [templateId, setTemplateId] = useState<string>(SITE_TEMPLATES[0].id);
  const [colorId, setColorId] = useState<string>("blue");
  const [backgroundId, setBackgroundId] = useState<string>("grid");
  const [fontId, setFontId] = useState<string>("display");
  const [fullScreenPreview, setFullScreenPreview] = useState(false);
  const [planId, setPlanId] = useState("essential");
  const [busy, setBusy] = useState(false);

  const { data: handleCheck, isFetching: checkingHandle } = useCheckHandle(handle);
  const handleAvailable = handle.length >= 3 && handleCheck?.available === true;

  useEffect(() => {
    if (!data?.user) return;
    if (data.user.name && !name) setName(data.user.name);
    if (data.user.photoUrl) setPhotoSaved(true);
    if (data.user.uploadedResumeUrl) setResumeSaved(true);
    if (data.user.templateId) setTemplateId(data.user.templateId);
    if (data.user.themeColor) setColorId(data.user.themeColor);
    if (data.user.themeBg) setBackgroundId(data.user.themeBg);
  }, [data, name]);

  useEffect(() => {
    if (handleTouched || !name.trim()) return;
    const [first, ...rest] = name.trim().split(/\s+/);
    suggestHandle(first, rest.join(" "))
      .then(setHandle)
      .catch(() => undefined);
  }, [name, handleTouched]);

  const accent = useMemo(
    () => SITE_COLORS.find((opt) => opt.id === colorId)?.hex ?? SITE_COLORS[0].hex,
    [colorId],
  );
  const siteFont = SITE_FONT_FAMILY[fontId] ?? fonts.serif600;

  const previewOverride: OverrideProfileData = useMemo(() => {
    const aboutSec = sections.find((s) => s.name.toLowerCase() === "about");
    const headlineEntry = aboutSec?.entries.find((e) => e.title.toLowerCase().includes("headline"));
    const summaryEntry = aboutSec?.entries.find(
      (e) => e.title.toLowerCase().includes("summary") || e.title.toLowerCase().includes("bio"),
    );

    const projectSec = sections.find((s) => s.name.toLowerCase() === "projects");
    const previewProjects = projectSec?.entries.map((e) => ({
      title: e.title,
      desc: e.detail,
      tags: ["Featured", "Production"],
    }));

    const skillSec = sections.find((s) => s.name.toLowerCase() === "skills");
    const previewSkills = skillSec?.entries.map((e) => e.title || e.detail);

    return {
      name: name.trim() || undefined,
      handle: handle.trim().toLowerCase() || undefined,
      headline: headlineEntry?.detail || undefined,
      bio: summaryEntry?.detail || undefined,
      photoUrl: photoUri || undefined,
      projects: previewProjects && previewProjects.length > 0 ? previewProjects : undefined,
      skills: previewSkills && previewSkills.length > 0 ? previewSkills : undefined,
    };
  }, [name, handle, photoUri, sections]);

  const meta = WIZARD_STEPS[step];
  const reviewDone = reviewIndex >= sections.length;

  const ctaLabel = useMemo(() => {
    if (step === 6) {
      return reviewDone
        ? "All sections verified — continue"
        : `Confirm ${sections[reviewIndex].name} (${reviewIndex + 1} of ${sections.length})`;
    }
    if (step === 9) {
      return planId === "free" ? "Continue with free" : `Get ${PLAN_CTA_NAMES[planId] ?? "started"}`;
    }
    return meta.cta;
  }, [step, reviewDone, reviewIndex, sections, planId, meta.cta]);

  const goBack = () => {
    if (step === 2) router.back();
    else setStep((s) => s - 1);
  };

  const advance = () => wipe(() => setStep((s) => s + 1));

  const onCta = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (step === 3) {
      if (!name.trim() || !handleAvailable) return;
      setBusy(true);
      try {
        await updateProfile.mutateAsync({ name: name.trim(), handle: handle.trim().toLowerCase() });
        advance();
      } catch {
        toast("Could not save that handle");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 6 && !reviewDone) {
      setReviewIndex((i) => i + 1);
      return;
    }
    if (step === 6 && reviewDone) {
      commitSections();
    }

    if (step === 7) {
      setBusy(true);
      try {
        await updateProfile.mutateAsync({
          templateId,
          themeColor: colorId,
          themeBg: backgroundId,
        });
      } catch {
        // The template can still be changed later from the Website tab.
      } finally {
        setBusy(false);
      }
      advance();
      return;
    }

    if (step === TOTAL_STEPS) {
      wipe(() => router.replace("/(auth)/celebrate"));
      return;
    }

    advance();
  };

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const google = await signInWithGoogle();
      const linked = await linkGoogleAccount(google.supabaseAccessToken);
      setGoogleEmail(linked.user.email);
    } catch {
      toast("Could not connect Google");
    } finally {
      setConnecting(false);
    }
  };

  const pickPhoto = async (source: "camera" | "library") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    try {
      const { url } = await uploadFile({ uri: asset.uri, name: "profile-photo.jpg", mimeType: "image/jpeg" });
      await updateProfile.mutateAsync({ photoUrl: url });
      setPhotoSaved(true);
    } catch {
      toast("Photo saved on this device — we'll retry the upload");
    }
  };

  const pollParse = (attemptId: string) => {
    setTimeout(async () => {
      try {
        const status = await getResumeParseStatus(attemptId);
        if (status.status === "succeeded") {
          setParsedData(status.data ?? null);
          setResumeSaved(true);
          setResumeParsing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else if (status.status === "failed") {
          setResumeParsing(false);
          toast(status.error ?? "Could not read that resume");
        } else {
          pollParse(attemptId);
        }
      } catch {
        setResumeParsing(false);
        toast("Could not check parse status");
      }
    }, 1500);
  };

  const pickResume = async () => {
    // Only PDF is accepted server-side (see POST /api/profile/resume).
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    setResumeName(picked.name);
    setResumeParsing(true);
    try {
      const upload = await uploadResume({ uri: picked.uri, name: picked.name, mimeType: "application/pdf" });
      if (upload.status === "succeeded") {
        setParsedData(upload.data ?? null);
        setResumeSaved(true);
        setResumeParsing(false);
      } else if (upload.attemptId) {
        pollParse(upload.attemptId);
      } else {
        throw new Error("The server didn't start a parse job.");
      }
    } catch (err) {
      setResumeParsing(false);
      toast(err instanceof Error ? err.message : "Could not upload that file");
    }
  };

  const saveDraft = (entry: DraftEntry) => {
    setParsedData((prev) => applyDraftToParsed(prev ?? EMPTY_PARSED, entry));
    setDraft(null);
  };

  const deleteDraft = (entry: DraftEntry) => {
    if (entry.entryIndex === -1 || !parsedData) return;
    setParsedData((prev) => removeFromParsed(prev ?? EMPTY_PARSED, entry));
    setDraft(null);
  };

  /** Once review is confirmed, the structured (not display-string) entries go
   * to the profile — this is the moment "reading once, then reviewed" ends
   * and the data becomes part of the live portfolio. */
  const commitSections = () => {
    if (sectionsCommitted || !parsedData || !data) return;
    setSectionsCommitted(true);
    const withIds = <T extends object>(items: T[]) =>
      items.map((item) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...item }));
    updateProfile.mutate({
      educationEntries: [...(data.educationEntries ?? []), ...withIds(parsedData.education)] as never,
      experienceEntries: [...(data.experienceEntries ?? []), ...withIds(parsedData.experience)] as never,
      projectEntries: [...(data.projectEntries ?? []), ...withIds(parsedData.projects)] as never,
      certificateEntries: [...(data.certificateEntries ?? []), ...withIds(parsedData.certificates)] as never,
      skillEntries: [...(data.skillEntries ?? []), ...withIds(parsedData.skills)] as never,
    });
  };

  const ctaDisabled = busy || (step === 3 && (!name.trim() || !handleAvailable));

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["bottom"]}>
      <View style={{ paddingHorizontal: 22, paddingTop: 58, paddingBottom: 14, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <CircleIconButton icon="arrow-left" accessibilityLabel="Back" onPress={goBack} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                fontFamily: fonts.sans700,
                fontSize: 10.5,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: c.accentSoft,
              }}
            >
              Step {step} of {TOTAL_STEPS}
            </Text>
            <Text style={{ fontFamily: fonts.serif600, fontSize: 23, letterSpacing: -0.4, color: c.ink }}>
              {meta.label}
            </Text>
          </View>
          {meta.image ? (
            <Image
              source={meta.image}
              style={{ width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: c.border }}
            />
          ) : null}
        </View>

        <WizardProgress step={step} total={TOTAL_STEPS} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 20, gap: 16, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {meta.hint && step !== 5 ? (
          <Text style={{ fontFamily: fonts.sans400, fontSize: 13.5, lineHeight: 21, color: c.muted }}>
            {meta.hint}
          </Text>
        ) : null}

        {step === 5 ? (
          <Rise
            duration={400}  style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.accentWash,
              }}
            >
              <PulseRing size={42} color={c.accentEdge} duration={2800} />
              <Feather name="eye" size={16} color={c.accentSoft} />
            </View>
            <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 13, lineHeight: 19.5, color: c.muted }}>
              We read it{" "}
              <Text style={{ fontFamily: fonts.serif600Italic, color: c.ink }}>once</Text>, then forget it — you
              review every line before anything is public.
            </Text>
          </Rise>
        ) : null}

        {step === 2 ? (
          <Rise duration={400}  style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 22 }}>
            {googleEmail ? (
              <Pop  style={{ width: "100%", maxWidth: 320 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 13,
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: c.panel,
                    borderWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    <LinearGradient
                      colors={[brand.accentBright, brand.accent]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 16, color: "#fff" }}>
                      {googleEmail[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>
                      {name || "Connected"}
                    </Text>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.muted }}>
                      {googleEmail}
                    </Text>
                  </View>
                  <Feather name="check-circle" size={20} color={c.success} />
                </View>
              </Pop>
            ) : (
              <>
                <Pressable
                  onPress={connectGoogle}
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    minHeight: 56,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    backgroundColor: c.panel,
                    borderWidth: 1,
                    borderColor: c.borderStrong,
                  }}
                >
                  <GoogleMark />
                  <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>
                    {connecting ? "Connecting…" : "Continue with Google"}
                  </Text>
                </Pressable>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    padding: 14,
                    borderRadius: 14,
                    maxWidth: 320,
                    backgroundColor: c.panel,
                    borderWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <Feather name="shield" size={16} color={c.accentSoft} />
                  <Text style={{ flex: 1, fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 19, color: c.muted }}>
                    We only read your email address to make sign-in and recovery easier. Nothing is posted
                    anywhere.
                  </Text>
                </View>
              </>
            )}
          </Rise>
        ) : null}

        {step === 3 ? (
          <Rise duration={400}  style={{ gap: 18 }}>
            <Field label="Full name">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={c.faint}
                style={{
                  minHeight: 56,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.borderStrong,
                  fontFamily: fonts.sans400,
                  fontSize: 16,
                  color: c.ink,
                }}
              />
            </Field>

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Your handle</Text>
              <View
                style={{
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: handleAvailable ? c.accentEdge : c.borderStrong,
                }}
              >
                <TextInput
                  value={handle}
                  onChangeText={(value) => {
                    setHandleTouched(true);
                    setHandle(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  }}
                  placeholder="yourname"
                  placeholderTextColor={c.faint}
                  autoCapitalize="none"
                  style={{ fontFamily: fonts.mono500, fontSize: 15, color: c.ink }}
                />
                <Text style={{ fontFamily: fonts.mono500, fontSize: 15, color: c.faint }}>.atbexo.com</Text>
                <View style={{ flex: 1 }} />
                {handle.length >= 3 && !checkingHandle ? (
                  <Feather
                    name={handleAvailable ? "check" : "x"}
                    size={16}
                    color={handleAvailable ? c.success : c.danger}
                  />
                ) : null}
              </View>
              {handle.length >= 3 && !checkingHandle ? (
                <Text
                  style={{
                    fontFamily: fonts.sans500,
                    fontSize: 12,
                    color: handleAvailable ? c.success : c.danger,
                  }}
                >
                  {handleAvailable ? `${handle}.atbexo.com is available` : "That handle is taken"}
                </Text>
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Gender</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {GENDER_OPTIONS.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    active={gender === option.id}
                    onPress={() => setGender(option.id)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>Pronouns</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {PRONOUN_OPTIONS.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    active={pronoun === option.id}
                    onPress={() => setPronoun(option.id)}
                  />
                ))}
              </View>
            </View>
          </Rise>
        ) : null}

        {step === 4 ? (
          <Rise duration={400}  style={{ alignItems: "center", gap: 20, paddingTop: 10 }}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <PulseRing size={156} color={c.accentEdge} duration={2600} />
              <View
                style={{
                  width: 136,
                  height: 136,
                  borderRadius: 68,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  backgroundColor: c.deep,
                  borderWidth: 1,
                  borderColor: c.border,
                  ...shadow.card,
                }}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Text style={{ fontFamily: fonts.serif600, fontSize: 46, color: c.faint }}>
                    {(name || "?")[0].toUpperCase()}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ width: "100%", gap: 10 }}>
              <SolidButton icon="camera" label="Take a photo" onPress={() => pickPhoto("camera")} />
              <OutlineButton icon="image" label="Choose from library" onPress={() => pickPhoto("library")} />
            </View>
          </Rise>
        ) : null}

        {step === 5 ? (
          <Rise delay={60} duration={400}  style={{ gap: 14 }}>
            <View style={{ height: 150, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
              <Image source={RESUME_IMAGE} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              <LinearGradient
                colors={["rgba(5,7,15,0.1)", "rgba(5,7,15,0.72)"]}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", padding: 18, gap: 4 }}
              >
                <Text style={{ fontFamily: fonts.sans700, fontSize: 16, color: "#fff" }}>
                  {resumeName ?? "Upload your resume"}
                </Text>
                <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                  {resumeParsing
                    ? "Reading your resume…"
                    : resumeSaved
                      ? `${parsedData ? Object.values(parsedData).reduce((n, list) => n + list.length, 0) : 0} entries found`
                      : "PDF only · read once, always reviewed by you"}
                </Text>
              </LinearGradient>
            </View>
            <SolidButton
              icon={resumeParsing ? "loader" : "upload"}
              label={resumeParsing ? "Reading…" : resumeSaved ? "Choose a different file" : "Choose file"}
              onPress={pickResume}
              disabled={resumeParsing}
            />
            <Pressable onPress={advance} style={{ alignItems: "center", padding: 8 }}>
              <Text style={{ fontFamily: fonts.sans600, fontSize: 13.5, color: c.muted }}>
                I’ll type it in myself
              </Text>
            </Pressable>
          </Rise>
        ) : null}

        {step === 6 && sections.length === 0 ? (
          <Rise
            style={{
              alignItems: "center",
              gap: 10,
              paddingVertical: 30,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="file-text" size={26} color={c.faint} />
            <Text style={{ fontFamily: fonts.serif600, fontSize: 18, color: c.ink, textAlign: "center" }}>
              Nothing to review
            </Text>
            <Text style={{ fontFamily: fonts.sans400, fontSize: 13, lineHeight: 20, color: c.muted, textAlign: "center" }}>
              You skipped the resume upload, so there's nothing extracted yet. You can add sections manually any
              time from Edit profile.
            </Text>
          </Rise>
        ) : null}

        {step === 6 && sections.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 4 }}>
              <Text
                style={{
                  fontFamily: fonts.sans700,
                  fontSize: 10.5,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: c.accentSoft,
                }}
              >
                {reviewDone
                  ? `All ${sections.length} sections verified`
                  : `Section ${reviewIndex + 1} of ${sections.length}`}
              </Text>
              <View style={{ flex: 1, height: 2, borderRadius: 2, backgroundColor: c.deep, overflow: "hidden" }}>
                <View
                  style={{
                    width: `${(Math.min(reviewIndex, sections.length) / Math.max(1, sections.length)) * 100}%`,
                    height: "100%",
                    backgroundColor: c.accent,
                  }}
                />
              </View>
            </View>

            {sections.map((section, i) => {
              const done = i < reviewIndex;
              const isOpen = i === reviewIndex;
              return (
                <View
                  key={section.name}
                  style={{
                    borderRadius: 16,
                    backgroundColor: c.panel,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: isOpen ? c.accentEdge : c.border,
                    opacity: done || isOpen ? 1 : 0.55,
                    ...(isOpen ? shadow.card : null),
                  }}
                >
                  <Pressable
                    onPress={() => i <= reviewIndex && setReviewIndex(i)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, paddingHorizontal: 16 }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: done ? "rgba(14,159,93,0.10)" : c.accentWash,
                      }}
                    >
                      <Feather name={section.icon} size={16} color={done ? c.success : c.accentSoft} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: fonts.sans600, fontSize: 15, color: c.ink }}>{section.name}</Text>
                      <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.faint }}>
                        {done
                          ? "Verified"
                          : isOpen
                            ? `Check these ${section.entries.length} entries`
                            : "Waiting for review"}
                      </Text>
                    </View>
                    {isOpen ? (
                      <Pressable
                        onPress={() => setDraft({ sectionIndex: i, entryIndex: -1, title: "", detail: "", date: "" })}
                        hitSlop={8}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: c.accentWash,
                        }}
                      >
                        <Feather name="plus" size={14} color={c.accentSoft} />
                      </Pressable>
                    ) : null}
                    <Feather
                      name={done ? "check-circle" : isOpen ? "chevron-up" : "lock"}
                      size={16}
                      color={done ? c.success : isOpen ? c.accentSoft : c.whisper}
                    />
                  </Pressable>

                  {isOpen ? (
                    <Rise duration={300}  style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
                      {section.entries.map((entry, ei) => (
                        <Pressable
                          key={`${entry.title}-${ei}`}
                          onPress={() =>
                            setDraft({
                              sectionIndex: i,
                              entryIndex: ei,
                              title: entry.title,
                              detail: entry.detail,
                              date: entry.date ?? "",
                            })
                          }
                          style={{
                            flexDirection: "row",
                            gap: 12,
                            paddingVertical: 13,
                            paddingHorizontal: 14,
                            borderRadius: 13,
                            backgroundColor: c.panelStrong,
                            borderWidth: 1,
                            borderColor: c.border,
                          }}
                        >
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.ink }}>
                              {entry.title}
                            </Text>
                            <Text style={{ fontFamily: fonts.sans400, fontSize: 12, lineHeight: 18, color: c.muted }}>
                              {entry.detail}
                            </Text>
                            {entry.date ? (
                              <Text style={{ fontFamily: fonts.sans400, fontSize: 11, color: c.faint }}>
                                {entry.date}
                              </Text>
                            ) : null}
                          </View>
                          <Feather name="edit-2" size={14} color={c.whisper} />
                        </Pressable>
                      ))}

                      <Pressable
                        onPress={() => setDraft({ sectionIndex: i, entryIndex: -1, title: "", detail: "", date: "" })}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 13,
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: c.borderStrong,
                        }}
                      >
                        <Feather name="plus" size={14} color={c.accentSoft} />
                        <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.accentSoft }}>
                          Add item not in your resume
                        </Text>
                      </Pressable>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 }}>
                        <Feather name="info" size={13} color={c.faint} />
                        <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint }}>
                          Read from your resume — tap any entry to correct it.
                        </Text>
                      </View>
                    </Rise>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {step === 7 ? (
          <Rise duration={400} style={{ gap: 20 }}>
            {/* Live Browser Mockup with Real Website Preview */}
            <View
              style={{
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.panel,
                ...shadow.card,
              }}
            >
              {/* Safari Window Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: c.panelStrong,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {["#FF5F57", "#FEBC2E", "#28C840"].map((dot) => (
                    <View key={dot} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />
                  ))}
                </View>

                <View
                  style={{
                    flex: 1,
                    marginHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 5,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: c.panel,
                    borderWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <Feather name="lock" size={10} color={c.muted} />
                  <Text numberOfLines={1} style={{ fontFamily: fonts.mono500, fontSize: 11, color: c.ink }}>
                    {handle ? `${handle.toLowerCase()}.atbexo.com` : "yourhandle.atbexo.com"}
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setFullScreenPreview(true);
                  }}
                  hitSlop={8}
                  style={{
                    padding: 5,
                    borderRadius: 8,
                    backgroundColor: c.accentWash,
                  }}
                >
                  <Feather name="maximize-2" size={13} color={c.accentSoft} />
                </Pressable>
              </View>

              {/* Embedded Native Preview Canvas */}
              <View style={{ height: 280, overflow: "hidden" }}>
                <NativeWebsitePreview
                  data={data}
                  overrideProfile={previewOverride}
                  templateId={templateId}
                  colorId={colorId}
                  accent={accent}
                  siteFont={siteFont}
                  backgroundId={backgroundId}
                  site={handle ? `${handle}.atbexo.com` : "yourhandle.atbexo.com"}
                  onOpenFull={() => setFullScreenPreview(true)}
                />

                {/* Subtle bottom gradient hint to tap full screen */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setFullScreenPreview(true);
                  }}
                  style={{
                    position: "absolute",
                    bottom: 10,
                    right: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: "rgba(15,18,25,0.85)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.18)",
                  }}
                >
                  <Feather name="eye" size={12} color="#fff" />
                  <Text style={{ fontFamily: fonts.sans700, fontSize: 11, color: "#fff" }}>
                    Full interactive view
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Section: Select Template */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: fonts.sans700, fontSize: 13, letterSpacing: 0.3, color: c.ink }}>
                  Choose Layout Style
                </Text>
                <Text style={{ fontFamily: fonts.mono500, fontSize: 11, color: c.accentSoft }}>
                  3 Pro Templates
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                {SITE_TEMPLATES.map((template) => {
                  const active = template.id === templateId;
                  return (
                    <Pressable
                      key={template.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTemplateId(template.id);
                      }}
                      style={{
                        borderRadius: 18,
                        padding: 12,
                        backgroundColor: c.panel,
                        borderWidth: 1.5,
                        borderColor: active ? c.accent : c.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                        ...(active ? shadow.card : null),
                      }}
                    >
                      <View
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 12,
                          overflow: "hidden",
                          backgroundColor: c.deep,
                        }}
                      >
                        <Image source={template.image} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      </View>

                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ fontFamily: fonts.serif600, fontSize: 16, color: c.ink }}>
                            {template.name}
                          </Text>
                          <View
                            style={{
                              paddingVertical: 2,
                              paddingHorizontal: 6,
                              borderRadius: 6,
                              backgroundColor: active ? c.accentWash : c.deep,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: fonts.mono500,
                                fontSize: 9,
                                letterSpacing: 0.5,
                                textTransform: "uppercase",
                                color: active ? c.accent : c.muted,
                              }}
                            >
                              {template.id === "cura-futuri"
                                ? "Dark · Dynamic"
                                : template.id === "sierra-montana"
                                  ? "Cream · Cinematic"
                                  : "Light · Editorial"}
                            </Text>
                          </View>
                        </View>

                        <Text
                          numberOfLines={2}
                          style={{
                            fontFamily: fonts.sans400,
                            fontSize: 11.5,
                            lineHeight: 16,
                            color: c.muted,
                          }}
                        >
                          {template.note}
                        </Text>
                      </View>

                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1.5,
                          borderColor: active ? c.accent : c.borderStrong,
                          backgroundColor: active ? c.accent : "transparent",
                        }}
                      >
                        {active ? <Feather name="check" size={13} color="#fff" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Section: Accent Color Swatches */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: fonts.sans700, fontSize: 13, letterSpacing: 0.3, color: c.ink }}>
                Accent Color Palette
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {SITE_COLORS.map((color) => {
                  const active = color.id === colorId;
                  return (
                    <Pressable
                      key={color.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setColorId(color.id);
                      }}
                      style={{
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 21,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: color.hex,
                          borderWidth: active ? 3 : 1,
                          borderColor: active ? c.ink : "transparent",
                          ...(active ? shadow.card : null),
                        }}
                      >
                        {active ? <Feather name="check" size={16} color="#fff" /> : null}
                      </View>
                      <Text
                        style={{
                          fontFamily: active ? fonts.sans700 : fonts.sans500,
                          fontSize: 10.5,
                          color: active ? c.ink : c.muted,
                        }}
                      >
                        {color.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Section: Typography / Typeface */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: fonts.sans700, fontSize: 13, letterSpacing: 0.3, color: c.ink }}>
                Typography Pairing
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SITE_FONT_IDS.map((font) => {
                  const active = font.id === fontId;
                  return (
                    <Pressable
                      key={font.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setFontId(font.id);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderRadius: 14,
                        backgroundColor: active ? c.accentWash : c.panel,
                        borderWidth: 1.5,
                        borderColor: active ? c.accent : c.border,
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: SITE_FONT_FAMILY[font.id] ?? fonts.sans700,
                          fontSize: 16,
                          color: active ? c.accent : c.ink,
                        }}
                      >
                        Aa
                      </Text>
                      <Text
                        style={{
                          fontFamily: fonts.sans600,
                          fontSize: 11,
                          color: active ? c.accent : c.muted,
                        }}
                      >
                        {font.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Section: Canvas Background Texture */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: fonts.sans700, fontSize: 13, letterSpacing: 0.3, color: c.ink }}>
                Background Texture
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SITE_BACKGROUNDS.map((bg) => {
                  const active = bg.id === backgroundId;
                  return (
                    <Pressable
                      key={bg.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setBackgroundId(bg.id);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 6,
                        borderRadius: 13,
                        backgroundColor: active ? c.accentWash : c.panel,
                        borderWidth: 1.5,
                        borderColor: active ? c.accent : c.border,
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Feather
                        name={
                          bg.id === "grid"
                            ? "grid"
                            : bg.id === "dots"
                              ? "circle"
                              : bg.id === "waves"
                                ? "activity"
                                : "sun"
                        }
                        size={16}
                        color={active ? c.accent : c.muted}
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: fonts.sans600,
                          fontSize: 10.5,
                          color: active ? c.accent : c.muted,
                          textAlign: "center",
                        }}
                      >
                        {bg.label.split(" ")[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Rise>
        ) : null}

        {step === 8 ? (
          <PublishStep
            photoSaved={photoSaved}
            resumeSaved={resumeSaved}
            handle={handle}
            templateId={templateId}
            colorId={colorId}
            backgroundId={backgroundId}
            fontId={fontId}
            overrideProfile={previewOverride}
            data={data}
          />
        ) : null}

        {step === 9 ? (
          <Rise duration={400}  style={{ gap: 12 }}>
            {PLANS.map((plan) => {
              const selected = plan.id === planId;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPlanId(plan.id);
                  }}
                  style={{
                    borderRadius: 22,
                    padding: 18,
                    gap: 12,
                    borderWidth: 1.5,
                    borderColor: selected ? plan.accent : c.border,
                    backgroundColor: c.panel,
                    ...(selected ? shadow.card : shadow.low),
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 2,
                        borderColor: selected ? plan.accent : c.borderStrong,
                        backgroundColor: selected ? plan.accent : "transparent",
                      }}
                    >
                      {selected ? <Feather name="check" size={13} color="#fff" /> : null}
                    </View>

                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text style={{ fontFamily: fonts.sans700, fontSize: 16.5, color: c.ink }}>{plan.name}</Text>
                        {plan.tag ? (
                          <View
                            style={{
                              paddingVertical: 3,
                              paddingHorizontal: 9,
                              borderRadius: 999,
                              backgroundColor: `${plan.accent}24`,
                              borderWidth: 1,
                              borderColor: `${plan.accent}4d`,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: fonts.sans700,
                                fontSize: 9.5,
                                letterSpacing: 1.2,
                                textTransform: "uppercase",
                                color: plan.accent,
                              }}
                            >
                              {plan.tag}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, lineHeight: 18, color: c.muted }}>
                        {plan.desc}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontFamily: fonts.sans800, fontSize: 19, letterSpacing: -0.3, color: c.ink }}>
                        {plan.price}
                      </Text>
                      <Text style={{ fontFamily: fonts.sans600, fontSize: 10.5, color: c.faint }}>{plan.per}</Text>
                    </View>
                  </View>

                  {selected ? (
                    <Rise
                      duration={300}  style={{ gap: 7, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border }}
                    >
                      {plan.perks.map((perk) => (
                        <View key={perk} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                          <View
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: `${plan.accent}2e`,
                            }}
                          >
                            <Feather name="check" size={10} color={plan.accent} />
                          </View>
                          <Text style={{ fontFamily: fonts.sans400, fontSize: 12.5, color: c.ink }}>{perk}</Text>
                        </View>
                      ))}
                    </Rise>
                  ) : null}
                </Pressable>
              );
            })}

            <Text style={{ textAlign: "center", fontFamily: fonts.sans400, fontSize: 11, color: c.faint }}>
              Prices in INR · GST (18%) added at checkout · extra storage from ₹25/mo
            </Text>
          </Rise>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 22,
          paddingTop: 12,
          paddingBottom: 24,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.panelStrong,
        }}
      >
        <Pressable
          onPress={onCta}
          disabled={ctaDisabled}
          style={{
            minHeight: 56,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ctaDisabled ? c.deep : c.cta,
            ...shadow.low,
          }}
        >
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: ctaDisabled ? c.faint : c.onCta }}>
            {busy ? "Saving…" : ctaLabel}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={fullScreenPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullScreenPreview(false)}
      >
        <View style={{ flex: 1, backgroundColor: c.paper }}>
          <View
            style={{
              paddingTop: 54,
              paddingBottom: 14,
              paddingHorizontal: 20,
              backgroundColor: c.panelStrong,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.accentWash,
                }}
              >
                <Feather name="globe" size={16} color={c.accentSoft} />
              </View>
              <View>
                <Text style={{ fontFamily: fonts.serif600, fontSize: 16, color: c.ink }}>
                  Live Portfolio Preview
                </Text>
                <Text style={{ fontFamily: fonts.mono500, fontSize: 11, color: c.faint }}>
                  {handle ? `${handle.toLowerCase()}.atbexo.com` : "yourname.atbexo.com"}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => setFullScreenPreview(false)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor: c.cta,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text style={{ fontFamily: fonts.sans700, fontSize: 12.5, color: c.onCta }}>
                Done
              </Text>
              <Feather name="x" size={14} color={c.onCta} />
            </Pressable>
          </View>

          <NativeWebsitePreview
            data={data}
            overrideProfile={previewOverride}
            templateId={templateId}
            colorId={colorId}
            accent={accent}
            siteFont={siteFont}
            backgroundId={backgroundId}
            site={handle ? `${handle.toLowerCase()}.atbexo.com` : "yourname.atbexo.com"}
            isFullScreen
          />
        </View>
      </Modal>

      <EntryEditorSheet
        draft={draft}
        sectionName={draft ? sections[draft.sectionIndex].name : ""}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
        onDelete={deleteDraft}
      />
    </Screen>
  );
}

/** Step 8 — the publish preview, the completion ring, and the checklist. */
function PublishStep({
  photoSaved,
  resumeSaved,
  handle,
  templateId,
  colorId,
  backgroundId,
  fontId,
  overrideProfile,
  data,
}: {
  photoSaved: boolean;
  resumeSaved: boolean;
  handle: string;
  templateId: string;
  colorId: string;
  backgroundId: string;
  fontId: string;
  overrideProfile: OverrideProfileData;
  data: ReturnType<typeof useProfile>["data"];
}) {
  const { c, shadow } = useTheme();
  const pct = useSharedValue(0);
  const [label, setLabel] = useState(0);

  const accent = useMemo(
    () => SITE_COLORS.find((opt) => opt.id === colorId)?.hex ?? SITE_COLORS[0].hex,
    [colorId],
  );
  const siteFont = SITE_FONT_FAMILY[fontId] ?? fonts.serif600;

  useEffect(() => {
    pct.value = withTiming(1, { duration: 1000, easing: ease.soft });
    const id = setInterval(() => setLabel((value) => (value >= 100 ? 100 : value + 4)), 40);
    return () => clearInterval(id);
  }, [pct]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: 2 * Math.PI * 30 * (1 - pct.value),
  }));

  const checks = PUBLISH_CHECKS.map((check, i) => ({
    ...check,
    done: i === 1 ? true : i === 2 ? photoSaved || resumeSaved : true,
  }));

  return (
    <Rise duration={400} style={{ gap: 16 }}>
      <View style={{ borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.border, ...shadow.card }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 11,
            paddingHorizontal: 14,
            backgroundColor: c.panelStrong,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          {["#FF5F57", "#FEBC2E", "#28C840"].map((dot) => (
            <View key={dot} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />
          ))}
          <View
            style={{
              flex: 1,
              marginLeft: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <Feather name="lock" size={10} color={c.muted} />
            <Text numberOfLines={1} style={{ fontFamily: fonts.mono500, fontSize: 11.5, color: c.ink }}>
              {handle ? `${handle.toLowerCase()}.atbexo.com` : "yourname.atbexo.com"}
            </Text>
          </View>
        </View>

        <View style={{ height: 168, overflow: "hidden" }}>
          <NativeWebsitePreview
            data={data}
            overrideProfile={overrideProfile}
            templateId={templateId}
            colorId={colorId}
            accent={accent}
            siteFont={siteFont}
            backgroundId={backgroundId}
            site={handle ? `${handle.toLowerCase()}.atbexo.com` : "yourname.atbexo.com"}
          />
          <LinearGradient
            colors={["rgba(5,7,15,0.0)", "rgba(5,7,15,0.72)"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", padding: 14 }}
            pointerEvents="none"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: "#34D399" }}>
                <PulseRing size={19} color="#34D399" borderWidth={1.5} duration={1800} style={{ left: -5, top: -5 }} />
              </View>
              <Text style={{ fontFamily: fonts.sans700, fontSize: 12.5, letterSpacing: 0.5, color: "#fff" }}>
                Ready to go live · {handle || "yourname"}.atbexo.com
              </Text>
            </View>
          </LinearGradient>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 4 }}>
        <View style={{ width: 64, height: 64 }}>
          <Svg width={64} height={64} style={{ transform: [{ rotate: "-90deg" }] }}>
            <Circle cx={32} cy={32} r={30} fill="none" stroke={c.border} strokeWidth={4} />
            <AnimatedCircle
              cx={32}
              cy={32}
              r={30}
              fill="none"
              stroke={c.success}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 30}
              animatedProps={ringProps}
            />
          </Svg>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.sans800, fontSize: 13, color: c.ink }}>{label}%</Text>
          </View>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>Everything checks out</Text>
          <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
            All four steps are complete — publish whenever you’re ready.
          </Text>
        </View>
      </View>

      <View style={{ gap: 9 }}>
        {checks.map((check, i) => (
          <SlideLeft
            key={check.text}
            delay={100 + i * 120} duration={420}  style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 16,
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${check.color}29`,
              }}
            >
              <Feather name={check.icon} size={16} color={check.color} />
            </View>
            <Text style={{ flex: 1, fontFamily: fonts.sans600, fontSize: 13.5, color: c.ink }}>{check.text}</Text>
            <Feather name="check-circle" size={18} color={c.success} />
          </SlideLeft>
        ))}
      </View>
    </Rise>
  );
}


/* ── resume review: mapping real parsed data onto the display list ──────── */

const EMPTY_PARSED: ParsedResumeData = { education: [], experience: [], projects: [], certificates: [], skills: [] };

/** Fixed order so a `sectionIndex` in a DraftEntry always means the same category. */
const CATEGORY_ORDER: { key: keyof ParsedResumeData; name: string; icon: ReviewSection["icon"] }[] = [
  { key: "education", name: "Education", icon: "book-open" },
  { key: "experience", name: "Experience", icon: "briefcase" },
  { key: "projects", name: "Projects", icon: "folder" },
  { key: "certificates", name: "Certificates", icon: "award" },
  { key: "skills", name: "Skills", icon: "zap" },
];

function toDisplay(key: keyof ParsedResumeData, item: Record<string, string | undefined>) {
  switch (key) {
    case "education":
      return { title: item.institution ?? "", detail: item.degree ?? "", date: yearRange(item) };
    case "experience":
      return { title: item.company ?? "", detail: item.role ?? "", date: yearRange(item) };
    case "projects":
      return { title: item.title ?? "", detail: item.description ?? "", date: item.tech ?? "" };
    case "certificates":
      return { title: item.title ?? "", detail: item.issuer ?? "", date: item.date ?? "" };
    case "skills":
    default:
      return { title: item.name ?? "", detail: "Skill", date: "" };
  }
}

function yearRange(item: { startYear?: string; endYear?: string }): string {
  return [item.startYear, item.endYear].filter(Boolean).join(" – ");
}

function fromDisplay(key: keyof ParsedResumeData, entry: DraftEntry): Record<string, string> {
  const [startYear, endYear] = entry.date.split(/[–-]/).map((s) => s.trim());
  switch (key) {
    case "education":
      return { institution: entry.title, degree: entry.detail, startYear: startYear ?? "", endYear: endYear ?? "" };
    case "experience":
      return { company: entry.title, role: entry.detail, startYear: startYear ?? "", endYear: endYear ?? "" };
    case "projects":
      return { title: entry.title, description: entry.detail, tech: entry.date };
    case "certificates":
      return { title: entry.title, issuer: entry.detail, date: entry.date };
    case "skills":
    default:
      return { name: entry.title, category: "technical" };
  }
}

function sectionsFromParsed(data: ParsedResumeData): ReviewSection[] {
  return CATEGORY_ORDER.map(({ key, name, icon }) => ({
    name,
    icon,
    entries: (data[key] as Record<string, string | undefined>[]).map((item) => toDisplay(key, item)),
  }));
}

function applyDraftToParsed(data: ParsedResumeData, entry: DraftEntry): ParsedResumeData {
  const category = CATEGORY_ORDER[entry.sectionIndex];
  if (!category) return data;
  const mapped = fromDisplay(category.key, entry);
  const list = [...(data[category.key] as Record<string, string>[])];
  if (entry.entryIndex === -1) list.push(mapped);
  else list[entry.entryIndex] = mapped;
  return { ...data, [category.key]: list } as ParsedResumeData;
}

function removeFromParsed(data: ParsedResumeData, entry: DraftEntry): ParsedResumeData {
  const category = CATEGORY_ORDER[entry.sectionIndex];
  if (!category) return data;
  const list = (data[category.key] as unknown[]).filter((_, i) => i !== entry.entryIndex);
  return { ...data, [category.key]: list } as ParsedResumeData;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.sans600, fontSize: 12.5, color: c.muted }}>{label}</Text>
      {children}
    </View>
  );
}

function SolidButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 50,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: disabled ? c.deep : c.cta,
      }}
    >
      <Feather name={icon} size={18} color={disabled ? c.faint : c.onCta} />
      <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: disabled ? c.faint : c.onCta }}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 50,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: c.panel,
        borderWidth: 1,
        borderColor: c.borderStrong,
      }}
    >
      <Feather name={icon} size={18} color={c.ink} />
      <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Google's own four-colour mark, drawn as SVG so it needs no image asset. */
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.3 0 6.3 1.14 8.6 3.38l6.4-6.4C34.9 2.5 29.8.5 24 .5 14.6.5 6.5 5.9 2.6 13.8l7.5 5.8C11.9 14 17.4 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.15-3.1-.4-4.5H24v9h12.7c-.55 3-2.2 5.5-4.6 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"
      />
      <Path
        fill="#FBBC05"
        d="M10.1 18.6C9.4 20.5 9 22.5 9 24.5s.4 4 1.1 5.9l-7.5 5.8C1 32.6.5 28.7.5 24.5s.5-8.1 2.1-11.7z"
      />
      <Path
        fill="#34A853"
        d="M24 46.5c5.8 0 10.9-1.9 14.5-5.2l-7.3-5.7c-2 1.4-4.6 2.2-7.2 2.2-6.6 0-12.1-4.5-14-10.6l-7.5 5.8C6.5 41.1 14.6 46.5 24 46.5z"
      />
    </Svg>
  );
}
