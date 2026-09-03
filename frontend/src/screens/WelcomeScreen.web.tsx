/**
 * SolFerme — Site vitrine / landing page WEB UNIQUEMENT.
 *
 * Ce fichier est résolu par Metro/Expo uniquement pour la plateforme `web`
 * (mécanisme d'extension `.web.tsx`). Sur Android et iOS, c'est `WelcomeScreen.tsx`
 * (inchangé) qui est utilisé. Aucun impact sur l'application mobile.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  useWindowDimensions, ActivityIndicator, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '../api/client';
import { BrandLogo } from '../components/BrandLogo';
import {
  SITE, DOWNLOAD, NAV, PROBLEMS, FEATURES, BEFORE, AFTER, STEPS, WHY, FAQ, LEGAL_LINE,
} from './landing/content';

const C = {
  bg: '#FFF8EC',
  surface: '#FFFFFF',
  yellow: '#F9D760',
  yellowDark: '#E7C238',
  orange: '#F57C00',
  orangeSoft: '#FFF1E0',
  text: '#1A1A1A',
  muted: '#5C5C5C',
  border: '#EAD196',
  borderSoft: '#F0E4C4',
  dark: '#2A2419',
};

const HEADER_H = 64;
const MAX_W = 1120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── SEO (web only) ──────────────────────────────────────────────────────────
const useSEO = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = "SolFerme — Gestion d'élevage avicole";
    const upsert = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute('content', content);
    };
    upsert('name', 'description', SITE.metaDescription);
    upsert('property', 'og:title', "SolFerme — Gestion d'élevage avicole");
    upsert('property', 'og:description', SITE.metaDescription);
    upsert('property', 'og:type', 'website');
    upsert('name', 'theme-color', C.yellow);
  }, []);
};

const scrollToId = (id: string) => {
  if (typeof document !== 'undefined') {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// ── Petits composants ───────────────────────────────────────────────────────
const CTA = ({ label, onPress, variant = 'primary', icon, shimmer }: any) => {
  const [hover, setHover] = useState(false);
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="button"
      style={[
        styles.cta,
        isPrimary ? styles.ctaPrimary : styles.ctaGhost,
        { overflow: 'hidden' },
        hover && (isPrimary ? { backgroundColor: C.yellowDark } : { backgroundColor: C.orangeSoft }),
        { transform: [{ translateY: hover ? -2 : 0 }, { scale: hover ? 1.02 : 1 }] as any },
        (hover ? { boxShadow: '0 10px 24px rgba(231,194,56,0.35)' } : { boxShadow: '0 0px 0px rgba(0,0,0,0)' }) as any,
        { transitionProperty: 'transform, box-shadow, background-color', transitionDuration: '160ms' } as any,
      ]}
    >
      {shimmer ? (
        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute', top: -10, bottom: -10, width: 46, backgroundColor: 'rgba(255,255,255,0.55)',
              transform: [{ rotate: '18deg' }], left: -30,
            } as any,
            kf(SHEEN, { dur: '4.5s', delay: '1.2s', iter: 'infinite', ease: 'ease-in-out' }),
          ]}
        />
      ) : null}
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={isPrimary ? C.text : C.orange} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.ctaText, !isPrimary && { color: C.orange }]}>{label}</Text>
    </Pressable>
  );
};

const StoreBadge = ({ cfg, icon }: { cfg: { available: boolean; url: string | null; label: string }; icon: any }) => {
  const disabled = !cfg.available || !cfg.url;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => cfg.url && Linking.openURL(cfg.url)}
      style={[styles.storeBadge, disabled && styles.storeBadgeDisabled]}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name={icon} size={22} color={disabled ? C.muted : C.text} />
      <View style={{ marginLeft: 10 }}>
        <Text style={[styles.storeBadgeSmall, disabled && { color: C.muted }]}>
          {disabled ? 'Bientôt' : 'Télécharger sur'}
        </Text>
        <Text style={[styles.storeBadgeBig, disabled && { color: C.muted }]}>{cfg.label}</Text>
      </View>
    </Pressable>
  );
};

/** Ancre invisible placée HEADER_H au-dessus du contenu pour que le
 *  scroll-to-section ne passe pas sous le header fixe. */
const Anchor = ({ id }: { id: string }) => (
  <View nativeID={id} style={{ position: 'absolute', top: -HEADER_H, height: 1, width: 1 }} pointerEvents="none" />
);

const Section = ({ id, children, style, alt, glow }: any) => (
  <View style={[styles.section, { position: 'relative', overflow: 'hidden' }, alt && { backgroundColor: C.surface }, style]}>
    <Anchor id={id} />
    {glow ? (
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute', width: 380, height: 380, borderRadius: 999,
            backgroundColor: glow === 'orange' ? 'rgba(245,124,0,0.10)' : 'rgba(249,215,96,0.18)',
            top: glow === 'orange' ? undefined : -120, bottom: glow === 'orange' ? -140 : undefined,
            right: glow === 'orange' ? undefined : -110, left: glow === 'orange' ? -120 : undefined,
          } as any,
          kf(DRIFT, { dur: '16s', iter: 'infinite', ease: 'ease-in-out', fill: 'none' }),
        ]}
      />
    ) : null}
    <View style={styles.sectionInner}>{children}</View>
  </View>
);

// ── Animations de page (reveal au scroll + entrées au montage) ──────────────
const REVEAL = { '0%': { opacity: 0, transform: [{ translateY: 26 }] }, '100%': { opacity: 1, transform: [{ translateY: 0 }] } };
const REVEAL_L = { '0%': { opacity: 0, transform: [{ translateX: -28 }] }, '100%': { opacity: 1, transform: [{ translateX: 0 }] } };
const REVEAL_R = { '0%': { opacity: 0, transform: [{ translateX: 28 }] }, '100%': { opacity: 1, transform: [{ translateX: 0 }] } };
const DROP_IN = { '0%': { opacity: 0, transform: [{ translateY: -70 }] }, '100%': { opacity: 1, transform: [{ translateY: 0 }] } };
const BOB = { '0%': { transform: [{ translateY: 0 }] }, '50%': { transform: [{ translateY: 7 }] }, '100%': { transform: [{ translateY: 0 }] } };
const SHEEN = { '0%': { opacity: 0, transform: [{ translateX: -60 }] }, '18%': { opacity: 0.7 }, '38%': { opacity: 0, transform: [{ translateX: 240 }] }, '100%': { opacity: 0, transform: [{ translateX: 240 }] } };
const DRIFT = { '0%': { transform: [{ translateX: 0 }, { translateY: 0 }] }, '50%': { transform: [{ translateX: 26 }, { translateY: -18 }] }, '100%': { transform: [{ translateX: 0 }, { translateY: 0 }] } };

/** Révèle l'élément (fondu + glissé) quand il entre dans le viewport. */
const useReveal = (delay = 0, variant: 'up' | 'left' | 'right' = 'up') => {
  const ref = useRef<any>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current as any;
    if (!node || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  const frames = variant === 'left' ? REVEAL_L : variant === 'right' ? REVEAL_R : REVEAL;
  const anim = shown
    ? kf(frames, { dur: '0.7s', delay: `${delay}s`, fill: 'both' })
    : ({ opacity: 0 } as any);
  return { ref, anim, shown };
};

const RevealView = ({ children, delay, variant, style, pointerEvents }: any) => {
  const { ref, anim } = useReveal(delay, variant);
  return <View ref={ref} pointerEvents={pointerEvents} style={[style, anim]}>{children}</View>;
};

const SectionTitle = ({ kicker, title, sub }: any) => {
  const { ref, anim } = useReveal(0);
  return (
    <View ref={ref} style={[{ alignItems: 'center', marginBottom: 36 }, anim]}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.h2}>{title}</Text>
      {sub ? <Text style={styles.h2sub}>{sub}</Text> : null}
    </View>
  );
};

// ── Maquette du tableau de bord SolFerme (Android) ──────────────────────────
// Animations via `animationKeyframes` (react-native-web). Si le moteur d'anim
// n'était pas disponible, les styles de base restent l'état final visible.
const kf = (
  frames: Record<string, any>,
  opt: { dur: string; delay?: string; iter?: number | string; ease?: string; fill?: string; dir?: string },
) => ({
  animationKeyframes: [frames],
  animationDuration: opt.dur,
  animationDelay: opt.delay ?? '0s',
  animationIterationCount: opt.iter ?? 1,
  animationTimingFunction: opt.ease ?? 'cubic-bezier(0.22, 1, 0.36, 1)',
  animationFillMode: opt.fill ?? 'both',
  animationDirection: opt.dir ?? 'normal',
} as any);

const RISE_SM = { '0%': { opacity: 0, transform: [{ translateY: 16 }] }, '100%': { opacity: 1, transform: [{ translateY: 0 }] } };
const FADE_SCALE = { '0%': { opacity: 0, transform: [{ scale: 0.9 }] }, '100%': { opacity: 1, transform: [{ scale: 1 }] } };
const FLOAT = { '0%': { transform: [{ translateY: 0 }] }, '50%': { transform: [{ translateY: -13 }] }, '100%': { transform: [{ translateY: 0 }] } };
const GROW_Y = { '0%': { transform: [{ scaleY: 0.02 }] }, '100%': { transform: [{ scaleY: 1 }] } };
const PULSE = { '0%': { opacity: 0.28, transform: [{ scale: 1 }] }, '50%': { opacity: 0.5, transform: [{ scale: 1.14 }] }, '100%': { opacity: 0.28, transform: [{ scale: 1 }] } };
const SWEEP = {
  '0%': { opacity: 0, transform: [{ translateX: -120 }] },
  '58%': { opacity: 0, transform: [{ translateX: -30 }] },
  '72%': { opacity: 0.5, transform: [{ translateX: 60 }] },
  '100%': { opacity: 0, transform: [{ translateX: 240 }] },
};
const TOAST_R = {
  '0%': { opacity: 0, transform: [{ translateX: 30 }] }, '6%': { opacity: 1, transform: [{ translateX: 0 }] },
  '40%': { opacity: 1, transform: [{ translateX: 0 }] }, '48%': { opacity: 0, transform: [{ translateX: 30 }] },
  '100%': { opacity: 0, transform: [{ translateX: 30 }] },
};
const TOAST_L = {
  '0%': { opacity: 0, transform: [{ translateX: -30 }] }, '52%': { opacity: 0, transform: [{ translateX: -30 }] },
  '58%': { opacity: 1, transform: [{ translateX: 0 }] }, '92%': { opacity: 1, transform: [{ translateX: 0 }] },
  '98%': { opacity: 0, transform: [{ translateX: -30 }] }, '100%': { opacity: 0, transform: [{ translateX: -30 }] },
};

const MK = {
  screen: '#FBF3E4', card: '#FFFFFF', text: '#1A1A1A', muted: '#8C8C8C',
  divider: '#EFE4CB', bar: '#F57C00', chipActive: '#F6C948',
  yTint: '#FBE7B4', yIco: '#C98A00', gTint: '#DBEFD8', gIco: '#3E9B4F',
  tTint: '#D3ECE7', tIco: '#1C9C88', bTint: '#DCE7FA', bIco: '#3B6FD6', oTint: '#FBE2CC', oIco: '#F57C00',
};

const MkStat = ({ icon, tint, ico, value, label, sub, wide, money, delay }: any) => (
  <View style={[mock.stat, wide && mock.statWide, kf(RISE_SM, { dur: '0.55s', delay })]}>
    <View style={[mock.statIco, { backgroundColor: tint }]}>
      <MaterialCommunityIcons name={icon} size={12} color={ico} />
    </View>
    <Text style={[mock.statValue, money && mock.statValueMoney]} numberOfLines={1}>{value}</Text>
    <Text style={mock.statLabel} numberOfLines={1}>{label}</Text>
    {sub ? <Text style={mock.statSub} numberOfLines={1}>{sub}</Text> : null}
  </View>
);

const MkChart = () => {
  const bars = [
    { d: 'Dim', v: 50, label: '50' },
    { d: 'Lun', v: 1500, label: '1.5k' },
    { d: 'Mer', v: 85, label: '85' },
  ];
  const max = 1500;
  const H = 54;
  const BASE = 11;
  return (
    <View style={[mock.chartCard, kf(RISE_SM, { dur: '0.6s', delay: '0.35s' })]}>
      <Text style={mock.chartTitle}>Production (casiers)</Text>
      <Text style={mock.chartUnit}>cas.</Text>
      <View style={mock.chartArea}>
        {[1, 0.66, 0.33, 0].map((g, i) => (
          <View key={i} style={[mock.gridLine, { bottom: BASE + g * H }]}>
            <Text style={mock.gridLabel}>{['1.5k', '1k', '500', '0'][i]}</Text>
          </View>
        ))}
        <View style={mock.bars}>
          {bars.map((b, i) => (
            <View key={b.d} style={mock.barCol}>
              <Text style={mock.barValue}>{b.label}</Text>
              <View
                style={[
                  mock.bar,
                  { height: Math.max(5, (b.v / max) * H) },
                  kf(GROW_Y, { dur: '0.9s', delay: `${0.5 + i * 0.12}s`, ease: 'cubic-bezier(0.34,1.4,0.64,1)' }),
                ]}
              />
              <Text style={mock.barDay}>{b.d}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={mock.periodRow}>
        {['Jour', 'Semaine', 'Mois', 'Année'].map((p) => (
          <View key={p} style={[mock.period, p === 'Semaine' && mock.periodActive]}>
            <Text style={[mock.periodText, p === 'Semaine' && mock.periodTextActive]}>{p}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const PhoneMockup = ({ compact }: { compact?: boolean }) => {
  const tilt = compact
    ? []
    : [{ perspective: 1500 }, { rotateY: '-9deg' }, { rotateX: '3deg' }, { rotateZ: '1deg' }];
  return (
   <View style={mock.clip}>
    <View style={[mock.stage, compact && mock.stageCompact, kf(FADE_SCALE, { dur: '0.7s' })]}>
      <View style={[mock.glow, mock.glowA, kf(PULSE, { dur: '7s', iter: 'infinite', ease: 'ease-in-out' })]} />
      <View style={[mock.glow, mock.glowB, kf(PULSE, { dur: '9s', delay: '1s', iter: 'infinite', ease: 'ease-in-out' })]} />

      <View style={{ transform: tilt as any }}>
        <View style={kf(FLOAT, { dur: '6s', iter: 'infinite', ease: 'ease-in-out', fill: 'none' })}>
          <View style={mock.phone}>
            <View style={mock.phoneSpeaker} />
            <View style={mock.screen}>
              {/* sweep de lumière (une fois) */}
              <View style={[mock.sweep, kf(SWEEP, { dur: '2.4s', delay: '0.9s' })]} pointerEvents="none" />

              {/* barre d'état Android */}
              <View style={mock.statusBar}>
                <Text style={mock.statusTime}>20:14</Text>
                <View style={mock.statusIcons}>
                  <MaterialCommunityIcons name="signal" size={9} color={MK.muted} />
                  <MaterialCommunityIcons name="wifi" size={9} color={MK.muted} />
                  <MaterialCommunityIcons name="battery-70" size={11} color={MK.muted} />
                </View>
              </View>

              {/* header appli */}
              <View style={mock.appHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={mock.hello}>Bonjour,</Text>
                  <Text style={mock.name}>Amadou Barry</Text>
                </View>
                <LinearGradient colors={['#F6C948', '#EA9E2F']} style={mock.avatar}>
                  <Text style={mock.avatarTxt}>AB</Text>
                </LinearGradient>
              </View>
              <View style={mock.hDivider} />

              {/* filtres ferme */}
              <View style={mock.chips}>
                <View style={[mock.chip, mock.chipActive]}>
                  <MaterialCommunityIcons name="home-group" size={10} color={MK.text} />
                  <Text style={[mock.chipText, { color: MK.text, fontWeight: '800' }]}>Toutes les fermes</Text>
                </View>
                <View style={mock.chip}><Text style={mock.chipText}>Ferme Beta</Text></View>
                <View style={mock.chip}><Text style={mock.chipText}>Ferme Alpha</Text></View>
              </View>

              {/* cartes stats */}
              <View style={mock.statGrid}>
                <MkStat icon="home-group" tint={MK.yTint} ico={MK.yIco} value="2 / 2" label="Mes Lots" delay="0.15s" />
                <MkStat icon="bird" tint={MK.gTint} ico={MK.gIco} value="1 256" label="Sujets Totaux" delay="0.2s" />
                <MkStat icon="egg" tint={MK.yTint} ico={MK.yIco} value="85" label="Production Jour" sub="casiers" delay="0.25s" />
                <MkStat icon="speedometer" tint={MK.gTint} ico={MK.gIco} value="100%" label="Performance" sub="Excellent" delay="0.3s" />
                <MkStat icon="cash-multiple" tint={MK.tTint} ico={MK.tIco} value="101 040 000 GNF" label="Chiffre d'affaires" money delay="0.35s" />
                <MkStat icon="wallet" tint={MK.bTint} ico={MK.bIco} value="100 210 000 GNF" label="Encaissements" money delay="0.4s" />
                <MkStat icon="timer-sand" tint={MK.oTint} ico={MK.oIco} value="830 000 GNF" label="Créances" wide delay="0.45s" />
              </View>

              <MkChart />
            </View>

            {/* barre de navigation */}
            <View style={mock.nav}>
              {[
                { i: 'home-variant', l: 'Tableau de Bord', on: true },
                { i: 'egg', l: 'Fermes' },
                { i: 'credit-card-outline', l: 'Finance' },
                { i: 'menu', l: 'Plus' },
              ].map((n) => (
                <View key={n.l} style={mock.navItem}>
                  <MaterialCommunityIcons name={n.i as any} size={15} color={n.on ? MK.text : MK.muted} />
                  <Text style={[mock.navText, n.on && { color: MK.text, fontWeight: '800' }]} numberOfLines={1}>{n.l}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* notifications flottantes (boucle) */}
      <View style={[mock.toast, mock.toastR, kf(TOAST_R, { dur: '9s', iter: 'infinite', delay: '1.6s' })]}>
        <View style={[mock.toastDot, { backgroundColor: '#2FA34B' }]}>
          <MaterialCommunityIcons name="check" size={11} color="#fff" />
        </View>
        <View>
          <Text style={mock.toastTitle}>Vente enregistrée</Text>
          <Text style={mock.toastSub}>+1 250 000 GNF</Text>
        </View>
      </View>
      <View style={[mock.toast, mock.toastL, kf(TOAST_L, { dur: '9s', iter: 'infinite', delay: '1.6s' })]}>
        <View style={[mock.toastDot, { backgroundColor: '#F57C00' }]}>
          <MaterialCommunityIcons name="bell-ring" size={10} color="#fff" />
        </View>
        <View>
          <Text style={mock.toastTitle}>Rappel santé</Text>
          <Text style={mock.toastSub}>Vaccination · Lot A</Text>
        </View>
      </View>
    </View>
   </View>
  );
};

// ── Landing ─────────────────────────────────────────────────────────────────
export const WelcomeScreen = ({ navigation }: any) => {
  useSEO();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 700 && width < 1024;
  const cols = isDesktop ? 4 : isTablet ? 2 : 1;
  const whyCols = isDesktop ? 3 : isTablet ? 2 : 1;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  const onScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const max = Math.max(1, contentSize.height - layoutMeasurement.height);
    setScrollPct(Math.min(1, Math.max(0, contentOffset.y / max)));
  };

  const styles2 = useMemo(() => makeResponsive(width), [width]);

  // Contact form
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); setSent(false); };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = 'Veuillez indiquer votre nom.';
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Adresse email invalide.';
    if (form.message.trim().length < 10) errs.message = 'Votre message doit contenir au moins 10 caractères.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSending(true);
    try {
      await apiClient.post('/contact/', {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (e: any) {
      const data = e?.response?.data;
      if (data && typeof data === 'object') {
        const mapped: Record<string, string> = {};
        for (const k of Object.keys(data)) mapped[k] = Array.isArray(data[k]) ? data[k][0] : String(data[k]);
        setErrors(mapped.detail ? { message: mapped.detail } : mapped);
      } else {
        setErrors({ message: "Impossible d'envoyer le message. Réessayez dans un instant." });
      }
    } finally {
      setSending(false);
    }
  };

  const navItem = (item: { id: string; label: string }) => (
    <Pressable key={item.id} onPress={() => { scrollToId(item.id); setMenuOpen(false); }} style={styles.navLink}>
      <Text style={styles.navLinkText}>{item.label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ── */}
      <View style={[styles.header, { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 } as any, kf(DROP_IN, { dur: '0.55s', ease: 'cubic-bezier(0.22,1,0.36,1)' })]}>
        <View style={styles.headerInner}>
          <Pressable style={styles.brand} onPress={() => scrollToId('top')}>
            <BrandLogo size={34} shape="squircle" background="#FFFFFF" />
            <Text style={[styles.brandName, { marginLeft: 10 }]}>SolFerme</Text>
          </Pressable>

          {isDesktop ? (
            <View style={styles.navRow}>
              {NAV.map(navItem)}
              <Pressable style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginBtnText}>Se connecter</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setMenuOpen((o) => !o)} style={styles.burger} accessibilityLabel="Menu">
              <MaterialCommunityIcons name={menuOpen ? 'close' : 'menu'} size={24} color={C.text} />
            </Pressable>
          )}
        </View>
        {!isDesktop && menuOpen && (
          <View style={styles.mobileMenu}>
            {NAV.map(navItem)}
            <Pressable style={[styles.loginBtn, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={() => { setMenuOpen(false); navigation.navigate('Login'); }}>
              <Text style={styles.loginBtnText}>Se connecter</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: HEADER_H }}
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {/* ── HERO ── */}
        <View nativeID="top" style={styles.hero}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <View style={[styles.sectionInner, styles2.heroRow]}>
            <View style={styles2.heroCol}>
              <Text style={[styles.heroBadge, kf(REVEAL, { dur: '0.6s', delay: '0.05s' })]}>🐔 Gestion d'élevage avicole</Text>
              <Text style={[styles.h1, styles2.h1, kf(REVEAL, { dur: '0.7s', delay: '0.12s' })]}>{SITE.tagline}</Text>
              <Text style={[styles.heroSub, kf(REVEAL, { dur: '0.7s', delay: '0.2s' })]}>{SITE.intro}</Text>
              <Text style={[styles.heroAudience, kf(REVEAL, { dur: '0.7s', delay: '0.28s' })]}>{SITE.audience}</Text>
              <View style={[styles.heroCtas, kf(REVEAL, { dur: '0.7s', delay: '0.36s' })]}>
                <CTA label="Découvrir SolFerme" icon="compass-outline" shimmer onPress={() => scrollToId('features')} />
                <CTA label="Télécharger l'application" variant="ghost" icon="download" onPress={() => scrollToId('download')} />
              </View>
              <View style={[styles.storeRow, kf(REVEAL, { dur: '0.7s', delay: '0.44s' })]}>
                <StoreBadge cfg={DOWNLOAD.android} icon="android" />
                <StoreBadge cfg={DOWNLOAD.ios} icon="apple" />
              </View>
            </View>

            {/* Visuel : maquette fidèle du tableau de bord SolFerme (Android) */}
            <View style={styles2.heroVisual}>
              <PhoneMockup compact={!isDesktop} />
            </View>
          </View>

          {isDesktop && (
            <Pressable style={styles.scrollCue} onPress={() => scrollToId('problem')} accessibilityLabel="Défiler">
              <View style={kf(BOB, { dur: '1.8s', iter: 'infinite', ease: 'ease-in-out', fill: 'none' })}>
                <MaterialCommunityIcons name="chevron-down" size={26} color={C.muted} />
              </View>
            </Pressable>
          )}
        </View>

        {/* ── LE PROBLÈME ── */}
        <Section id="problem" alt>
          <SectionTitle
            kicker="Le quotidien d'un éleveur"
            title="Gérer une exploitation avicole, c'est jongler avec trop d'informations"
          />
          <View style={styles.problemGrid}>
            {PROBLEMS.map((p, i) => (
              <RevealView key={p} delay={i * 0.06} style={[styles.problemItem, { width: colWidth(width, isDesktop ? 3 : isTablet ? 2 : 1) }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={C.orange} />
                <Text style={styles.problemText}>{p}</Text>
              </RevealView>
            ))}
          </View>
          <RevealView delay={0.1}>
            <Text style={styles.problemConclusion}>
              SolFerme rassemble tout ça dans <Text style={{ fontWeight: '800', color: C.text }}>une seule application</Text>, simple et faite pour le terrain.
            </Text>
          </RevealView>
        </Section>

        {/* ── FONCTIONNALITÉS ── */}
        <Section id="features" glow>
          <SectionTitle
            kicker="Fonctionnalités"
            title="Tout votre élevage, au même endroit"
            sub="Chaque module est déjà disponible dans l'application."
          />
          <View style={styles.grid}>
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} f={f} width={colWidth(width, cols)} index={i} />
            ))}
          </View>
        </Section>

        {/* ── AVANT / APRÈS ── */}
        <Section id="beforeafter" alt>
          <SectionTitle kicker="Avant / Après" title="Ce que change SolFerme" />
          <View style={styles2.baRow}>
            <RevealView variant="left" style={[styles.baCard, styles.baBefore]}>
              <Text style={styles.baTitle}>Avant SolFerme</Text>
              {BEFORE.map((b) => (
                <View key={b} style={styles.baItem}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#B0413E" />
                  <Text style={styles.baText}>{b}</Text>
                </View>
              ))}
            </RevealView>
            <View style={styles.baArrow}>
              <MaterialCommunityIcons name="arrow-right-bold" size={28} color={C.orange} />
            </View>
            <RevealView variant="right" delay={0.1} style={[styles.baCard, styles.baAfter]}>
              <Text style={styles.baTitle}>Avec SolFerme</Text>
              {AFTER.map((a) => (
                <View key={a} style={styles.baItem}>
                  <MaterialCommunityIcons name="check-circle" size={18} color={C.orange} />
                  <Text style={styles.baText}>{a}</Text>
                </View>
              ))}
            </RevealView>
          </View>
        </Section>

        {/* ── COMMENT ÇA MARCHE ── */}
        <Section id="how" glow="orange">
          <SectionTitle kicker="Prise en main" title="Comment ça marche" sub="Quatre étapes pour démarrer." />
          <View style={styles.grid}>
            {STEPS.map((s, i) => (
              <RevealView key={s.title} delay={i * 0.08} style={[styles.stepCard, { width: colWidth(width, cols) }]}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.desc}</Text>
              </RevealView>
            ))}
          </View>
        </Section>

        {/* ── POURQUOI ── */}
        <Section id="why" alt>
          <SectionTitle kicker="Pourquoi SolFerme" title="Pensé pour les éleveurs, pas pour les informaticiens" />
          <View style={styles.grid}>
            {WHY.map((w, i) => (
              <RevealView key={w.title} delay={(i % whyCols) * 0.07} style={[styles.whyCard, { width: colWidth(width, whyCols) }]}>
                <MaterialCommunityIcons name={w.icon as any} size={26} color={C.orange} />
                <Text style={styles.whyTitle}>{w.title}</Text>
                <Text style={styles.whyDesc}>{w.desc}</Text>
              </RevealView>
            ))}
          </View>
        </Section>

        {/* ── FAQ ── */}
        <Section id="faq">
          <SectionTitle kicker="FAQ" title="Questions fréquentes" />
          <View style={styles.faqWrap}>
            {FAQ.map((item, i) => <FaqRow key={i} item={item} index={i} />)}
          </View>
        </Section>

        {/* ── TÉLÉCHARGEMENT ── */}
        <Section id="download" alt>
          <RevealView style={styles.downloadBox}>
            <View style={kf(FLOAT, { dur: '5s', iter: 'infinite', ease: 'ease-in-out', fill: 'none' })}>
              <MaterialCommunityIcons name="cellphone-arrow-down" size={40} color={C.text} />
            </View>
            <Text style={styles.h2}>Téléchargez SolFerme</Text>
            <Text style={styles.h2sub}>
              SolFerme est une application mobile. Elle arrive très bientôt sur le Play Store —
              laissez-nous votre email ci-dessous pour être prévenu dès sa sortie.
            </Text>
            <View style={styles.storeRow}>
              <StoreBadge cfg={DOWNLOAD.android} icon="android" />
              <StoreBadge cfg={DOWNLOAD.ios} icon="apple" />
            </View>
            <CTA label="Être prévenu de la sortie" icon="email-fast-outline" shimmer onPress={() => scrollToId('contact')} />
          </RevealView>
        </Section>

        {/* ── CONTACT ── */}
        <Section id="contact" glow>
          <SectionTitle kicker="Contact" title="Une question ? Écrivez-nous" sub={`Ou par email : ${SITE.email}`} />
          <RevealView style={styles.contactCard}>
            {sent && (
              <View style={styles.successBox}>
                <MaterialCommunityIcons name="check-circle" size={20} color={C.orange} />
                <Text style={styles.successText}>Votre message a bien été envoyé. Nous vous répondrons rapidement.</Text>
              </View>
            )}
            <Field label="Nom complet" value={form.name} onChangeText={(v: string) => set('name', v)} error={errors.name} />
            <Field label="Adresse email" value={form.email} onChangeText={(v: string) => set('email', v)} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Sujet (facultatif)" value={form.subject} onChangeText={(v: string) => set('subject', v)} error={errors.subject} />
            <Field label="Message" value={form.message} onChangeText={(v: string) => set('message', v)} error={errors.message} multiline />
            <Pressable
              onPress={submit}
              disabled={sending}
              style={[styles.cta, styles.ctaPrimary, { alignSelf: 'flex-start', marginTop: 6 }, sending && { opacity: 0.7 }]}
            >
              {sending ? <ActivityIndicator color={C.text} size="small" /> : <Text style={styles.ctaText}>Envoyer le message</Text>}
            </Pressable>
          </RevealView>
        </Section>

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
          <View style={[styles.sectionInner, styles2.footerRow]}>
            <RevealView style={{ maxWidth: 320, marginBottom: 24 }}>
              <View style={styles.brand}>
                <BrandLogo size={32} shape="squircle" background="#FFFFFF" />
                <Text style={[styles.brandName, { color: '#fff', marginLeft: 10 }]}>SolFerme</Text>
              </View>
              <Text style={styles.footerAbout}>
                L'application mobile qui aide les éleveurs à gérer leur exploitation avicole simplement, efficacement et au quotidien.
              </Text>
            </RevealView>
            <RevealView delay={0.08} style={styles2.footerLinks}>
              <Text style={styles.footerColTitle}>Navigation</Text>
              {[{ id: 'top', label: 'Accueil' }, ...NAV].map((n) => (
                <Pressable key={n.id} onPress={() => scrollToId(n.id)}><Text style={styles.footerLink}>{n.label}</Text></Pressable>
              ))}
            </RevealView>
            <RevealView delay={0.16} style={styles2.footerLinks}>
              <Text style={styles.footerColTitle}>Contact</Text>
              <Pressable onPress={() => Linking.openURL(`mailto:${SITE.email}`)}><Text style={styles.footerLink}>{SITE.email}</Text></Pressable>
              <Pressable onPress={() => navigation.navigate('Login')}><Text style={styles.footerLink}>Espace utilisateur</Text></Pressable>
            </RevealView>
          </View>
          <Text style={styles.footerLegal}>{LEGAL_LINE}</Text>
        </View>
      </ScrollView>

      {/* barre de progression de lecture */}
      <View pointerEvents="none" style={[styles.progressTrack, { position: 'fixed', top: HEADER_H, left: 0, right: 0, zIndex: 99 } as any]}>
        <View style={[styles.progressBar, { width: `${Math.round(scrollPct * 100)}%` }]} />
      </View>
    </View>
  );
};

// ── Sous-composants ─────────────────────────────────────────────────────────
const FeatureCard = ({ f, width, index = 0 }: any) => {
  const [hover, setHover] = useState(false);
  const { ref, anim } = useReveal((index % 4) * 0.06);
  return (
    <Pressable
      ref={ref}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        styles.featureCard, { width }, anim,
        { transitionProperty: 'transform, border-color, box-shadow', transitionDuration: '180ms' } as any,
        hover && styles.featureCardHover,
      ]}
    >
      <View style={[styles.featureIcon, hover && ({ transform: [{ rotate: '-8deg' }, { scale: 1.08 }] } as any), { transitionProperty: 'transform', transitionDuration: '200ms' } as any]}>
        <MaterialCommunityIcons name={f.icon} size={24} color={C.text} />
      </View>
      <Text style={styles.featureTitle}>{f.title}</Text>
      <Text style={styles.featureDesc}>{f.desc}</Text>
    </Pressable>
  );
};

const FaqRow = ({ item, index = 0 }: any) => {
  const [open, setOpen] = useState(false);
  const { ref, anim } = useReveal(index * 0.04);
  return (
    <Pressable ref={ref} style={[styles.faqRow, anim]} onPress={() => setOpen((o) => !o)} accessibilityRole="button">
      <View style={styles.faqQRow}>
        <Text style={styles.faqQ}>{item.q}</Text>
        <MaterialCommunityIcons name={open ? 'minus' : 'plus'} size={20} color={C.orange} />
      </View>
      {open && <Text style={[styles.faqA, kf(REVEAL, { dur: '0.35s' })]}>{item.a}</Text>}
    </Pressable>
  );
};

const Field = ({ label, error, multiline, ...rest }: any) => {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholderTextColor={C.muted}
        style={[
          styles.input,
          multiline && { height: 120, textAlignVertical: 'top', paddingTop: 12 },
          focus && { borderColor: C.orange },
          !!error && { borderColor: '#C0392B' },
        ]}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
};

// ── Helpers responsive ──────────────────────────────────────────────────────
const contentW = (width: number) => Math.min(width, MAX_W) - 40;
const colWidth = (width: number, cols: number) => {
  const gap = 20;
  const w = contentW(width);
  return Math.floor((w - gap * (cols - 1)) / cols);
};

const makeResponsive = (width: number) => {
  const desktop = width >= 1024;
  const tablet = width >= 700 && width < 1024;
  const smallPhone = width < 400;
  return StyleSheet.create({
    h1: { fontSize: smallPhone ? 30 : desktop ? 44 : 36, lineHeight: smallPhone ? 36 : desktop ? 50 : 42 },
    heroRow: { flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: 40 },
    heroCol: { flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', maxWidth: 560 },
    heroVisual: { flex: desktop ? 1 : undefined, alignItems: 'center', justifyContent: 'center', width: '100%' },
    baRow: { flexDirection: desktop || tablet ? 'row' : 'column', alignItems: 'stretch', gap: 16, justifyContent: 'center' },
    footerRow: { flexDirection: desktop ? 'row' : 'column', justifyContent: 'space-between', gap: 24 },
    footerLinks: { marginBottom: 20, minWidth: 160 },
  });
};

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: { backgroundColor: 'rgba(255,248,236,0.92)', borderBottomWidth: 1, borderBottomColor: C.borderSoft, height: HEADER_H, justifyContent: 'center' },
  headerInner: { width: '100%', maxWidth: MAX_W, alignSelf: 'center', paddingHorizontal: 20, height: HEADER_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brandName: { fontSize: 19, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLink: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  navLinkText: { fontSize: 14.5, color: C.muted, fontWeight: '600' },
  loginBtn: { backgroundColor: C.text, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginLeft: 8 },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  burger: { padding: 8 },
  mobileMenu: { backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.borderSoft, paddingHorizontal: 20, paddingBottom: 14, gap: 2 },

  progressTrack: { height: 3, backgroundColor: 'transparent' },
  progressBar: { height: 3, backgroundColor: C.orange },

  hero: { backgroundColor: C.bg, paddingTop: 48, paddingBottom: 56, borderBottomWidth: 1, borderBottomColor: C.borderSoft, overflow: 'hidden', position: 'relative' },
  heroGlow: {
    position: 'absolute', width: 620, height: 620, borderRadius: 999, top: -260, right: -180,
    backgroundColor: 'rgba(249,215,96,0.20)',
  },
  scrollCue: { alignSelf: 'center', marginTop: 26, padding: 6, borderRadius: 999 },
  sectionInner: { width: '100%', maxWidth: MAX_W, alignSelf: 'center', paddingHorizontal: 20, position: 'relative' },
  heroBadge: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontWeight: '700', fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginBottom: 18, overflow: 'hidden' },
  h1: { fontSize: 44, lineHeight: 50, fontWeight: '900', color: C.text, marginBottom: 16 },
  heroSub: { fontSize: 17, lineHeight: 26, color: C.muted, marginBottom: 12 },
  heroAudience: { fontSize: 14, lineHeight: 20, color: C.text, fontWeight: '600', marginBottom: 24 },
  heroCtas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
  storeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  ctaPrimary: { backgroundColor: C.yellow },
  ctaGhost: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.orange },
  ctaText: { fontSize: 15, fontWeight: '800', color: C.text },

  storeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  storeBadgeDisabled: { opacity: 0.65 },
  storeBadgeSmall: { fontSize: 10, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  storeBadgeBig: { fontSize: 14, color: C.text, fontWeight: '800' },

  section: { paddingVertical: 64, backgroundColor: C.bg },
  kicker: { color: C.orange, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  h2: { fontSize: 30, lineHeight: 38, fontWeight: '900', color: C.text, textAlign: 'center', maxWidth: 720 },
  h2sub: { fontSize: 16, lineHeight: 24, color: C.muted, textAlign: 'center', marginTop: 10, maxWidth: 640 },

  problemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  problemItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16 },
  problemText: { flex: 1, fontSize: 14.5, lineHeight: 20, color: C.text },
  problemConclusion: { fontSize: 17, lineHeight: 26, color: C.muted, textAlign: 'center', marginTop: 28, maxWidth: 640, alignSelf: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center' },
  featureCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 22 },
  featureCardHover: { borderColor: C.orange, transform: [{ translateY: -3 }], shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  featureIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  featureTitle: { fontSize: 16.5, fontWeight: '800', color: C.text, marginBottom: 6 },
  featureDesc: { fontSize: 13.5, lineHeight: 20, color: C.muted },

  baCard: { flex: 1, minWidth: 260, maxWidth: 420, borderRadius: 18, padding: 24, borderWidth: 1 },
  baBefore: { backgroundColor: '#FBF1EC', borderColor: '#EAD3C6' },
  baAfter: { backgroundColor: C.surface, borderColor: C.orange },
  baArrow: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  baTitle: { fontSize: 17, fontWeight: '900', color: C.text, marginBottom: 16 },
  baItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  baText: { flex: 1, fontSize: 14.5, lineHeight: 20, color: C.text },

  stepCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 22 },
  stepNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stepNumText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  stepTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  stepDesc: { fontSize: 13.5, lineHeight: 20, color: C.muted },

  whyCard: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 22 },
  whyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12, marginBottom: 6 },
  whyDesc: { fontSize: 13.5, lineHeight: 20, color: C.muted },

  faqWrap: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  faqRow: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 16, marginBottom: 12 },
  faqQRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  faqQ: { flex: 1, fontSize: 15.5, fontWeight: '700', color: C.text },
  faqA: { fontSize: 14, lineHeight: 21, color: C.muted, marginTop: 12 },

  downloadBox: { alignItems: 'center', backgroundColor: C.yellow, borderRadius: 24, padding: 40, gap: 8 },

  contactCard: { width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 24 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.orangeSoft, borderRadius: 12, padding: 14, marginBottom: 18 },
  successText: { flex: 1, color: C.text, fontWeight: '600', fontSize: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 15, color: C.text, backgroundColor: C.bg },
  fieldError: { color: '#C0392B', fontSize: 12.5, marginTop: 5 },

  footer: { backgroundColor: C.dark, paddingTop: 48, paddingBottom: 24 },
  footerAbout: { color: '#C9C0AE', fontSize: 13.5, lineHeight: 21, marginTop: 14 },
  footerColTitle: { color: '#fff', fontWeight: '800', fontSize: 14, marginBottom: 12 },
  footerLink: { color: '#C9C0AE', fontSize: 13.5, paddingVertical: 5 },
  footerLegal: { color: '#8A8270', fontSize: 12, textAlign: 'center', marginTop: 24, borderTopWidth: 1, borderTopColor: '#3A3324', paddingTop: 20 },
});

// ── Styles de la maquette téléphone ─────────────────────────────────────────
const PHONE_W = 288;
const mock = StyleSheet.create({
  clip: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingVertical: 8 },
  stage: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingVertical: 24, paddingHorizontal: 26 },
  stageCompact: { paddingVertical: 16, paddingHorizontal: 18 },
  glow: { position: 'absolute', borderRadius: 999 },
  glowA: { width: 300, height: 300, backgroundColor: C.yellow, opacity: 0.34, top: -14, right: -34 },
  glowB: { width: 190, height: 190, backgroundColor: C.orange, opacity: 0.16, bottom: 0, left: -30 },

  phone: {
    width: PHONE_W, borderRadius: 40, backgroundColor: '#161310', padding: 8, zIndex: 2,
    borderWidth: 2, borderColor: '#242019',
    shadowColor: '#3A2E12', shadowOpacity: 0.35, shadowRadius: 40, shadowOffset: { width: -10, height: 26 },
  },
  phoneSpeaker: { position: 'absolute', top: 15, alignSelf: 'center', width: 54, height: 5, borderRadius: 3, backgroundColor: '#2C271F', zIndex: 5 },
  screen: { backgroundColor: MK.screen, borderTopLeftRadius: 33, borderTopRightRadius: 33, paddingTop: 15, paddingHorizontal: 12, paddingBottom: 8, overflow: 'hidden' },
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  statusTime: { fontSize: 8.5, fontWeight: '800', color: MK.text },
  statusIcons: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sweep: {
    position: 'absolute', top: -40, left: -60, width: 90, height: 460, backgroundColor: '#FFFFFF',
    opacity: 0, transform: [{ rotate: '20deg' }], zIndex: 20,
  },

  appHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  hello: { fontSize: 9.5, color: MK.muted, fontWeight: '600' },
  name: { fontSize: 14, color: MK.text, fontWeight: '800', marginTop: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '900', fontSize: 11.5, letterSpacing: 0.5 },
  hDivider: { height: 1, backgroundColor: MK.divider, marginBottom: 7 },

  chips: { flexDirection: 'row', gap: 6, marginBottom: 7, overflow: 'hidden' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, borderWidth: 1, borderColor: '#E6D9B8', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: MK.card },
  chipActive: { backgroundColor: MK.chipActive, borderColor: MK.chipActive },
  chipText: { fontSize: 9.5, color: MK.muted, fontWeight: '700' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 5 },
  stat: {
    width: '48.5%', backgroundColor: MK.card, borderRadius: 11, padding: 7,
    shadowColor: '#C9A24B', shadowOpacity: 0.13, shadowRadius: 7, shadowOffset: { width: 0, height: 3 },
  },
  statWide: { width: '100%' },
  statIco: { width: 17, height: 17, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 12.5, fontWeight: '900', color: MK.text },
  statValueMoney: { fontSize: 10.5 },
  statLabel: { fontSize: 8.5, color: MK.muted, fontWeight: '600', marginTop: 1 },
  statSub: { fontSize: 7.5, color: '#B7B7B7', fontWeight: '600', marginTop: 1 },

  chartCard: {
    backgroundColor: MK.card, borderRadius: 11, padding: 9, marginTop: 6,
    shadowColor: '#C9A24B', shadowOpacity: 0.13, shadowRadius: 7, shadowOffset: { width: 0, height: 3 },
  },
  chartTitle: { fontSize: 10.5, fontWeight: '800', color: MK.text },
  chartUnit: { fontSize: 8, color: MK.muted, marginTop: 1, marginBottom: 4 },
  chartArea: { height: 78, position: 'relative' },
  gridLine: { position: 'absolute', left: 22, right: 0, height: 1, backgroundColor: '#F0E7D2' },
  gridLabel: { position: 'absolute', left: -22, top: -6, width: 20, textAlign: 'right', fontSize: 7, color: '#BEB49A' },
  bars: { position: 'absolute', left: 26, right: 4, bottom: 0, top: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', flex: 1 },
  bar: { width: 24, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: MK.bar, marginBottom: 11, transformOrigin: 'bottom' },
  barValue: { fontSize: 7.5, fontWeight: '800', color: MK.text, marginBottom: 1 },
  barDay: { position: 'absolute', bottom: 0, fontSize: 8, color: MK.muted, fontWeight: '600' },
  periodRow: { flexDirection: 'row', gap: 5, marginTop: 6, justifyContent: 'center' },
  period: { borderRadius: 999, borderWidth: 1, borderColor: '#E6D9B8', paddingHorizontal: 7, paddingVertical: 2 },
  periodActive: { backgroundColor: MK.chipActive, borderColor: MK.chipActive },
  periodText: { fontSize: 8, color: MK.muted, fontWeight: '700' },
  periodTextActive: { color: MK.text, fontWeight: '800' },

  nav: {
    flexDirection: 'row', backgroundColor: MK.card, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    borderTopWidth: 1, borderTopColor: MK.divider, paddingVertical: 5, paddingHorizontal: 4,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navText: { fontSize: 6.8, color: MK.muted, fontWeight: '600' },

  toast: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 7, zIndex: 30,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
    shadowColor: '#2A2412', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 },
    borderWidth: 1, borderColor: '#F1E7CE',
  },
  toastR: { top: 34, right: 8, maxWidth: 150 },
  toastL: { bottom: 60, left: 4, maxWidth: 150 },
  toastDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toastTitle: { fontSize: 10.5, fontWeight: '800', color: C.text },
  toastSub: { fontSize: 9, color: C.muted, fontWeight: '600', marginTop: 1 },
});
