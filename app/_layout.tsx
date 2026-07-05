import "../global.css";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(onboarding)/welcome" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="entry/new" options={{ presentation: "modal" }} />
          <Stack.Screen name="entry/off-day" options={{ presentation: "modal" }} />
          <Stack.Screen name="entry/[id]" />
          <Stack.Screen name="compare/pick" options={{ presentation: "modal" }} />
          <Stack.Screen name="compare" options={{ presentation: "modal" }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
