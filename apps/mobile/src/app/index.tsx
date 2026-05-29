import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { extractToken } from '@/lib/config';

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState('');

  function open() {
    const token = extractToken(input);
    if (token) router.push(`/s/${token}`);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Open a shared map</Text>
      <Text style={styles.subtitle}>
        Paste a Vibe Mapping share link or token to open it as a live, interactive map.
      </Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="https://…/s/abc123  or  abc123"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        onSubmitEditing={open}
      />
      <Pressable
        style={[styles.button, !input.trim() && styles.buttonDisabled]}
        onPress={open}
        disabled={!input.trim()}
      >
        <Text style={styles.buttonText}>Open map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 24, justifyContent: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#404040',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
