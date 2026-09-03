/**
 * Jetons de design partagés — cohérence sur TOUS les écrans (Android · web · iOS).
 * Ne remplace pas `theme` (couleurs) : complète avec l'échelle d'espacement,
 * les rayons, les ombres douces et la largeur de contenu standardisée.
 */
import { Platform } from 'react-native';

/** Largeur maximale du contenu — UNE seule valeur pour les listes / tableaux de
 *  bord, une pour les formulaires & pages de détail. Fini les vues web à 1000px
 *  à côté de vues à 500px. */
export const CONTENT_MAX = 1080;   // listes, dashboards, grilles
export const CONTENT_MAX_NARROW = 760; // formulaires, détails, réglages

export const GUTTER = 16;          // marge horizontale mobile
export const GUTTER_WIDE = 24;     // marge horizontale ≥ tablette

export const space = {
  xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 28, xxl: 40,
};

export const radius = {
  sm: 10, md: 14, lg: 18, xl: 24, pill: 999,
};

/** Ombres douces et modernes (subtiles, pas de "boîte lourde"). */
export const shadow = {
  none: {},
  xs: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(15,23,42,0.06)' } as any,
    default: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  }),
  sm: Platform.select({
    web: { boxShadow: '0 4px 12px rgba(15,23,42,0.07)' } as any,
    default: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  }),
  md: Platform.select({
    web: { boxShadow: '0 10px 28px rgba(15,23,42,0.10)' } as any,
    default: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  }),
} as const;

export const typography = {
  h1: { fontSize: 26, fontWeight: '800' as const, letterSpacing: 0.2 },
  h2: { fontSize: 20, fontWeight: '800' as const },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14.5, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
};

/**
 * Palettes de graphiques — VALIDÉES pour le daltonisme (script dataviz).
 * Le texte des graphiques garde toujours l'encre du thème, jamais la couleur de série.
 */
export const chartPalette = {
  light: {
    surface: '#FFFFFF',
    grid: 'rgba(15,23,42,0.08)',
    axis: 'rgba(15,23,42,0.35)',
    ink: '#1A1A1A',
    inkSoft: '#5C5C5C',
    single: '#F57C00',
    categorical: ['#F57C00', '#1E88E5', '#43A047', '#8E24AA', '#00897B', '#5E35B1'],
    income: '#00897B',
    expense: '#D84315',
    positive: '#2E7D32',
    negative: '#C62828',
  },
  dark: {
    surface: '#1E1E1E',
    grid: 'rgba(255,255,255,0.10)',
    axis: 'rgba(255,255,255,0.35)',
    ink: '#F5F5F5',
    inkSoft: '#AAAAAA',
    single: '#FB8C00',
    categorical: ['#E65100', '#2196F3', '#43A047', '#AB47BC', '#00897B', '#5C6BC0'],
    income: '#009688',
    expense: '#F4511E',
    positive: '#66BB6A',
    negative: '#EF5350',
  },
};
