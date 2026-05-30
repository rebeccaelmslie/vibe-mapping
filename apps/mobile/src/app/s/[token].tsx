import { useEffect, useMemo, useRef, useState } from 'react';
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
  GeoJSONSource,
  Layer,
  type CameraRef,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import { SymbolView } from 'expo-symbols';
import { mapSpecToStyle } from '@vibe/map-renderer';
import {
  polygonArea,
  formatArea,
  polylineLength,
  formatDistance,
  formatDuration,
  type MapSpec,
} from '@vibe/shared';
import { API_BASE, MAPTILER_KEY, LINZ_KEY } from '@/lib/config';
import {
  getAnnotations,
  saveAnnotations,
  saveRecent,
  newId,
  type Pin,
  type Measurement,
  type Track,
  type TrackPoint,
} from '@/lib/storage';
import { loadOfflineMap } from '@/lib/offline';
import { PinSheet } from '@/components/pin-sheet';
import { MeasureSheet } from '@/components/measure-sheet';
import { TrackSheet } from '@/components/track-sheet';

const C = {
  accent: '#0A84FF',
  red: '#FF453A',
  green: '#30D158',
  orange: '#FF9F0A',
  text: '#FFFFFF',
  secondary: '#8E8E93',
  buttonBg: 'rgba(28,28,30,0.92)',
  buttonBorder: 'rgba(255,255,255,0.08)',
};

type ToolMode = 'pan' | 'pin' | 'measure' | 'track';
type Coord = [number, number];

function ringFeatureCollection(coords: Coord[]) {
  if (coords.length === 0) {
    return { type: 'FeatureCollection' as const, features: [] };
  }
  const closed: Coord[] =
    coords.length >= 3 && (coords[0]![0] !== coords[coords.length - 1]![0] ||
      coords[0]![1] !== coords[coords.length - 1]![1])
      ? [...coords, coords[0]!]
      : coords;
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [closed] },
        properties: {},
      },
    ],
  };
}

function measurementsFeatureCollection(items: Measurement[]) {
  return {
    type: 'FeatureCollection' as const,
    features: items.map((m) => {
      const ring = [...m.coordinates, m.coordinates[0]!];
      return {
        type: 'Feature' as const,
        id: m.id,
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: { label: m.label, area: m.areaM2 },
      };
    }),
  };
}

function trackFeatureCollection(coords: Coord[]) {
  if (coords.length < 2) return { type: 'FeatureCollection' as const, features: [] };
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coords },
        properties: {},
      },
    ],
  };
}

function tracksFeatureCollection(tracks: Track[]) {
  return {
    type: 'FeatureCollection' as const,
    features: tracks
      .filter((t) => t.points.length >= 2)
      .map((t) => ({
        type: 'Feature' as const,
        id: t.id,
        geometry: {
          type: 'LineString' as const,
          coordinates: t.points.map((p) => [p.lng, p.lat] as Coord),
        },
        properties: { label: t.label, distance: t.distanceM },
      })),
  };
}

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
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [draftVertices, setDraftVertices] = useState<Coord[]>([]);
  const [pendingMeasure, setPendingMeasure] = useState<{ area: number } | null>(null);

  // Track recording.
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracking, setTracking] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [trackStartAt, setTrackStartAt] = useState<number | null>(null);
  const [pendingTrack, setPendingTrack] = useState<{ distance: number; duration: number } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const subRef = useRef<Location.LocationSubscription | null>(null);


  // Fetch shared map + load saved annotations + record in recents.
  // Prefer the locally-cached copy if there is one — works without coverage.
  useEffect(() => {
    (async () => {
      try {
        const local = await loadOfflineMap(token);
        if (local) {
          setSpec(local.spec);
          setName(local.name);
          // Refresh the recents entry async, with no network requirement.
          void saveRecent({ token, name: local.name, openedAt: Date.now() });
          return;
        }
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
      setMeasurements(anns.measurements);
      setTracks(anns.tracks);
    })();
  }, [token]);

  // Tick once a second while recording so the live duration display updates.
  useEffect(() => {
    if (!tracking) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tracking]);

  // Always stop the location subscription when leaving the screen.
  useEffect(() => {
    return () => {
      subRef.current?.remove();
      subRef.current = null;
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setShowLocation(status === 'granted');
    })();
  }, []);


  async function persist(next: { pins?: Pin[]; measurements?: Measurement[]; tracks?: Track[] }) {
    const p = next.pins ?? pins;
    const m = next.measurements ?? measurements;
    const tr = next.tracks ?? tracks;
    if (next.pins) setPins(next.pins);
    if (next.measurements) setMeasurements(next.measurements);
    if (next.tracks) setTracks(next.tracks);
    await saveAnnotations(token, { pins: p, measurements: m, tracks: tr });
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
    const [lng, lat] = event.nativeEvent.lngLat;
    if (tool === 'pin') {
      const pin: Pin = {
        id: newId('pin'),
        lng,
        lat,
        name: `Pin ${pins.length + 1}`,
        createdAt: Date.now(),
      };
      void persist({ pins: [...pins, pin] });
      setTool('pan');
      return;
    }
    if (tool === 'measure') {
      setDraftVertices((v) => [...v, [lng, lat]]);
    }
  }

  function undoVertex() {
    setDraftVertices((v) => v.slice(0, -1));
  }

  function cancelMeasure() {
    setDraftVertices([]);
    setTool('pan');
  }

  function finishMeasure() {
    if (draftVertices.length < 3) return;
    const area = polygonArea(draftVertices);
    setPendingMeasure({ area });
  }

  function saveMeasurement(label: string) {
    if (!pendingMeasure) return;
    const m: Measurement = {
      id: newId('mes'),
      label,
      coordinates: draftVertices,
      areaM2: pendingMeasure.area,
      createdAt: Date.now(),
    };
    void persist({ measurements: [...measurements, m] });
    setDraftVertices([]);
    setPendingMeasure(null);
    setTool('pan');
  }

  function discardPending() {
    setPendingMeasure(null);
    // Keep draftVertices so the user can adjust and re-finish.
  }

  function updatePin(next: Pin) {
    void persist({ pins: pins.map((p) => (p.id === next.id ? next : p)) });
  }
  function deletePin(id: string) {
    void persist({ pins: pins.filter((p) => p.id !== id) });
  }

  // ── Track recording ──────────────────────────────────────────────────────
  async function startTracking() {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Location.requestForegroundPermissionsAsync());
      if (status !== 'granted') return;
      setShowLocation(true);
    }
    setTrackPoints([]);
    setTrackStartAt(Date.now());
    setTracking(true);
    setNowTick(Date.now());
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 2000,
      },
      (loc) => {
        const p: TrackPoint = {
          lng: loc.coords.longitude,
          lat: loc.coords.latitude,
          t: loc.timestamp || Date.now(),
        };
        setTrackPoints((pts) => [...pts, p]);
      },
    );
  }

  function stopTracking() {
    subRef.current?.remove();
    subRef.current = null;
    setTracking(false);
    if (trackPoints.length < 2 || trackStartAt === null) {
      // Nothing meaningful recorded — clean up silently.
      setTrackPoints([]);
      setTrackStartAt(null);
      setTool('pan');
      return;
    }
    const coords: Coord[] = trackPoints.map((p) => [p.lng, p.lat]);
    const distance = polylineLength(coords);
    const duration = Math.max(1, Math.floor((Date.now() - trackStartAt) / 1000));
    setPendingTrack({ distance, duration });
  }

  function cancelTrack() {
    subRef.current?.remove();
    subRef.current = null;
    setTracking(false);
    setTrackPoints([]);
    setTrackStartAt(null);
    setPendingTrack(null);
    setTool('pan');
  }

  function saveTrack(label: string) {
    if (!pendingTrack || !trackStartAt) return;
    const t: Track = {
      id: newId('trk'),
      label,
      points: trackPoints,
      distanceM: pendingTrack.distance,
      durationSec: pendingTrack.duration,
      createdAt: Date.now(),
    };
    void persist({ tracks: [...tracks, t] });
    setTrackPoints([]);
    setTrackStartAt(null);
    setPendingTrack(null);
    setTool('pan');
  }


  const draftFC = useMemo(() => ringFeatureCollection(draftVertices), [draftVertices]);
  const savedFC = useMemo(() => measurementsFeatureCollection(measurements), [measurements]);
  const draftArea = useMemo(
    () => (draftVertices.length >= 3 ? polygonArea(draftVertices) : 0),
    [draftVertices],
  );
  const tracksFC = useMemo(() => tracksFeatureCollection(tracks), [tracks]);
  const trackDraftCoords = useMemo<Coord[]>(
    () => trackPoints.map((p) => [p.lng, p.lat]),
    [trackPoints],
  );
  const trackDraftFC = useMemo(() => trackFeatureCollection(trackDraftCoords), [trackDraftCoords]);
  const liveDistance = useMemo(() => polylineLength(trackDraftCoords), [trackDraftCoords]);
  const liveDuration = trackStartAt ? Math.floor((nowTick - trackStartAt) / 1000) : 0;

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

  const style = JSON.stringify(
    mapSpecToStyle(spec, {
      maptilerKey: MAPTILER_KEY,
      linzKey: LINZ_KEY || undefined,
    }),
  );

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

        {/* Saved tracks */}
        <GeoJSONSource id="tracks" data={tracksFC}>
          <Layer
            id="tracks-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': C.orange, 'line-width': 3 }}
          />
        </GeoJSONSource>

        {/* In-progress track */}
        {trackDraftCoords.length >= 2 && (
          <GeoJSONSource id="trackDraft" data={trackDraftFC}>
            <Layer
              id="trackDraft-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': C.orange, 'line-width': 4 }}
            />
          </GeoJSONSource>
        )}

        {/* Saved measurements */}
        <GeoJSONSource id="measurements" data={savedFC}>
          <Layer
            id="measurements-fill"
            type="fill"
            paint={{ 'fill-color': C.green, 'fill-opacity': 0.18 }}
          />
          <Layer
            id="measurements-line"
            type="line"
            paint={{ 'line-color': C.green, 'line-width': 2 }}
          />
        </GeoJSONSource>

        {/* In-progress measurement */}
        {draftVertices.length > 0 && (
          <GeoJSONSource id="draft" data={draftFC}>
            <Layer
              id="draft-fill"
              type="fill"
              paint={{ 'fill-color': C.accent, 'fill-opacity': 0.15 }}
            />
            <Layer
              id="draft-line"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': C.accent,
                'line-width': 2.5,
                'line-dasharray': [3, 2],
              }}
            />
          </GeoJSONSource>
        )}

        {/* Draft vertices as small markers so they're tap-aware later */}
        {draftVertices.map((v, i) => (
          <Marker key={`v${i}`} id={`v${i}`} lngLat={v} anchor="center">
            <View style={styles.vertex} />
          </Marker>
        ))}

        {/* Pins */}
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
          <SymbolView name="mappin" size={14} tintColor="#fff" weight="semibold" resizeMode="scaleAspectFit" />
          <Text style={styles.bannerText}>Tap to drop a pin</Text>
        </View>
      )}
      {tool === 'measure' && (
        <View style={[styles.banner, { backgroundColor: C.green }]} pointerEvents="none">
          <SymbolView name="ruler" size={14} tintColor="#fff" weight="semibold" resizeMode="scaleAspectFit" />
          <Text style={styles.bannerText}>
            {draftVertices.length === 0
              ? 'Tap to start a measurement'
              : draftVertices.length < 3
                ? `${draftVertices.length} vertex — keep tapping`
                : `${formatArea(draftArea)} — tap Done to save`}
          </Text>
        </View>
      )}
      {tracking && (
        <View style={[styles.banner, { backgroundColor: C.orange }]} pointerEvents="none">
          <View style={styles.recordDot} />
          <Text style={styles.bannerText}>
            {formatDuration(liveDuration)} · {formatDistance(liveDistance)}
          </Text>
        </View>
      )}

      {/* tool buttons (right column, stacked) */}
      <View style={styles.tools}>
        <Pressable
          onPress={() => {
            cancelMeasure();
            setTool((t) => (t === 'pin' ? 'pan' : 'pin'));
          }}
          style={({ pressed }) => [
            styles.toolBtn,
            tool === 'pin' && styles.toolBtnActive,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Drop a pin"
        >
          <SymbolView name="mappin" size={22} tintColor={tool === 'pin' ? '#fff' : C.accent} weight="semibold" resizeMode="scaleAspectFit" />
        </Pressable>

        <Pressable
          onPress={() => {
            if (tool === 'measure') cancelMeasure();
            else {
              setDraftVertices([]);
              setTool('measure');
            }
          }}
          style={({ pressed }) => [
            styles.toolBtn,
            tool === 'measure' && [styles.toolBtnActive, { backgroundColor: C.green, borderColor: C.green }],
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Measure area"
        >
          <SymbolView name="ruler" size={22} tintColor={tool === 'measure' ? '#fff' : C.accent} weight="semibold" resizeMode="scaleAspectFit" />
        </Pressable>

        <Pressable
          onPress={() => {
            if (tracking) stopTracking();
            else {
              cancelMeasure();
              setTool('track');
              void startTracking();
            }
          }}
          style={({ pressed }) => [
            styles.toolBtn,
            tracking && [styles.toolBtnActive, { backgroundColor: C.orange, borderColor: C.orange }],
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel={tracking ? 'Stop recording track' : 'Start recording track'}
        >
          <SymbolView
            name={tracking ? 'stop.fill' : 'figure.walk'}
            size={tracking ? 18 : 22}
            tintColor={tracking ? '#fff' : C.accent}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.85 }]}
          onPress={recenter}
          accessibilityLabel="Recenter on my location"
        >
          <SymbolView name="location.fill" size={20} tintColor={C.accent} weight="semibold" resizeMode="scaleAspectFit" />
        </Pressable>
      </View>

      {/* measure action bar (bottom) */}
      {tool === 'measure' && draftVertices.length > 0 && (
        <View style={styles.actionBar}>
          <Pressable
            onPress={undoVertex}
            style={({ pressed }) => [styles.barBtn, pressed && { opacity: 0.7 }]}
          >
            <SymbolView name="arrow.uturn.backward" size={16} tintColor={C.text} weight="semibold" resizeMode="scaleAspectFit" />
            <Text style={styles.barBtnText}>Undo</Text>
          </Pressable>
          <Pressable
            onPress={cancelMeasure}
            style={({ pressed }) => [styles.barBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.barBtnText, { color: C.red }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={finishMeasure}
            disabled={draftVertices.length < 3}
            style={({ pressed }) => [
              styles.barBtn,
              styles.barBtnPrimary,
              draftVertices.length < 3 && { opacity: 0.4 },
              pressed && draftVertices.length >= 3 && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.barBtnText, { color: '#fff' }]}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* track action bar (bottom) */}
      {tracking && (
        <View style={styles.actionBar}>
          <Pressable
            onPress={cancelTrack}
            style={({ pressed }) => [styles.barBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.barBtnText, { color: C.red }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={stopTracking}
            style={({ pressed }) => [
              styles.barBtn,
              styles.barBtnStop,
              pressed && { opacity: 0.85 },
            ]}
          >
            <SymbolView name="stop.fill" size={14} tintColor="#fff" weight="semibold" resizeMode="scaleAspectFit" />
            <Text style={[styles.barBtnText, { color: '#fff' }]}>Stop</Text>
          </Pressable>
        </View>
      )}

      <PinSheet
        pin={editingPin}
        onClose={() => setEditingPin(null)}
        onSave={updatePin}
        onDelete={deletePin}
      />

      <MeasureSheet
        open={pendingMeasure !== null}
        defaultLabel={`Area ${measurements.length + 1}`}
        areaM2={pendingMeasure?.area ?? 0}
        vertexCount={draftVertices.length}
        onClose={discardPending}
        onSave={saveMeasurement}
      />

      <TrackSheet
        open={pendingTrack !== null}
        defaultLabel={`Track ${tracks.length + 1}`}
        distanceM={pendingTrack?.distance ?? 0}
        durationSec={pendingTrack?.duration ?? 0}
        pointCount={trackPoints.length}
        onClose={() => {
          setPendingTrack(null);
          setTrackPoints([]);
          setTrackStartAt(null);
          setTool('pan');
        }}
        onSave={saveTrack}
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
  vertex: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
  actionBar: {
    position: 'absolute',
    left: 14,
    right: 70, // leave room for the right tool column
    bottom: 36,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: C.buttonBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.buttonBorder,
    borderRadius: 14,
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  barBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  barBtnPrimary: { backgroundColor: C.green },
  barBtnStop: { backgroundColor: C.orange },
  barBtnText: { color: C.text, fontSize: 14, fontWeight: '600' },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
