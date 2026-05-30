import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import * as Location from 'expo-location';
import {
  Map as MapView,
  Camera,
  UserLocation,
  Marker,
  type CameraRef,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import { SymbolView } from 'expo-symbols';
import { mapSpecToStyle } from '@vibe/map-renderer';
import type { MapSpec } from '@vibe/shared';
import { API_BASE, MAPTILER_KEY } from '@/lib/config';
import {
  getAnnotations,
  saveAnnotations,
  saveRecent,
  newId,
  type Pin,
} from '@/lib/storage';
import { PinSheet } from '@/components/pin-sheet';

const C = {
  accent: '#0A84FF',
  red: '#FF453A',
  text: '#FFFFFF',
  secondary: '#8E8E93',
  buttonBg: 'rgba(28,28,30,0.92)',
  buttonBorder: 'rgba(255,255,255,0.08)',
};

type ToolMode = 'pan' | 'pin';

export default function SharedMap() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const cameraRef = useRef<CameraRef>(null);
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showLocation, setShowLocation] = useState(false);

  // Field-tool state.
  const [tool, setTool] = useState<ToolMode>('pan');
  const [pins, setPins] = useState<Pin[]>([]);
  const [editingPin, setEditingPin] = useState<Pin | null>(null);

  // Fetch shared map + load saved annotations + record in recents.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/share/${token}`);
        if (!res.ok) throw new Error('not found');
        const data = (await res.json()) as { map: { name: string; spec: MapSpec } };
        setSpec(data.map.spec);
        setName(data.map.name);
        await saveRecent({ token, name: data.map.name, openedAt: Date.now() });
      } catch {
        setError('This map could not be loaded.');
      }
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      const anns = await getAnnotations(token);
      setPins(anns.pins);
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setShowLocation(status === 'granted');
    })();
  }, []);

  async function persistPins(next: Pin[]) {
    setPins(next);
    await saveAnnotations(token, { pins: next });
  }

  async function recenter() {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Location.requestForegroundPermissionsAsync());
      if (status !== 'granted') return;
      setShowLocation(true);
    }
    const pos = await Location.getCurrentPositionAsync({});
    cameraRef.current?.easeTo({
      center: [pos.coords.longitude, pos.coords.latitude],
      zoom: 15,
      duration: 600,
    });
  }

  function handleMapPress(event: NativeSyntheticEvent<PressEvent>) {
    if (tool !== 'pin') return;
    const [lng, lat] = event.nativeEvent.lngLat;
    const pin: Pin = {
      id: newId('pin'),
      lng,
      lat,
      name: `Pin ${pins.length + 1}`,
      createdAt: Date.now(),
    };
    void persistPins([...pins, pin]);
    setTool('pan'); // single tap drops one pin; toggle again for more
  }

  function updatePin(next: Pin) {
    void persistPins(pins.map((p) => (p.id === next.id ? next : p)));
  }

  function deletePin(id: string) {
    void persistPins(pins.filter((p) => p.id !== id));
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>{error}</Text>
      </View>
    );
  }

  if (!spec) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.msg}>Loading map…</Text>
      </View>
    );
  }

  const style = JSON.stringify(mapSpecToStyle(spec, { maptilerKey: MAPTILER_KEY }));

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: name || 'Map' }} />
      <MapView style={styles.fill} mapStyle={style} onPress={handleMapPress}>
        <Camera
          ref={cameraRef}
          center={spec.initialView.center}
          zoom={spec.initialView.zoom}
          bearing={spec.initialView.bearing}
          pitch={spec.initialView.pitch}
        />
        {showLocation && <UserLocation />}
        {pins.map((p) => (
          <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} anchor="bottom">
            <Pressable onPress={() => setEditingPin(p)} hitSlop={10} style={styles.pinHit}>
              <SymbolView
                name="mappin.circle.fill"
                size={34}
                tintColor={C.red}
                weight="bold"
                resizeMode="scaleAspectFit"
              />
            </Pressable>
          </Marker>
        ))}
      </MapView>

      {/* tool mode banner */}
      {tool === 'pin' && (
        <View style={styles.banner} pointerEvents="none">
          <SymbolView
            name="mappin"
            size={14}
            tintColor="#fff"
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.bannerText}>Tap to drop a pin</Text>
        </View>
      )}

      {/* tool buttons (right column, stacked above recenter) */}
      <View style={styles.tools}>
        <Pressable
          onPress={() => setTool((t) => (t === 'pin' ? 'pan' : 'pin'))}
          style={({ pressed }) => [
            styles.toolBtn,
            tool === 'pin' && styles.toolBtnActive,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Drop a pin"
        >
          <SymbolView
            name="mappin"
            size={22}
            tintColor={tool === 'pin' ? '#fff' : C.accent}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.85 }]}
          onPress={recenter}
          accessibilityLabel="Recenter on my location"
        >
          <SymbolView
            name="location.fill"
            size={20}
            tintColor={C.accent}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        </Pressable>
      </View>

      <PinSheet
        pin={editingPin}
        onClose={() => setEditingPin(null)}
        onSave={updatePin}
        onDelete={deletePin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0a0a0a' },
  msg: { color: C.secondary, fontSize: 15 },
  tools: { position: 'absolute', right: 14, bottom: 36, gap: 10 },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.buttonBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.buttonBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  toolBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  banner: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pinHit: { padding: 2 },
});
