import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { extractToken } from '@/lib/config';
import { getRecents, removeRecent, type RecentMap } from '@/lib/storage';

const C = {
  bg: '#0a0a0a',
  card: '#1c1c1e',
  cardPressed: '#2c2c2e',
  border: 'rgba(255,255,255,0.06)',
  accent: '#0A84FF',
  accentDim: '#0A84FF55',
  text: '#FFFFFF',
  secondary: '#8E8E93',
  tertiary: '#636366',
  fieldBg: '#1c1c1e',
};

function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [recents, setRecents] = useState<RecentMap[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getRecents().then((list) => active && setRecents(list));
      return () => {
        active = false;
      };
    }, []),
  );

  function open(token: string) {
    if (token) router.push(`/s/${token}`);
  }

  function openFromInput() {
    const token = extractToken(input);
    if (token) {
      setInput('');
      open(token);
    }
  }

  function confirmRemove(entry: RecentMap) {
    Alert.alert('Remove map?', `"${entry.name}" will be removed from this list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeRecent(entry.token);
          setRecents((r) => (r ?? []).filter((x) => x.token !== entry.token));
        },
      },
    ]);
  }

  const inputValid = input.trim().length > 0;

  const Header = (
    <View style={styles.header}>
      <Text style={styles.subtitle}>
        Paste a share link to open a map. Maps you've opened appear below.
      </Text>

      <View style={styles.inputRow}>
        <SymbolView
          name="link"
          size={18}
          tintColor={C.secondary}
          resizeMode="scaleAspectFit"
          style={styles.inputIcon}
        />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="https://…/s/abc123  or  abc123"
          placeholderTextColor={C.tertiary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={openFromInput}
          returnKeyType="go"
        />
        <Pressable
          onPress={openFromInput}
          disabled={!inputValid}
          hitSlop={8}
          style={({ pressed }) => [
            styles.openBtn,
            { backgroundColor: inputValid ? C.accent : C.fieldBg },
            pressed && inputValid && { opacity: 0.85 },
          ]}
        >
          <SymbolView
            name="arrow.right"
            size={16}
            tintColor={inputValid ? '#fff' : C.tertiary}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Recent</Text>
    </View>
  );

  const Empty = (
    <View style={styles.empty}>
      <SymbolView
        name="map"
        size={44}
        tintColor={C.tertiary}
        resizeMode="scaleAspectFit"
      />
      <Text style={styles.emptyText}>No maps yet</Text>
      <Text style={styles.emptySub}>Paste a share link above to open one.</Text>
    </View>
  );

  if (recents === null) {
    return (
      <View style={styles.screen}>
        {Header}
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      data={recents}
      keyExtractor={(r) => r.token}
      ListHeaderComponent={Header}
      ListEmptyComponent={Empty}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => open(item.token)}
          onLongPress={() => confirmRemove(item)}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        >
          <View style={styles.tileIconWrap}>
            <SymbolView
              name="map.fill"
              size={22}
              tintColor={C.accent}
              resizeMode="scaleAspectFit"
            />
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.tileMeta} numberOfLines={1}>
              Opened {timeAgo(item.openedAt)}
            </Text>
          </View>
          <SymbolView
            name="chevron.right"
            size={14}
            tintColor={C.tertiary}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingHorizontal: 20, paddingBottom: 48 },
  header: { gap: 18, paddingTop: 8 },
  subtitle: { color: C.secondary, fontSize: 15, lineHeight: 20 },
  muted: { color: C.tertiary, fontSize: 14, marginTop: 12 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.fieldBg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  inputIcon: { width: 18, height: 18 },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  openBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionLabel: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },

  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 14,
  },
  tilePressed: { backgroundColor: C.cardPressed },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { flex: 1, gap: 2 },
  tileName: { color: C.text, fontSize: 17, fontWeight: '600' },
  tileMeta: { color: C.secondary, fontSize: 13 },

  separator: { height: 10 },

  empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  emptyText: { color: C.text, fontSize: 17, fontWeight: '600' },
  emptySub: { color: C.secondary, fontSize: 14 },
});
