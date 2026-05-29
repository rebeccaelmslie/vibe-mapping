import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import * as Location from 'expo-location';
import { Map as MapView, Camera, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { mapSpecToStyle } from '@vibe/map-renderer';
import type { MapSpec } from '@vibe/shared';
import { API_BASE, MAPTILER_KEY } from '@/lib/config';

export default function SharedMap() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const cameraRef = useRef<CameraRef>(null);
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showLocation, setShowLocation] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/share/${token}`);
        if (!res.ok) throw new Error('not found');
        const data = (await res.json()) as { map: { name: string; spec: MapSpec } };
        setSpec(data.map.spec);
        setName(data.map.name);
      } catch {
        setError('This map could not be loaded.');
      }
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setShowLocation(status === 'granted');
    })();
  }, []);

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
      <MapView style={styles.fill} mapStyle={style}>
        <Camera
          ref={cameraRef}
          center={spec.initialView.center}
          zoom={spec.initialView.zoom}
          bearing={spec.initialView.bearing}
          pitch={spec.initialView.pitch}
        />
        {showLocation && <UserLocation />}
      </MapView>
      <Pressable style={styles.recenter} onPress={recenter} accessibilityLabel="Recenter on my location">
        <Text style={styles.recenterIcon}>◎</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0a0a0a' },
  msg: { color: '#9ca3af', fontSize: 15 },
  recenter: {
    position: 'absolute',
    right: 16,
    bottom: 32,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenterIcon: { fontSize: 24, color: '#2563eb' },
});
