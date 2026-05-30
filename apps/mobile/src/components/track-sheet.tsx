import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatDistance, formatDuration } from '@vibe/shared';

const C = {
  sheet: '#1c1c1e',
  field: '#2c2c2e',
  text: '#FFFFFF',
  secondary: '#8E8E93',
  tertiary: '#636366',
  accent: '#0A84FF',
  orange: '#FF9F0A',
  destructive: '#FF453A',
  handle: '#3a3a3c',
};

export function TrackSheet({
  open,
  defaultLabel,
  distanceM,
  durationSec,
  pointCount,
  onClose,
  onSave,
}: {
  open: boolean;
  defaultLabel: string;
  distanceM: number;
  durationSec: number;
  pointCount: number;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) setLabel(defaultLabel);
  }, [open, defaultLabel]);

  function save() {
    onSave(label.trim() || defaultLabel);
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* eslint-disable-next-line @typescript-eslint/no-empty-function */}
        <Pressable onPress={() => {}}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.handle} />

              <View style={styles.titleRow}>
                <SymbolView
                  name="figure.walk"
                  size={22}
                  tintColor={C.orange}
                  resizeMode="scaleAspectFit"
                />
                <Text style={styles.title}>Track</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatDistance(distanceM)}</Text>
                  <Text style={styles.statLabel}>distance</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatDuration(durationSec)}</Text>
                  <Text style={styles.statLabel}>duration</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{pointCount}</Text>
                  <Text style={styles.statLabel}>points</Text>
                </View>
              </View>

              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder={defaultLabel}
                placeholderTextColor={C.tertiary}
                style={styles.input}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={save}
              />

              <View style={styles.row}>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.discard,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={onClose}
                >
                  <Text style={styles.buttonText}>Discard</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.primary,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={save}
                >
                  <Text style={styles.buttonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.sheet,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    gap: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    backgroundColor: C.handle,
    borderRadius: 3,
    marginBottom: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.text, fontSize: 20, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.field,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: C.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: C.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: C.field,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: C.text,
    fontSize: 17,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primary: { backgroundColor: C.accent },
  discard: { backgroundColor: C.field },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
