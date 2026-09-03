import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, RefreshControl, Platform, LayoutChangeEvent, StyleProp, ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Rect, Path, Line, Circle, Defs, LinearGradient as SvgGrad, Stop, Text as SvgText } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useBreakpoint } from '../../../hooks/useBreakpoint';

/* ═══════════════════════ TOKENS ═══════════════════════ */
export const A = {
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  ink: '#0F172A',
  inkSoft: '#64748B',
  inkFaint: '#94A3B8',
  border: '#E2E8F0',
  borderSoft: '#EDF1F6',
  primary: '#4F46E5',
  primarySoft: '#EEF2FF',
  primaryInk: '#4338CA',
  success: '#059669', successSoft: '#ECFDF5',
  danger: '#DC2626', dangerSoft: '#FEF2F2',
  warning: '#D97706', warningSoft: '#FFFBEB',
  info: '#2563EB', infoSoft: '#EFF6FF',
  purple: '#7C3AED', purpleSoft: '#F5F3FF',
  sidebar: '#0B1220',
  sidebarAlt: '#1E293B',
  sidebarInk: '#94A3B8',
  radius: 16,
  radiusSm: 10,
  radiusLg: 22,
  maxW: 1200,
};

export const adminShadow: any = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.12)' },
  default: { shadowColor: '#0F172A', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
});
const softShadow: any = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(15,23,42,0.05)' },
  default: { shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
});

type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'purple';
const toneMap: Record<Tone, { fg: string; soft: string }> = {
  neutral: { fg: A.inkSoft, soft: '#EEF2F6' },
  primary: { fg: A.primaryInk, soft: A.primarySoft },
  success: { fg: A.success, soft: A.successSoft },
  danger: { fg: A.danger, soft: A.dangerSoft },
  warning: { fg: A.warning, soft: A.warningSoft },
  info: { fg: A.info, soft: A.infoSoft },
  purple: { fg: A.purple, soft: A.purpleSoft },
};
export const toneColor = (t: Tone) => toneMap[t].fg;

/* ═══════════════════════ AdminPage ═══════════════════════ */
export const AdminPage: React.FC<{
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: { label: string; onPress: () => void };
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
  bleed?: boolean;
}> = ({ title, subtitle, actions, back, scroll = true, refreshing, onRefresh, children, bleed }) => {
  const { isDesktopOrTablet } = useBreakpoint();
  const pad = isDesktopOrTablet ? 32 : 18;
  const navigation = useNavigation<any>();
  const showMenu = !isDesktopOrTablet && Platform.OS !== 'web';

  const head = (title || back || showMenu) ? (
    <View style={{ marginBottom: 22 }}>
      {back ? (
        <Pressable onPress={back.onPress} style={({ hovered }: any) => [s.backLink, hovered && { opacity: 0.7 }]}>
          <MaterialIcons name="arrow-back" size={18} color={A.primary} />
          <Text style={s.backTxt}>{back.label}</Text>
        </Pressable>
      ) : showMenu ? (
        <Pressable onPress={() => navigation.openDrawer?.()} style={s.menuBtn}>
          <MaterialIcons name="menu" size={22} color={A.ink} />
        </Pressable>
      ) : null}
      <View style={s.headRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!title && <Text style={s.pageTitle}>{title}</Text>}
          {!!subtitle && <Text style={s.pageSub}>{subtitle}</Text>}
        </View>
        {actions}
      </View>
    </View>
  ) : null;

  const inner = (fill: boolean) => (
    <View style={[{ width: '100%', maxWidth: bleed ? undefined : A.maxW, alignSelf: 'center' }, fill && { flex: 1 }]}>
      {head}
      {children}
    </View>
  );

  if (!scroll) {
    return <View style={[s.page, { padding: pad }]}>{inner(true)}</View>;
  }
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={{ padding: pad, paddingBottom: 80 }}
      showsVerticalScrollIndicator={Platform.OS === 'web'}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={A.primary} colors={[A.primary]} /> : undefined}
    >
      {inner(false)}
    </ScrollView>
  );
};

/* ═══════════════════════ AdminCard ═══════════════════════ */
export const AdminCard: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number; flat?: boolean }> = ({ children, style, pad = 20, flat }) => (
  <View style={[s.card, flat ? softShadow : adminShadow, { padding: pad }, style]}>{children}</View>
);

/* ═══════════════════════ AdminSectionTitle ═══════════════════════ */
export const AdminSectionTitle: React.FC<{ icon?: keyof typeof MaterialIcons.glyphMap; title: string; style?: StyleProp<ViewStyle> }> = ({ icon, title, style }) => (
  <View style={[s.sectionTitle, style]}>
    {icon && <MaterialIcons name={icon} size={16} color={A.primary} />}
    <Text style={s.sectionTitleTxt}>{title}</Text>
  </View>
);

/* ═══════════════════════ AdminBadge ═══════════════════════ */
export const AdminBadge: React.FC<{ label: string; tone?: Tone; solid?: boolean }> = ({ label, tone = 'neutral', solid }) => {
  const c = toneMap[tone];
  return (
    <View style={[s.badge, solid ? { backgroundColor: c.fg } : { backgroundColor: c.soft }]}>
      <Text style={[s.badgeTxt, { color: solid ? '#fff' : c.fg }]}>{label}</Text>
    </View>
  );
};

/* ═══════════════════════ AdminKpi ═══════════════════════ */
export const AdminKpi: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
  trend?: number | null;
}> = ({ icon, label, value, sub, tone = 'primary', trend }) => {
  const c = toneMap[tone];
  const up = (trend ?? 0) >= 0;
  return (
    <View style={[s.kpi, adminShadow]}>
      <View style={[s.kpiBar, { backgroundColor: c.fg }]} />
      <View style={s.kpiTop}>
        <View style={[s.kpiIcon, { backgroundColor: c.soft }]}>
          <MaterialIcons name={icon} size={20} color={c.fg} />
        </View>
        {trend != null && (
          <View style={[s.kpiTrend, { backgroundColor: up ? A.successSoft : A.dangerSoft }]}>
            <MaterialIcons name={up ? 'trending-up' : 'trending-down'} size={13} color={up ? A.success : A.danger} />
            <Text style={[s.kpiTrendTxt, { color: up ? A.success : A.danger }]}>{up ? '+' : ''}{trend}%</Text>
          </View>
        )}
      </View>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.kpiLabel} numberOfLines={2}>{label}</Text>
      {!!sub && <Text style={s.kpiSub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
};

export const AdminKpiGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={s.kpiGrid}>{children}</View>
);

/* ═══════════════════════ AdminSearch ═══════════════════════ */
export const AdminSearch: React.FC<{ value: string; onChangeText: (t: string) => void; placeholder?: string }> = ({ value, onChangeText, placeholder }) => (
  <View style={[s.search, softShadow]}>
    <MaterialIcons name="search" size={20} color={A.inkFaint} />
    <TextInput
      style={s.searchInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={A.inkFaint}
    />
    {value.length > 0 && (
      <Pressable onPress={() => onChangeText('')} hitSlop={8}>
        <MaterialIcons name="close" size={18} color={A.inkFaint} />
      </Pressable>
    )}
  </View>
);

/* ═══════════════════════ AdminButton ═══════════════════════ */
export const AdminButton: React.FC<{
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  variant?: 'primary' | 'ghost' | 'danger' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ label, onPress, icon, variant = 'primary', loading, disabled, style }) => {
  const palette = {
    primary: { bg: A.primary, fg: '#fff', border: 'transparent' },
    dark: { bg: A.ink, fg: '#fff', border: 'transparent' },
    danger: { bg: A.danger, fg: '#fff', border: 'transparent' },
    ghost: { bg: A.surface, fg: A.ink, border: A.border },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ hovered }: any) => [
        s.btn,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || loading) && { opacity: 0.55 },
        hovered && !disabled && { opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon && <MaterialIcons name={icon} size={17} color={palette.fg} />}
          <Text style={[s.btnTxt, { color: palette.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
};

export const AdminIconButton: React.FC<{ icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void; tone?: Tone }> = ({ icon, onPress, tone = 'primary' }) => {
  const c = toneMap[tone];
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [s.iconBtn, { backgroundColor: c.soft }, hovered && { opacity: 0.8 }]}>
      <MaterialIcons name={icon} size={20} color={c.fg} />
    </Pressable>
  );
};

/* ═══════════════════════ AdminSegmented ═══════════════════════ */
export function AdminSegmented<T extends string>({ options, value, onChange, size = 'md' }: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <View style={[s.segmented, size === 'sm' && { padding: 2 }]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segBtn, size === 'sm' && { paddingVertical: 5, paddingHorizontal: 10 }, active && s.segBtnActive]}>
            <Text style={[s.segTxt, size === 'sm' && { fontSize: 11 }, active && s.segTxtActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ═══════════════════════ AdminInfoRow ═══════════════════════ */
export const AdminInfoRow: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  last?: boolean;
}> = ({ icon, label, value, valueColor, last }) => (
  <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
    <View style={s.infoIcon}><MaterialIcons name={icon} size={18} color={A.primary} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  </View>
);

/* ═══════════════════════ AdminInput ═══════════════════════ */
export const AdminInput: React.FC<{
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  multiline?: boolean;
}> = ({ label, value, onChangeText, icon, placeholder, secureTextEntry, keyboardType, multiline }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={s.fieldLabel}>{label}</Text>
    <View style={[s.inputWrap, multiline && { alignItems: 'flex-start', paddingTop: 12 }]}>
      {icon && <MaterialIcons name={icon} size={19} color={A.inkFaint} style={{ marginRight: 10 }} />}
      <TextInput
        style={[s.input, multiline && { height: 84, paddingVertical: 0, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={A.inkFaint}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  </View>
);

/* ═══════════════════════ AdminEmpty / AdminLoading / AdminError ═══════════════════════ */
export const AdminLoading: React.FC<{ label?: string }> = ({ label }) => (
  <View style={s.centerBox}>
    <ActivityIndicator size="large" color={A.primary} />
    {!!label && <Text style={s.centerTxt}>{label}</Text>}
  </View>
);

export const AdminEmpty: React.FC<{ icon?: keyof typeof MaterialIcons.glyphMap; title: string; hint?: string }> = ({ icon = 'inbox', title, hint }) => (
  <View style={s.centerBox}>
    <View style={s.emptyIcon}><MaterialIcons name={icon} size={30} color={A.primary} /></View>
    <Text style={s.emptyTitle}>{title}</Text>
    {!!hint && <Text style={s.centerTxt}>{hint}</Text>}
  </View>
);

export const AdminError: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <View style={s.centerBox}>
    <MaterialIcons name="error-outline" size={40} color={A.danger} />
    <Text style={[s.centerTxt, { color: A.danger, fontWeight: '600' }]}>{message}</Text>
    {onRetry && <AdminButton label="Réessayer" onPress={onRetry} variant="ghost" icon="refresh" style={{ marginTop: 14 }} />}
  </View>
);

export const AdminBanner: React.FC<{ icon?: keyof typeof MaterialIcons.glyphMap; text: string; tone?: Tone }> = ({ icon = 'info', text, tone = 'info' }) => {
  const c = toneMap[tone];
  return (
    <View style={[s.banner, { backgroundColor: c.soft }]}>
      <MaterialIcons name={icon} size={20} color={c.fg} />
      <Text style={[s.bannerTxt, { color: c.fg }]}>{text}</Text>
    </View>
  );
};

/* ═══════════════════════ CHARTS (self-contained, light) ═══════════════════════ */
const nice = (max: number, ticks = 4) => {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const nn = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  const step = nn * mag;
  return { top: Math.ceil(max / step) * step, step };
};
const fmtK = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'Md';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return String(Math.round(n));
};

export const AdminChart: React.FC<{
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  height?: number;
  data: { label: string; value: number }[];
  kind?: 'bar' | 'line';
  color?: string;
  emptyLabel?: string;
}> = ({ title, subtitle, right, height = 220, data, kind = 'bar', color = A.primary, emptyLabel = 'Aucune donnée pour cette période' }) => {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const hasData = data.length > 0 && data.some((d) => d.value !== 0);
  const PAD = { l: 40, r: 12, t: 12, b: 26 };
  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const maxV = Math.max(1, ...data.map((d) => d.value));
  const { top, step } = nice(maxV);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;

  return (
    <AdminCard style={{ marginBottom: 18 }}>
      <View style={s.chartHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.chartTitle}>{title}</Text>
          {!!subtitle && <Text style={s.chartSub}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      <View onLayout={onLayout} style={{ height, marginTop: 14 }}>
        {w > 0 && hasData && (
          <Svg width={w} height={height}>
            <Defs>
              <SvgGrad id="adminArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </SvgGrad>
            </Defs>
            {ticks.map((tk, i) => (
              <React.Fragment key={i}>
                <Line x1={PAD.l} y1={y(tk)} x2={w - PAD.r} y2={y(tk)} stroke={A.borderSoft} strokeWidth={1} />
                <SvgText x={PAD.l - 8} y={y(tk) + 3} fill={A.inkFaint} fontSize={10} textAnchor="end">{fmtK(tk)}</SvgText>
              </React.Fragment>
            ))}
            {kind === 'bar' && data.map((d, i) => {
              const bw = Math.min(38, (iw / data.length) * 0.6);
              const cx = PAD.l + (iw / data.length) * (i + 0.5);
              const bh = (d.value / top) * ih;
              return (
                <Rect key={i} x={cx - bw / 2} y={PAD.t + ih - bh} width={bw} height={Math.max(2, bh)} rx={4} fill={color} />
              );
            })}
            {kind === 'line' && (() => {
              const pts = data.map((d, i) => {
                const cx = PAD.l + (data.length === 1 ? iw / 2 : (iw / (data.length - 1)) * i);
                return [cx, y(d.value)] as const;
              });
              const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
              const area = `${line} L${pts[pts.length - 1][0]},${PAD.t + ih} L${pts[0][0]},${PAD.t + ih} Z`;
              return (
                <>
                  <Path d={area} fill="url(#adminArea)" />
                  <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={A.surface} stroke={color} strokeWidth={2} />)}
                </>
              );
            })()}
            {data.map((d, i) => {
              const cx = PAD.l + (kind === 'line' && data.length > 1 ? (iw / (data.length - 1)) * i : (iw / data.length) * (i + 0.5));
              return <SvgText key={i} x={cx} y={height - 8} fill={A.inkFaint} fontSize={10} textAnchor="middle">{d.label}</SvgText>;
            })}
          </Svg>
        )}
        {w > 0 && !hasData && (
          <View style={[s.centerBox, { paddingVertical: 0, flex: 1 }]}>
            <Text style={s.centerTxt}>{emptyLabel}</Text>
          </View>
        )}
      </View>
    </AdminCard>
  );
};

/* ═══════════════════════ styles ═══════════════════════ */
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: A.bg },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backTxt: { color: A.primary, fontWeight: '700', fontSize: 13.5 },
  menuBtn: { width: 40, height: 40, borderRadius: 11, backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  pageTitle: { fontSize: 25, fontWeight: '800', color: A.ink, letterSpacing: -0.4 },
  pageSub: { fontSize: 14, color: A.inkSoft, marginTop: 4 },

  card: { backgroundColor: A.surface, borderRadius: A.radius, borderWidth: 1, borderColor: A.borderSoft },

  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 12 },
  sectionTitleTxt: { fontSize: 13, fontWeight: '800', color: A.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6 },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  kpi: {
    backgroundColor: A.surface, borderRadius: A.radius, borderWidth: 1, borderColor: A.borderSoft,
    padding: 16, gap: 6, flexGrow: 1, flexBasis: 170, minWidth: 150, overflow: 'hidden',
  },
  kpiBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  kpiTrend: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  kpiTrendTxt: { fontSize: 11, fontWeight: '800' },
  kpiValue: { fontSize: 24, fontWeight: '800', color: A.ink, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 12, color: A.inkSoft, fontWeight: '600', lineHeight: 16 },
  kpiSub: { fontSize: 11, color: A.inkFaint },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: A.surface,
    borderRadius: 12, borderWidth: 1, borderColor: A.border, paddingHorizontal: 14, height: 48,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: A.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null) },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 18, height: 44, borderRadius: 12, borderWidth: 1,
  },
  btnTxt: { fontSize: 14, fontWeight: '700' },
  iconBtn: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  segmented: { flexDirection: 'row', backgroundColor: '#EEF2F6', borderRadius: 12, padding: 4, alignSelf: 'flex-start', flexWrap: 'wrap' },
  segBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 9 },
  segBtnActive: { backgroundColor: A.surface, ...softShadow },
  segTxt: { fontSize: 12.5, fontWeight: '700', color: A.inkSoft },
  segTxtActive: { color: A.primaryInk },

  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: A.borderSoft, gap: 14 },
  infoIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: A.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: A.inkFaint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 14.5, color: A.ink, fontWeight: '600', marginTop: 3 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: A.ink, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: A.surfaceAlt, borderRadius: 11, borderWidth: 1, borderColor: A.border, paddingHorizontal: 14 },
  input: { flex: 1, height: 48, fontSize: 14.5, color: A.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null) },

  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  centerTxt: { fontSize: 14, color: A.inkSoft, textAlign: 'center' },
  emptyIcon: { width: 62, height: 62, borderRadius: 18, backgroundColor: A.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: A.ink },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginBottom: 18 },
  bannerTxt: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  chartHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  chartTitle: { fontSize: 15.5, fontWeight: '800', color: A.ink },
  chartSub: { fontSize: 12.5, color: A.inkSoft, marginTop: 2 },
});
