import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { importVibemap } from '@/lib/offline';

export default function RootLayout() {
  const router = useRouter();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    async function handle(url: string | null) {
      if (!url) return;
      if (handled.current.has(url)) return;
      handled.current.add(url);
      // Only act on file imports — leave deep-link share URLs alone.
      if (!url.startsWith('file://') && !url.endsWith('.vibemap')) return;
      try {
        const token = await importVibemap(url);
        router.push(`/s/${token}`);
      } catch (e) {
        Alert.alert(
          "Couldn't import map",
          e instanceof Error ? e.message : 'The file may be damaged or not a valid .vibemap.',
        );
      }
    }

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (event) => handle(event.url));
    return () => sub.remove();
  }, [router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Maps',
          headerLargeTitle: true,
          headerLargeTitleStyle: { color: '#fff', fontWeight: '700' },
          headerLargeTitleShadowVisible: false,
          headerTransparent: false,
        }}
      />
      <Stack.Screen name="s/[token]" options={{ title: 'Map' }} />
    </Stack>
  );
}
