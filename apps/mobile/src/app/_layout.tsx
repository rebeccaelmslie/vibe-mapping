import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#0a0a0a' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="index" options={{ title: 'Vibe Mapping' }} />
      <Stack.Screen name="s/[token]" options={{ title: 'Map' }} />
    </Stack>
  );
}
