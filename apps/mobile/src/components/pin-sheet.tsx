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
import type { Pin } from '@/lib/storage';

const C = {
  sheet: '#1c1c1e',
  field: '#2c2c2e',
  text: '#FFFFFF',
  secondary: '#8E8E93',
  tertiary: '#636366',
  accent: '#0A84FF',
  destructive: '#FF453A',
  handle: '#3a3a3c',
};

export function PinSheet({
  pin,
  onClose,
  onSave,
  onDelete,
}: {
  pin: Pin | null;
  onClose: () => void;
  onSave: (next: Pin) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (pin) setName(pin.name);
  }, [pin]);

  function save() {
    if (!pin) return;
    onSave({ ...pin, name: name.trim() || pin.name });
    onClose();
  }

  return (
    <Modal visible={pin !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* eslint-disable-next-line @typescript-eslint/no-empty-function */}
        <Pressable onPress={() => {}}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.handle} />

              <View style={styles.titleRow}>
                <SymbolView
                  name="mappin.circle.fill"
                  size={24}
                  tintColor={C.destructive}
                  resizeMode="scaleAspectFit"
                />
                <Text style={styles.title}>Edit pin</Text>
              </View>

              {pin && (
                <View style={styles.coordsPill}>
                  <SymbolView
                    name="location.fill"
                    size={11}
                    tintColor={C.secondary}
                    weight="semibold"
                    resizeMode="scaleAspectFit"
                  />
                  <Text style={styles.coords}>
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </Text>
                </View>
              )}

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Pin name"
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
                    styles.danger,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => {
                    if (pin) {
                      onDelete(pin.id);
                      onClose();
                    }
                  }}
                >
                  <SymbolView
                    name="trash"
                    size={16}
                    tintColor="#fff"
                    weight="semibold"
                    resizeMode="scaleAspectFit"
                  />
                  <Text style={styles.buttonText}>Delete</Text>
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
  coordsPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.field,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  coords: { color: C.secondary, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : undefined },
  input: {
    backgroundColor: C.field,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: C.text,
    fontSize: 17,
    marginTop: 2,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primary: { backgroundColor: C.accent },
  danger: { backgroundColor: C.destructive },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
