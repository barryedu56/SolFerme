import { Platform } from 'react-native';
import { useBreakpoint } from './useBreakpoint';

/**
 * Action du bouton « menu » (☰) des écrans du tiroir.
 *
 * Renvoie `undefined` UNIQUEMENT quand la barre latérale web (DesktopSidebar)
 * est visible, c.-à-d. web ET écran ≥ tablette : le menu y est déjà affiché.
 * Partout ailleurs — Android, iOS, ET le web sur téléphone (PWA iPhone) — il
 * faut le bouton, sinon l'écran n'a aucun moyen d'en sortir (une PWA installée
 * sur iPhone n'a pas de bouton « précédent »). Avant, on testait seulement
 * `Platform.OS !== 'web'`, ce qui bloquait l'utilisateur web sur téléphone dans
 * Paramètres, Aide, Rappels…
 */
export const useDrawerMenu = (navigation: any): (() => void) | undefined => {
  const { isDesktopOrTablet } = useBreakpoint();
  if (Platform.OS === 'web' && isDesktopOrTablet) return undefined;
  return () => navigation?.openDrawer?.();
};
