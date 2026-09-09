import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Token storage.
 *
 * Native: expo-secure-store — Keychain (iOS) / Keystore (Android), so the JWT
 * survives app restarts without sitting in plaintext app storage.
 *
 * Web: SecureStore has no web implementation and throws, so this falls back to
 * AsyncStorage (localStorage under the hood) — the same place bexo-web already
 * keeps its token, so it is no weaker than the existing web client.
 */
const ACCESS_TOKEN_KEY = "bexo.accessToken";
const isWeb = Platform.OS === "web";

export async function getAccessToken(): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearAccessToken(): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}
