import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TOUR_STEPS } from "@/lib/design-data";

const STORAGE_KEY = "bexo.tour.v1";

/**
 * First-run coach tour state. It is only ever shown once — the "done" flag is
 * written the moment the user finishes or skips, so a relaunch lands straight
 * on Home.
 */
export function useTourState() {
  const [tourStep, setTourStep] = useState(0);
  const [tourDone, setTourDone] = useState(true);
  const [presetId, setPresetId] = useState("signature");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setTourDone(raw === "done"))
      .catch(() => setTourDone(false));
  }, []);

  const finish = useCallback(() => {
    setTourDone(true);
    AsyncStorage.setItem(STORAGE_KEY, "done").catch(() => {});
  }, []);

  const nextTour = useCallback(() => {
    setTourStep((step) => {
      if (step >= TOUR_STEPS.length) {
        finish();
        return step;
      }
      return step + 1;
    });
  }, [finish]);

  return {
    tourStep,
    tourDone,
    presetId,
    applyPreset: setPresetId,
    nextTour,
    skipTour: finish,
  };
}
