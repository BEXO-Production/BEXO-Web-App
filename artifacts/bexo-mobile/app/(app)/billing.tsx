import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Screen } from "@/components/Screen";
import { CircleIconButton, ProgressBar, SectionLabel } from "@/components/ui/Controls";
import { Rise } from "@/components/ui/Motion";
import {
  PaymentRecord,
  useBillingStatus,
  useCancelAddon,
  useCancelSubscription,
  useCreateAddonSubscription,
  useUpdateBillingProfile,
} from "@/lib/billing-api";
import { useOverlay } from "@/lib/overlay-context";
import { formatBytes } from "@/lib/format";
import { layout } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { fonts } from "@/lib/fonts";

const UPGRADE_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "₹199",
    period: "/month",
    description: "Great for freelancers & students starting out",
    storage: "100 MB",
    features: ["100 MB Cloud Storage", "5 Custom Project Showcases", "Search-Ready SEO", "Standard Analytics"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹499",
    period: "/month",
    popular: true,
    description: "Full professional presence with unlimited showcase",
    storage: "500 MB",
    features: [
      "500 MB Cloud Storage",
      "All Premium Templates (Nico Palmer, Cura Futuri, Sierra Montana)",
      "Instant AI Resume Parser",
      "Visitor Analytics & Real-time Inbox",
      "Live Network Mesh & Auto-Connect",
      "Custom Domain Support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "₹999",
    period: "/year",
    description: "For founders, architects & leaders seeking maximum reach",
    storage: "2 GB",
    features: [
      "2 GB Cloud Storage",
      "Complimentary BEXO Metal NFC Smart Card",
      "VIP Fast-Track Verification",
      "Everything in Pro with Priority Support",
    ],
  },
];

export default function BillingScreen() {
  const { c, shadow, dark } = useTheme();
  const { toast } = useOverlay();
  const params = useLocalSearchParams<{ section?: string }>();
  const { data: billing, isLoading, isRefetching, refetch } = useBillingStatus();

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [addonBlocks, setAddonBlocks] = useState(1);
  const [profileOpen, setProfileOpen] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateName, setStateName] = useState("");
  const [hasInitProfile, setHasInitProfile] = useState(false);

  const cancelSub = useCancelSubscription();
  const cancelAddon = useCancelAddon();
  const createAddon = useCreateAddonSubscription();
  const updateProfile = useUpdateBillingProfile();

  // Populate billing profile once data arrives
  if (billing?.billingProfile && !hasInitProfile) {
    setLegalName(billing.billingProfile.legalName ?? "");
    setGstin(billing.billingProfile.gstin ?? "");
    setStateName(billing.billingProfile.state ?? "");
    setHasInitProfile(true);
  }

  const usedBytes = Number(billing?.storageUsedBytes ?? 0);
  const quotaBytes = Number(billing?.storageQuotaBytes ?? billing?.effectiveQuotaBytes ?? 52428800); // 50MB default
  const storagePct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
  const isNearLimit = storagePct >= 80;

  const currentAddonBlocks = billing?.addonBlocks ?? billing?.addon?.blocks ?? 0;
  const addonCostPaise = 4900; // ₹49/month per 50MB block
  const addonCostInr = (addonBlocks * addonCostPaise) / 100;

  const handleBuyAddon = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createAddon.mutate(
      { blocks: addonBlocks },
      {
        onSuccess: () => {
          toast(`Added ${addonBlocks * 50} MB storage successfully!`);
          refetch();
        },
        onError: (err: any) => {
          toast(err?.message || "Could not activate storage add-on");
        },
      }
    );
  };

  const handleCancelSub = () => {
    Alert.alert(
      "Cancel Subscription?",
      "Your plan will remain active until the end of your current billing period. No further charges will occur.",
      [
        { text: "Keep Plan", style: "cancel" },
        {
          text: "Confirm Cancellation",
          style: "destructive",
          onPress: () => {
            cancelSub.mutate(undefined, {
              onSuccess: () => {
                toast("Subscription will cancel at period end");
                refetch();
              },
              onError: (err: any) => toast(err?.message || "Could not cancel subscription"),
            });
          },
        },
      ]
    );
  };

  const handleCancelAddon = () => {
    Alert.alert(
      "Cancel Storage Add-on?",
      "Your extra storage will remain available until the end of the monthly billing cycle.",
      [
        { text: "Keep Add-on", style: "cancel" },
        {
          text: "Cancel Add-on",
          style: "destructive",
          onPress: () => {
            cancelAddon.mutate(undefined, {
              onSuccess: () => {
                toast("Storage add-on canceled");
                refetch();
              },
              onError: (err: any) => toast(err?.message || "Could not cancel add-on"),
            });
          },
        },
      ]
    );
  };

  const handleSaveProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateProfile.mutate(
      { legalName, gstin, state: stateName },
      {
        onSuccess: () => {
          toast("Billing tax details saved");
          setProfileOpen(false);
        },
        onError: (err: any) => toast(err?.message || "Failed to save details"),
      }
    );
  };

  const openInvoice = (url: string | null) => {
    if (!url) {
      toast("Invoice is still generating");
      return;
    }
    Haptics.selectionAsync();
    Linking.openURL(url).catch(() => {
      toast("Could not open invoice PDF");
    });
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.screenX,
          paddingTop: 12,
          paddingBottom: layout.navBarSpace + 40,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <CircleIconButton icon="arrow-left" accessibilityLabel="Back" onPress={() => router.back()} />
            <Text style={{ fontFamily: fonts.serif600, fontSize: 24, letterSpacing: -0.4, color: c.ink }}>
              Billing &amp; Add-ons
            </Text>
          </View>
          <Pressable
            onPress={() => refetch()}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.panel,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color={c.accentSoft} />
            ) : (
              <Feather name="refresh-cw" size={14} color={c.muted} />
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator size="large" color={c.accentSoft} />
          </View>
        ) : (
          <>
            {/* ── 1. SUBSCRIPTION & PLAN CARD ─────────────────────────────── */}
            <Rise duration={380} style={{ gap: 10 }}>
              <SectionLabel>Your Subscription</SectionLabel>
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 22,
                  gap: 16,
                  ...shadow.card,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 22, color: c.ink }}>
                      {billing?.plan ? billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1) : "Free"} Plan
                    </Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 13, color: c.muted }}>
                      {billing?.isPremium
                        ? billing.cancelAtPeriodEnd
                          ? "Cancels at period end"
                          : billing.autopay
                            ? "Auto-renew active"
                            : "Manual renewal"
                        : "Basic presence · Free forever"}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: billing?.isPremium ? c.accentWash : "rgba(150,150,150,0.12)",
                      borderWidth: 1,
                      borderColor: billing?.isPremium ? c.accentEdge : c.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.sans600,
                        fontSize: 12,
                        color: billing?.isPremium ? c.accentSoft : c.muted,
                      }}
                    >
                      {billing?.isPremium ? "ACTIVE" : "FREE"}
                    </Text>
                  </View>
                </View>

                {/* Renewal or Expiry Dates */}
                {billing?.expiresAt ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: 14,
                      borderTopWidth: 1,
                      borderTopColor: c.border,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sans500, fontSize: 13, color: c.muted }}>
                      {billing.cancelAtPeriodEnd ? "Access Ends" : "Next Renewal"}
                    </Text>
                    <Text style={{ fontFamily: fonts.mono500, fontSize: 13, color: c.ink }}>
                      {new Date(billing.expiresAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                ) : null}

                {/* Plan Action Buttons */}
                <View style={{ flexDirection: "row", gap: 10, paddingTop: 4 }}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setUpgradeModalOpen(true);
                    }}
                    style={{
                      flex: 1,
                      minHeight: 46,
                      borderRadius: 999,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      backgroundColor: c.cta,
                    }}
                  >
                    <Feather name="zap" size={15} color={c.onCta} />
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 13.5, color: c.onCta }}>
                      {billing?.isPremium ? "Change Plan" : "Upgrade to Pro"}
                    </Text>
                  </Pressable>

                  {billing?.isPremium && !billing.cancelAtPeriodEnd ? (
                    <Pressable
                      onPress={handleCancelSub}
                      disabled={cancelSub.isPending}
                      style={{
                        paddingHorizontal: 16,
                        minHeight: 46,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: c.panel,
                        borderWidth: 1,
                        borderColor: c.border,
                      }}
                    >
                      {cancelSub.isPending ? (
                        <ActivityIndicator size="small" color={c.muted} />
                      ) : (
                        <Text style={{ fontFamily: fonts.sans600, fontSize: 13, color: c.muted }}>
                          Cancel
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Rise>

            {/* ── 2. CLOUD STORAGE & ADD-ONS ──────────────────────────────── */}
            <Rise delay={100} style={{ gap: 10 }}>
              <SectionLabel>Cloud Storage &amp; Add-ons</SectionLabel>
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: isNearLimit ? "#F59E0B" : c.border,
                  padding: 22,
                  gap: 16,
                  ...shadow.card,
                }}
              >
                {/* Storage Header */}
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontFamily: fonts.serif600, fontSize: 26, color: c.ink }}>
                      {formatBytes(usedBytes)}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
                      of {formatBytes(quotaBytes)} capacity ({storagePct.toFixed(0)}% used)
                    </Text>
                  </View>

                  {currentAddonBlocks > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        backgroundColor: "rgba(59,130,246,0.14)",
                      }}
                    >
                      <Feather name="plus-circle" size={11} color="#3B82F6" />
                      <Text style={{ fontFamily: fonts.mono500, fontSize: 11, color: "#3B82F6" }}>
                        +{currentAddonBlocks * 50} MB Add-on
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Visual Storage Bar */}
                <ProgressBar pct={storagePct} />

                {/* 80%+ Storage Limit Urgent Hint */}
                {isNearLimit ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: "rgba(245,158,11,0.12)",
                      borderWidth: 1,
                      borderColor: "rgba(245,158,11,0.3)",
                    }}
                  >
                    <Feather name="alert-triangle" size={15} color="#F59E0B" />
                    <Text style={{ flex: 1, fontFamily: fonts.sans500, fontSize: 11.5, color: "#D97706" }}>
                      Storage limit nearing full. Add blocks below to prevent upload interruptions.
                    </Text>
                  </View>
                ) : null}

                {/* Add-on Stepper & Purchase Box */}
                <View
                  style={{
                    borderRadius: 18,
                    backgroundColor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                    borderWidth: 1,
                    borderColor: c.border,
                    padding: 16,
                    gap: 14,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontFamily: fonts.sans700, fontSize: 14.5, color: c.ink }}>
                        Add Storage Blocks
                      </Text>
                      <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
                        +50 MB per block · ₹49/month
                      </Text>
                    </View>

                    {/* Stepper Controls */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setAddonBlocks((b) => Math.max(1, b - 1));
                        }}
                        disabled={addonBlocks <= 1}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: c.panel,
                          borderWidth: 1,
                          borderColor: c.border,
                          opacity: addonBlocks <= 1 ? 0.4 : 1,
                        }}
                      >
                        <Feather name="minus" size={14} color={c.ink} />
                      </Pressable>

                      <Text style={{ fontFamily: fonts.mono700, fontSize: 15, color: c.ink, minWidth: 20, textAlign: "center" }}>
                        {addonBlocks}
                      </Text>

                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setAddonBlocks((b) => Math.min(20, b + 1));
                        }}
                        disabled={addonBlocks >= 20}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: c.panel,
                          borderWidth: 1,
                          borderColor: c.border,
                          opacity: addonBlocks >= 20 ? 0.4 : 1,
                        }}
                      >
                        <Feather name="plus" size={14} color={c.ink} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Add Button with Total calculation */}
                  <Pressable
                    onPress={handleBuyAddon}
                    disabled={createAddon.isPending}
                    style={{
                      height: 44,
                      borderRadius: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      backgroundColor: c.accent,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="hard-drive" size={14} color="#fff" />
                      <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: "#fff" }}>
                        Buy +{addonBlocks * 50} MB Storage
                      </Text>
                    </View>
                    {createAddon.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ fontFamily: fonts.mono700, fontSize: 13, color: "#fff" }}>
                        ₹{addonCostInr}/mo
                      </Text>
                    )}
                  </Pressable>
                </View>

                {/* Cancel existing addon row if any */}
                {currentAddonBlocks > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
                      Active Add-on: {currentAddonBlocks} block(s)
                    </Text>
                    <Pressable onPress={handleCancelAddon} disabled={cancelAddon.isPending}>
                      <Text style={{ fontFamily: fonts.sans600, fontSize: 12, color: "#EF4444" }}>
                        Cancel Add-on
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </Rise>

            {/* ── 3. BILLING HISTORY & INVOICES ───────────────────────────── */}
            <Rise delay={160} style={{ gap: 10 }}>
              <SectionLabel>Billing History &amp; Invoices</SectionLabel>
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 20,
                  gap: 12,
                  ...shadow.card,
                }}
              >
                {billing?.payments && billing.payments.length > 0 ? (
                  <View style={{ gap: 12 }}>
                    {billing.payments.map((payment, idx) => {
                      const dateStr = new Date(payment.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });
                      const amountInr = (payment.amount / 100).toLocaleString("en-IN");
                      const planTitle =
                        payment.plan === "storage_addon"
                          ? "Storage Add-on (+50MB)"
                          : `BEXO ${payment.plan ? payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1) : "Pro"} Plan`;

                      return (
                        <View
                          key={payment.id || idx}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingBottom: 12,
                            borderBottomWidth: idx < billing.payments.length - 1 ? 1 : 0,
                            borderBottomColor: c.border,
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text numberOfLines={1} style={{ fontFamily: fonts.sans600, fontSize: 14, color: c.ink }}>
                              {planTitle}
                            </Text>
                            <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.muted }}>
                              Paid on {dateStr}
                            </Text>
                          </View>

                          <View style={{ alignItems: "flex-end", gap: 6 }}>
                            <Text style={{ fontFamily: fonts.mono700, fontSize: 14, color: c.ink }}>
                              ₹{amountInr}
                            </Text>

                            {/* Download PDF Invoice Button */}
                            <Pressable
                              onPress={() => openInvoice(payment.invoiceUrl)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                paddingVertical: 4,
                                paddingHorizontal: 9,
                                borderRadius: 6,
                                backgroundColor: payment.invoiceUrl ? c.accentWash : c.deep,
                                borderWidth: 0.8,
                                borderColor: payment.invoiceUrl ? c.accentEdge : c.border,
                              }}
                            >
                              <Feather
                                name="file-text"
                                size={11}
                                color={payment.invoiceUrl ? c.accentSoft : c.muted}
                              />
                              <Text
                                style={{
                                  fontFamily: fonts.sans600,
                                  fontSize: 11,
                                  color: payment.invoiceUrl ? c.accentSoft : c.muted,
                                }}
                              >
                                {payment.invoiceUrl ? "Invoice" : "Processing"}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
                    <Feather name="credit-card" size={28} color={c.faint} />
                    <Text style={{ fontFamily: fonts.sans500, fontSize: 13.5, color: c.muted }}>
                      No payment receipts yet
                    </Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 11.5, color: c.faint, textAlign: "center" }}>
                      Receipts and downloadable tax invoices will appear here after your first transaction.
                    </Text>
                  </View>
                )}
              </View>
            </Rise>

            {/* ── 4. BILLING PROFILE & GST DETAILS (Collapsible) ─────────── */}
            <Rise delay={220} style={{ gap: 10 }}>
              <View
                style={{
                  borderRadius: 24,
                  backgroundColor: c.panel,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 20,
                  gap: 14,
                  ...shadow.card,
                }}
              >
                <Pressable
                  onPress={() => setProfileOpen((o) => !o)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 15, color: c.ink }}>
                      Tax &amp; Invoicing Details
                    </Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>
                      {legalName || gstin ? `${legalName || "Added"} · ${gstin || "No GSTIN"}` : "Add company name & GSTIN for tax invoices"}
                    </Text>
                  </View>
                  <Feather name={profileOpen ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
                </Pressable>

                {profileOpen ? (
                  <View style={{ gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border }}>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontFamily: fonts.sans500, fontSize: 12, color: c.muted }}>
                        Legal Business / Full Name
                      </Text>
                      <TextInput
                        value={legalName}
                        onChangeText={setLegalName}
                        placeholder="e.g. Acme Studio / Kavin Balaji"
                        placeholderTextColor={c.faint}
                        style={{
                          height: 42,
                          borderRadius: 10,
                          backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                          borderWidth: 1,
                          borderColor: c.border,
                          paddingHorizontal: 12,
                          fontFamily: fonts.sans500,
                          fontSize: 13,
                          color: c.ink,
                        }}
                      />
                    </View>

                    <View style={{ gap: 4 }}>
                      <Text style={{ fontFamily: fonts.sans500, fontSize: 12, color: c.muted }}>
                        GSTIN (Optional for tax credit)
                      </Text>
                      <TextInput
                        value={gstin}
                        onChangeText={setGstin}
                        placeholder="e.g. 33AAAAA0000A1Z5"
                        placeholderTextColor={c.faint}
                        autoCapitalize="characters"
                        style={{
                          height: 42,
                          borderRadius: 10,
                          backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                          borderWidth: 1,
                          borderColor: c.border,
                          paddingHorizontal: 12,
                          fontFamily: fonts.mono500,
                          fontSize: 13,
                          color: c.ink,
                        }}
                      />
                    </View>

                    <View style={{ gap: 4 }}>
                      <Text style={{ fontFamily: fonts.sans500, fontSize: 12, color: c.muted }}>
                        State / Province
                      </Text>
                      <TextInput
                        value={stateName}
                        onChangeText={setStateName}
                        placeholder="e.g. Tamil Nadu"
                        placeholderTextColor={c.faint}
                        style={{
                          height: 42,
                          borderRadius: 10,
                          backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                          borderWidth: 1,
                          borderColor: c.border,
                          paddingHorizontal: 12,
                          fontFamily: fonts.sans500,
                          fontSize: 13,
                          color: c.ink,
                        }}
                      />
                    </View>

                    <Pressable
                      onPress={handleSaveProfile}
                      disabled={updateProfile.isPending}
                      style={{
                        height: 42,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: c.cta,
                        marginTop: 4,
                      }}
                    >
                      {updateProfile.isPending ? (
                        <ActivityIndicator size="small" color={c.onCta} />
                      ) : (
                        <Text style={{ fontFamily: fonts.sans700, fontSize: 13, color: c.onCta }}>
                          Save Invoice Details
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </Rise>
          </>
        )}
      </ScrollView>

      {/* ── UPGRADE PLAN MODAL / SHEET ─────────────────────────────────────── */}
      <Modal
        visible={upgradeModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setUpgradeModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: c.paper }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <Text style={{ fontFamily: fonts.serif600, fontSize: 20, color: c.ink }}>
              Upgrade Your BEXO
            </Text>
            <CircleIconButton icon="x" accessibilityLabel="Close" onPress={() => setUpgradeModalOpen(false)} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {UPGRADE_PLANS.map((plan) => (
              <View
                key={plan.id}
                style={{
                  borderRadius: 20,
                  backgroundColor: c.panel,
                  borderWidth: plan.popular ? 2 : 1,
                  borderColor: plan.popular ? c.accent : c.border,
                  padding: 20,
                  gap: 14,
                  ...shadow.card,
                }}
              >
                {plan.popular ? (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingVertical: 3,
                      paddingHorizontal: 9,
                      borderRadius: 999,
                      backgroundColor: c.accent,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 10, color: "#fff", letterSpacing: 0.5 }}>
                      MOST POPULAR
                    </Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontFamily: fonts.sans700, fontSize: 18, color: c.ink }}>{plan.name}</Text>
                    <Text style={{ fontFamily: fonts.sans400, fontSize: 12, color: c.muted }}>{plan.description}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text style={{ fontFamily: fonts.mono700, fontSize: 22, color: c.ink }}>{plan.price}</Text>
                    <Text style={{ fontFamily: fonts.sans500, fontSize: 12, color: c.muted }}>{plan.period}</Text>
                  </View>
                </View>

                {/* Features List */}
                <View style={{ gap: 8, paddingTop: 4 }}>
                  {plan.features.map((feat, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather name="check" size={13} color={c.accentSoft} />
                      <Text style={{ fontFamily: fonts.sans500, fontSize: 12.5, color: c.ink }}>{feat}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setUpgradeModalOpen(false);
                    toast(`Selected ${plan.name} Plan`);
                  }}
                  style={{
                    height: 46,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: plan.popular ? c.cta : c.deep,
                    marginTop: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sans700,
                      fontSize: 13.5,
                      color: plan.popular ? c.onCta : c.ink,
                    }}
                  >
                    Choose {plan.name}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}
