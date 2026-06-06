// Cartographic chrome — title block (top), legend drawer (bottom),
// attribution. Renders over the existing map canvas without resizing it,
// so toggling visibility off reveals more map without a layout shift.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SymbolView } from 'expo-symbols';
import {
  deriveLegend,
  type LegendSection,
  type LegendEntry,
  type MapSpec,
} from '@vibe/shared';
import { creditsFor } from '@vibe/map-renderer';

const C = {
  text: '#FFFFFF',
  secondary: '#8E8E93',
  panelBg: 'rgba(28,28,30,0.92)',
  panelBorder: 'rgba(255,255,255,0.08)',
};

const DRAWER_MAX_HEIGHT = 280;

interface MapChromeProps {
  /** The map spec — drives the legend. */
  spec: MapSpec;
  /** Title shown at top. Usually `spec.name` or the recents entry name. */
  title: string;
  /** Optional ISO date string (from `.vibemap` manifest's `exportedAt`). */
  exportedAt?: string;
  /** When false, render nothing — used by the viewer's chrome toggle. */
  visible: boolean;
}

function formatDate(iso?: string): string {
  if (!iso) return new Date().toLocaleDateString();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function PointSwatchView({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'point') return null;
  const { color, strokeColor, radius } = entry.swatch;
  const size = Math.max(10, Math.min(16, radius * 2));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 1.5,
        borderColor: strokeColor,
      }}
    />
  );
}

function LineSwatchView({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'line') return null;
  const { color, width, dash } = entry.swatch;
  const thickness = Math.max(2, Math.min(4, width));
  // Dashes approximated by 3-segment view. Solid is a single bar.
  if (dash === 'solid') {
    return <View style={{ width: 24, height: thickness, backgroundColor: color }} />;
  }
  const segment = dash === 'dashed' ? 5 : 1.5;
  const gap = dash === 'dashed' ? 3 : 3;
  return (
    <View style={{ width: 24, flexDirection: 'row', alignItems: 'center', gap }}>
      <View style={{ width: segment, height: thickness, backgroundColor: color }} />
      <View style={{ width: segment, height: thickness, backgroundColor: color }} />
      <View style={{ width: segment, height: thickness, backgroundColor: color }} />
    </View>
  );
}

function PolygonSwatchView({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'polygon') return null;
  const { fillColor, fillOpacity, outlineColor } = entry.swatch;
  return (
    <View
      style={{
        width: 16,
        height: 14,
        backgroundColor: fillColor,
        opacity: Math.max(0.5, fillOpacity), // ensure visible in legend
        borderWidth: 1,
        borderColor: outlineColor,
      }}
    />
  );
}

function GradientSwatchView({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'gradient') return null;
  // RN has no built-in gradient; approximate as discrete swatches in a row.
  return (
    <View style={{ flexDirection: 'row', height: 14, width: 24 }}>
      {entry.swatch.stops.map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

function SwatchView({ entry }: { entry: LegendEntry }) {
  switch (entry.swatch.kind) {
    case 'point':
      return <PointSwatchView entry={entry} />;
    case 'line':
      return <LineSwatchView entry={entry} />;
    case 'polygon':
      return <PolygonSwatchView entry={entry} />;
    case 'gradient':
      return <GradientSwatchView entry={entry} />;
  }
}

function LegendRow({ section }: { section: LegendSection }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.entries.map((e, i) => (
        <View key={i} style={styles.entry}>
          <View style={styles.swatchBox}>
            <SwatchView entry={e} />
          </View>
          <Text style={styles.entryLabel} numberOfLines={1}>
            {e.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MapChrome({ spec, title, exportedAt, visible }: MapChromeProps) {
  const [open, setOpen] = useState(true);
  if (!visible) return null;

  const legend = deriveLegend(spec);
  const credits = creditsFor(spec.basemap, true);
  const dateLine = formatDate(exportedAt);

  return (
    <>
      {/* Title strip — anchored just below the nav header. */}
      <View style={styles.titleStrip} pointerEvents="box-none">
        <View style={styles.titlePill}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.titleSubtle}> · {dateLine}</Text>
        </View>
      </View>

      {/* Legend drawer — bottom-left, sized to leave room for the tool column. */}
      <View style={styles.drawerWrap} pointerEvents="box-none">
        <View style={styles.drawer}>
          <Pressable style={styles.drawerHeader} onPress={() => setOpen((o) => !o)}>
            <Text style={styles.drawerTitle}>Legend</Text>
            <SymbolView
              name={open ? 'chevron.down' : 'chevron.up'}
              size={14}
              tintColor={C.secondary}
              weight="semibold"
              resizeMode="scaleAspectFit"
            />
          </Pressable>
          {open && (
            <ScrollView
              style={{ maxHeight: DRAWER_MAX_HEIGHT }}
              contentContainerStyle={{ paddingBottom: 6 }}
              showsVerticalScrollIndicator={false}
            >
              {legend.length === 0 ? (
                <Text style={styles.emptyText}>No data layers</Text>
              ) : (
                legend.map((s) => <LegendRow key={s.layerId} section={s} />)
              )}
              <Text style={styles.attribution}>
                {credits.basemap} · {credits.labels}
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  titleStrip: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    alignItems: 'center',
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    maxWidth: '95%',
    backgroundColor: C.panelBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.panelBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  titleText: { color: C.text, fontSize: 14, fontWeight: '700' },
  titleSubtle: { color: C.secondary, fontSize: 12, fontWeight: '500' },

  drawerWrap: {
    position: 'absolute',
    left: 14,
    right: 70, // leave room for the right tool column
    bottom: 36,
  },
  drawer: {
    backgroundColor: C.panelBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.panelBorder,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  drawerTitle: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  section: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  sectionTitle: { color: C.text, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  swatchBox: { width: 26, alignItems: 'center', justifyContent: 'center' },
  entryLabel: { color: C.secondary, fontSize: 12, flex: 1 },

  emptyText: { color: C.secondary, fontSize: 12, paddingHorizontal: 12, paddingVertical: 6 },
  attribution: {
    color: C.secondary,
    fontSize: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
});
