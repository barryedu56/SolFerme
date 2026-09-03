/**
 * Kit visuel partagé par les écrans d'authentification WEB uniquement
 * (LoginScreen.web.tsx, RegisterScreen.web.tsx, ForgotPasswordScreen.web.tsx).
 * Résolu uniquement via l'import de ces fichiers `.web.tsx` — jamais chargé
 * sur Android/iOS, qui gardent leurs écrans `.tsx` d'origine inchangés.
 *
 * Direction visuelle : composition à deux volets plate et contrastée
 * (jaune plein / blanc / noir), inspirée d'un template "Welcome Back"
 * — badge circulaire, gros aplat de couleur, bouton pilule noir, retour
 * via une icône fermeture (×) plutôt qu'une flèche. Palette volontairement
 * fixe (indépendante du thème clair/sombre) pour rester cohérente avec la
 * landing page publique (WelcomeScreen.web.tsx).
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  useWindowDimensions, Platform, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { BrandLogo } from '../../components/BrandLogo';
import { passwordChecks } from '../../components/PasswordStrengthBar';

export const C = {
  bg: '#FFF8EC',
  surface: '#FFFFFF',
  yellow: '#F9D760',
  yellowDark: '#E7C238',
  orange: '#F57C00',
  orangeSoft: '#FFF1E0',
  black: '#171410',
  text: '#1A1A1A',
  muted: '#5C5C5C',
  border: '#EAD196',
  borderSoft: '#F0E4C4',
  dark: '#2A2419',
  danger: '#C6402F',
  dangerSoft: '#FDECEA',
};

const PANEL_BREAK = 900;

/* ═══════════════════════ Bouton fermeture (retour) ═══════════════════════
 * Remplace la traditionnelle flèche "back" par une icône de fermeture (×),
 * conformément à la direction demandée — cohérent avec le vocabulaire visuel
 * du gabarit de référence (le retour se fait en "fermant" l'écran, pas en
 * "reculant" dedans). */
export const CloseButton: React.FC<{ onPress: () => void; dark?: boolean }> = ({ onPress, dark }) => {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      hitSlop={8}
      style={[
        s.closeBtn,
        dark ? { backgroundColor: hover ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)' } : { backgroundColor: hover ? C.orangeSoft : C.bg },
      ]}
      accessibilityLabel="Retour au site"
    >
      <MaterialIcons name="close" size={18} color={dark ? '#FFFFFF' : C.text} />
    </Pressable>
  );
};

/* ═══════════════════════ AuthWebShell ═══════════════════════ */
export const AuthWebShell: React.FC<{
  onBackHome: () => void;
  eyebrow: string;
  headline: string;
  bullets: { icon: string; text: string }[];
  children: React.ReactNode;
}> = ({ onBackHome, eyebrow, headline, bullets, children }) => {
  const { width } = useWindowDimensions();
  const showPanel = width >= PANEL_BREAK;

  return (
    <View style={s.root}>
      {showPanel && (
        <View style={s.panel}>
          <View style={s.ring} />

          <View style={s.panelBrand}>
            <View style={s.badge}>
              <BrandLogo size={34} shape="squircle" background="#FFFFFF" />
            </View>
            <Text style={s.panelBrandName}>SolFerme</Text>
          </View>

          <View style={s.panelBody}>
            <View style={s.eyebrowChip}>
              <View style={s.eyebrowDot} />
              <Text style={s.eyebrowTxt}>{eyebrow}</Text>
            </View>
            <Text style={s.headline}>{headline}</Text>

            <View style={{ marginTop: 26, gap: 13 }}>
              {bullets.map((b, i) => (
                <View key={i} style={s.bulletRow}>
                  <View style={s.bulletIcon}>
                    <MaterialCommunityIcons name={b.icon as any} size={17} color="#FFFFFF" />
                  </View>
                  <Text style={s.bulletTxt}>{b.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Bouton de retour : pilule noire pleine, pas de flèche — l'action
              "quitter cette page" est explicite et lisible, dans l'esprit du
              gabarit de référence. */}
          <Pressable
            onPress={onBackHome}
            style={({ hovered }: any) => [s.panelBackBtn, hovered && { backgroundColor: '#000000' }]}
          >
            <MaterialIcons name="storefront" size={17} color="#FFFFFF" />
            <Text style={s.panelBackBtnText}>Retour au site</Text>
          </Pressable>
        </View>
      )}

      <View style={s.formSide}>
        <ScrollView contentContainerStyle={s.formScroll} showsVerticalScrollIndicator={false}>
          {!showPanel && (
            <View style={s.mobileBrand}>
              <BrandLogo size={34} shape="squircle" background={C.surface} />
              <Text style={s.mobileBrandName}>SolFerme</Text>
            </View>
          )}
          <View style={s.card}>
            <CloseButton onPress={onBackHome} />
            {children}
          </View>
          <Text style={s.legal}>© {new Date().getFullYear()} SolFerme — Tous droits réservés.</Text>
        </ScrollView>
      </View>
    </View>
  );
};

/* ═══════════════════════ Champs ═══════════════════════ */
export const WebField: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  icon: string;
  placeholder?: string;
  error?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  autoCorrect?: boolean;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  maxLength?: number;
  autoFocus?: boolean;
}> = ({ label, value, onChangeText, icon, placeholder, error, onSubmitEditing, ...rest }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.fieldWrap, focused && s.fieldWrapFocused, !!error && s.fieldWrapError]}>
        <MaterialIcons name={icon as any} size={19} color={focused ? C.text : C.muted} style={{ marginRight: 10 }} />
        <TextInput
          style={s.input}
          placeholder={placeholder}
          placeholderTextColor="#B8AE99"
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={false}
          {...rest}
        />
      </View>
      {!!error && <Text style={s.fieldError}>{error}</Text>}
    </View>
  );
};

export const WebPasswordField: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
}> = ({ label, value, onChangeText, placeholder, error, onSubmitEditing, ...rest }) => {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.fieldWrap, focused && s.fieldWrapFocused, !!error && s.fieldWrapError]}>
        <MaterialIcons name="lock-outline" size={19} color={focused ? C.text : C.muted} style={{ marginRight: 10 }} />
        <TextInput
          style={s.input}
          placeholder={placeholder}
          placeholderTextColor="#B8AE99"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={false}
          {...rest}
        />
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} style={{ padding: 2 }}>
          <MaterialCommunityIcons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={C.muted} />
        </Pressable>
      </View>
      {!!error && <Text style={s.fieldError}>{error}</Text>}
    </View>
  );
};

/* ═══════════════════════ Bouton ═══════════════════════ */
export const WebButton: React.FC<{
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  variant?: 'primary' | 'ghost';
}> = ({ title, onPress, loading, disabled, icon, variant = 'primary' }) => {
  const [hover, setHover] = useState(false);
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        s.btn,
        primary ? { backgroundColor: hover ? C.yellowDark : C.yellow } : { backgroundColor: hover ? C.orangeSoft : 'transparent', borderWidth: 1.5, borderColor: C.border },
        (disabled || loading) && { opacity: 0.6 },
        { transform: [{ translateY: hover && !loading ? -1 : 0 }] },
      ]}
    >
      {loading ? <ActivityIndicator color={C.text} size="small" /> : (
        <>
          {icon && <MaterialIcons name={icon as any} size={19} color={primary ? C.text : C.orange} style={{ marginRight: 8 }} />}
          <Text style={[s.btnText, !primary && { color: C.orange }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
};

/* ═══════════════════════ Erreur globale ═══════════════════════ */
export const WebErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <View style={s.errorBox}>
    <MaterialIcons name="error-outline" size={17} color={C.danger} />
    <Text style={s.errorBoxText}>{message}</Text>
  </View>
);

/* ═══════════════════════ Force du mot de passe ═══════════════════════ */
export const WebPasswordStrength: React.FC<{ value: string }> = ({ value }) => {
  if (!value) return null;
  const checks = passwordChecks(value);
  const score = Object.values(checks).filter(Boolean).length;
  const levels = [
    { label: '', color: C.border },
    { label: 'Très faible', color: '#D32F2F' },
    { label: 'Faible', color: C.orange },
    { label: 'Moyen', color: '#D4A017' },
    { label: 'Bon', color: '#7CB342' },
    { label: 'Fort', color: '#2E7D32' },
  ];
  const lvl = levels[score];
  const items: [keyof typeof checks, string][] = [
    ['length', '8 caractères'], ['upper', 'Majuscule'], ['lower', 'Minuscule'],
    ['digit', 'Chiffre'], ['special', 'Caractère spécial'],
  ];
  return (
    <View style={{ marginTop: -6, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < score ? lvl.color : C.border }} />
        ))}
      </View>
      {!!lvl.label && <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 6, color: lvl.color }}>{lvl.label}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {items.map(([key, text]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', width: 12, textAlign: 'center', color: checks[key] ? '#2E7D32' : C.muted }}>
              {checks[key] ? '✓' : '•'}
            </Text>
            <Text style={{ fontSize: 12, color: checks[key] ? C.text : C.muted }}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/* ═══════════════════════ Divers ═══════════════════════ */
export const WebLink: React.FC<{ label: string; onPress: () => void; bold?: boolean }> = ({ label, onPress, bold }) => {
  const [hover, setHover] = useState(false);
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} hitSlop={8}>
      <Text style={[s.linkText, bold && { fontWeight: '800', color: C.orange }, hover && { textDecorationLine: 'underline' }]}>{label}</Text>
    </Pressable>
  );
};

export const WebFormTitle: React.FC<{ icon: string; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <View style={{ marginBottom: 22, marginTop: 4, paddingRight: 34 }}>
    <View style={s.formTitleRow}>
      <View style={s.formTitleIcon}>
        <MaterialIcons name={icon as any} size={17} color={C.text} />
      </View>
      <Text style={s.formTitle}>{title}</Text>
    </View>
    {!!subtitle && <Text style={s.formSubtitle}>{subtitle}</Text>}
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg, minHeight: '100%' as any },

  // Panneau marketing — aplat jaune plein, composition franche et contrastée.
  panel: {
    width: '42%', maxWidth: 520, minHeight: '100%' as any, padding: 44,
    backgroundColor: C.yellow, justifyContent: 'space-between', overflow: 'hidden',
  },
  ring: {
    position: 'absolute', width: 460, height: 460, borderRadius: 230,
    borderWidth: 90, borderColor: 'rgba(255,255,255,0.14)', top: -160, right: -180,
  },
  panelBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: C.black,
    alignItems: 'center', justifyContent: 'center',
  },
  panelBrandName: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  panelBody: { maxWidth: 400 },
  eyebrowChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    backgroundColor: C.black, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, marginBottom: 20,
  },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.yellow },
  eyebrowTxt: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase' },
  headline: { fontSize: 36, fontWeight: '900', color: C.text, lineHeight: 42, letterSpacing: -0.8 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulletIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  bulletTxt: { fontSize: 14.5, fontWeight: '700', color: C.text, flex: 1 },

  panelBackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    alignSelf: 'flex-start', backgroundColor: C.black, paddingHorizontal: 22, height: 48, borderRadius: 999,
  },
  panelBackBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },

  // Colonne formulaire
  formSide: { flex: 1 },
  formScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingVertical: 40 },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22, alignSelf: 'center' },
  mobileBrandName: { fontSize: 19, fontWeight: '800', color: C.text },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: C.surface, borderRadius: 20,
    padding: 34, borderWidth: 1.5, borderColor: C.text,
    ...(Platform.OS === 'web' ? { boxShadow: '6px 6px 0 0 rgba(23,20,16,0.9)' } as any : {}),
  },
  legal: { textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 22, opacity: 0.8 },

  // Bouton fermeture
  closeBtn: {
    position: 'absolute', top: -14, right: -14, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.text,
  },

  // Titre de formulaire
  formTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formTitleIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center' },
  formTitle: { fontSize: 21, fontWeight: '800', color: C.text },
  formSubtitle: { fontSize: 13.5, color: C.muted, marginTop: 8, lineHeight: 19 },

  // Champs
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 7, marginLeft: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldWrap: {
    flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 13,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: '#FFFDF8', paddingHorizontal: 14,
  },
  fieldWrapFocused: { borderColor: C.text, backgroundColor: '#FFFFFF' },
  fieldWrapError: { borderColor: C.danger },
  input: {
    flex: 1, fontSize: 14.5, color: C.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
  },
  fieldError: { fontSize: 12, color: C.danger, marginTop: 6, marginLeft: 2, fontWeight: '600' },

  // Bouton
  btn: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { fontSize: 15, fontWeight: '800', color: C.text, letterSpacing: 0.2 },

  // Erreur globale
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerSoft,
    borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: C.danger,
  },
  errorBoxText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.danger },

  linkText: { fontSize: 13.5, color: C.muted, fontWeight: '600' },
});
