import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { runOnJS } from "react-native-reanimated";

/**
 * BEXO's feel engine — one vocabulary for every touch in the app.
 *
 * Two things it gives us that scattered `Haptics.impactAsync` calls did not:
 *
 * 1. **Semantics over styles.** A screen asks for `feel.commit()`, not
 *    "medium impact". When the taxonomy is tuned, every screen moves with it.
 * 2. **Patterns.** iOS only exposes single taps, so anything richer has to be
 *    played as a timed sequence. `publish`, `reveal`, `celebrate` and friends
 *    below are scored as steps — a rising ramp reads as *opening*, a double
 *    rigid tick reads as *snapped into place*.
 *
 * Everything is fire-and-forget and failure-tolerant: haptics are a garnish,
 * never a dependency, so a rejected promise is swallowed rather than surfaced.
 */

const STORAGE_KEY = "bexo.haptics.v1";

/** Sequences cancel each other — only the newest score plays. */
let sequenceToken = 0;
let pending: ReturnType<typeof setTimeout>[] = [];
let enabled = true;
/** Guards the rate-limited `tick`, which scroll and drag handlers call freely. */
let lastTickAt = 0;

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (raw === "off") enabled = false;
  })
  .catch(() => {});

export function setHapticsEnabled(next: boolean) {
  enabled = next;
  if (!next) cancel();
  AsyncStorage.setItem(STORAGE_KEY, next ? "on" : "off").catch(() => {});
}

export function hapticsEnabled() {
  return enabled;
}

/** Stop any pattern still playing — used when a gesture is interrupted. */
export function cancel() {
  sequenceToken += 1;
  pending.forEach(clearTimeout);
  pending = [];
}

const Impact = Haptics.ImpactFeedbackStyle;
const Notify = Haptics.NotificationFeedbackType;

type Beat =
  | { kind: "impact"; style: Haptics.ImpactFeedbackStyle }
  | { kind: "notify"; type: Haptics.NotificationFeedbackType }
  | { kind: "selection" };

/** A scored pattern: each beat plays `at` milliseconds after the downbeat. */
type Score = { at: number; beat: Beat }[];

function playBeat(beat: Beat) {
  if (!enabled) return;
  if (beat.kind === "impact") Haptics.impactAsync(beat.style).catch(() => {});
  else if (beat.kind === "notify") Haptics.notificationAsync(beat.type).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
}

function play(score: Score) {
  if (!enabled) return;
  cancel();
  const token = sequenceToken;
  for (const { at, beat } of score) {
    if (at === 0) {
      playBeat(beat);
      continue;
    }
    pending.push(
      setTimeout(() => {
        if (token !== sequenceToken) return;
        playBeat(beat);
      }, at),
    );
  }
}

const impact = (style: Haptics.ImpactFeedbackStyle): Beat => ({ kind: "impact", style });
const notify = (type: Haptics.NotificationFeedbackType): Beat => ({ kind: "notify", type });

/**
 * The scored patterns. Timings are deliberately uneven — evenly spaced beats
 * read as a machine buzzing, a decelerating or accelerating gap reads as a
 * gesture with intent behind it.
 */
const SCORES = {
  /** Sending something live: a wind-up, a throw, then the landing. */
  publish: [
    { at: 0, beat: impact(Impact.Light) },
    { at: 80, beat: impact(Impact.Medium) },
    { at: 190, beat: notify(Notify.Success) },
  ],
  /** Something opening out — a ramp that gains weight as it expands. */
  reveal: [
    { at: 0, beat: impact(Impact.Soft) },
    { at: 55, beat: impact(Impact.Light) },
    { at: 115, beat: impact(Impact.Medium) },
  ],
  /** The mirror of `reveal`: weight draining away as a panel folds shut. */
  dismiss: [
    { at: 0, beat: impact(Impact.Medium) },
    { at: 60, beat: impact(Impact.Soft) },
  ],
  /** Two crisp ticks — a control locking into a detent. */
  snap: [
    { at: 0, beat: impact(Impact.Rigid) },
    { at: 55, beat: impact(Impact.Rigid) },
  ],
  /** A choice landing: the hit, then a soft echo of the surface settling. */
  pop: [
    { at: 0, beat: impact(Impact.Medium) },
    { at: 45, beat: impact(Impact.Soft) },
  ],
  /** Reserved for genuine milestones — first publish, onboarding complete. */
  celebrate: [
    { at: 0, beat: notify(Notify.Success) },
    { at: 130, beat: impact(Impact.Light) },
    { at: 200, beat: impact(Impact.Light) },
    { at: 250, beat: impact(Impact.Soft) },
  ],
} satisfies Record<string, Score>;

export type FeelPattern = keyof typeof SCORES;

/**
 * The verbs. Screens should reach for these rather than raw impact styles —
 * the whole app then shares one physical vocabulary.
 */
export const feel = {
  /** A plain button press. The most common call in the app. */
  tap: () => playBeat(impact(Impact.Light)),
  /** Picking one option out of several. */
  select: () => playBeat({ kind: "selection" }),
  /** A weightier press: a primary action, a destructive confirm. */
  commit: () => playBeat(impact(Impact.Medium)),
  /** A switch moving — rigid going on, soft going off. */
  toggle: (on: boolean) => playBeat(impact(on ? Impact.Rigid : Impact.Soft)),
  /** Something detaching from the surface: a sheet opening, a card lifting. */
  lift: () => playBeat(impact(Impact.Soft)),
  /** Something settling back down. */
  drop: () => playBeat(impact(Impact.Light)),

  /**
   * A boundary crossed mid-gesture — a section scrolling into place, a
   * carousel page turning. Rate-limited so continuous gestures stay pleasant
   * rather than turning into a rattle.
   */
  tick: (minGapMs = 90) => {
    const now = Date.now();
    if (now - lastTickAt < minGapMs) return;
    lastTickAt = now;
    playBeat({ kind: "selection" });
  },

  success: () => playBeat(notify(Notify.Success)),
  warn: () => playBeat(notify(Notify.Warning)),
  error: () => playBeat(notify(Notify.Error)),

  /** Play one of the scored patterns above. */
  pattern: (name: FeelPattern) => play(SCORES[name]),

  publish: () => play(SCORES.publish),
  reveal: () => play(SCORES.reveal),
  dismiss: () => play(SCORES.dismiss),
  snap: () => play(SCORES.snap),
  pop: () => play(SCORES.pop),
  celebrate: () => play(SCORES.celebrate),
};

/**
 * Fire a feel from a worklet — scroll handlers and gesture callbacks run on the
 * UI thread and cannot touch the haptics module directly.
 */
export function feelOnUI(verb: "tap" | "select" | "tick" | "pop" | "snap" | "lift") {
  "worklet";
  runOnJS(dispatch)(verb);
}

function dispatch(verb: "tap" | "select" | "tick" | "pop" | "snap" | "lift") {
  feel[verb]();
}
