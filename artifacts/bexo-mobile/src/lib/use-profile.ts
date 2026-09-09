import { useQuery } from "@tanstack/react-query";
import { fetchProfile } from "./auth-api";
import { useAuth } from "./auth-context";

export function useProfile() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    enabled: status === "signedIn",
  });
}
