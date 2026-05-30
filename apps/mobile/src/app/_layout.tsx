import { Stack } from 'expo-router';

export default function RootLayout() {
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
