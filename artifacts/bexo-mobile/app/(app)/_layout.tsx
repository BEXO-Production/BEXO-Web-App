import { Redirect, Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { useAuth } from "@/lib/auth-context";

/**
 * Five tabs — Home, Network, Scan, Website, Profile — matching the app
 * shell's primary surfaces in the design canvas (atHome/atNetwork/atScan/
 * atWebsite/atProfile), rendered through a single floating pill nav bar
 * (FloatingTabBar) that's always the same dark style regardless of the
 * active screen — see NAV BAR in the .dc.html source (`showNav`), which
 * stays visible on every in-app tab, Scan included (Scan's own Scan/My QR
 * switcher is a separate control inside that screen, not a replacement for
 * this bar).
 *
 * Everything else the canvas treats as a route (Update, Edit, Inbox,
 * Analytics, Notifications, Search, Parse, Achievement, Settings detail,
 * the section editors) is a pushed screen here too — reachable via
 * router.push, kept out of the tab bar with href:null. `title` on each
 * still matters: FloatingTabBar reads it as the tab's label.
 */
export default function AppLayout() {
  const { status } = useAuth();

  if (status === "signedOut") {
    return <Redirect href="/(auth)/phone" />;
  }

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: "fade",
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="network" options={{ title: "Network" }} />
      <Tabs.Screen name="scan" options={{ title: "Scan" }} />
      <Tabs.Screen name="portfolio" options={{ title: "Website" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />

      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
      <Tabs.Screen name="update" options={{ href: null }} />
      <Tabs.Screen name="resume-parse" options={{ href: null }} />
      <Tabs.Screen name="achievement" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="settings-detail" options={{ href: null }} />
      <Tabs.Screen name="section/[type]" options={{ href: null }} />
      <Tabs.Screen name="section-skills" options={{ href: null }} />
      <Tabs.Screen name="section-contact" options={{ href: null }} />
      <Tabs.Screen name="section-about" options={{ href: null }} />
    </Tabs>
  );
}
