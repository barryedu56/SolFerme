import { useTheme } from '../../context/ThemeContext';
import { chartPalette } from '../ui/tokens';

export const useChartTheme = () => {
  const { isDarkMode, theme } = useTheme();
  const p = isDarkMode ? chartPalette.dark : chartPalette.light;
  return {
    ...p,
    surface: theme.colors.surface,
    ink: theme.colors.text,
    inkSoft: theme.colors.textSecondary,
  };
};

export const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(abs >= 1e10 ? 0 : 1).replace('.0', '') + ' Md';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 1e7 ? 0 : 1).replace('.0', '') + ' M';
  if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 1e4 ? 0 : 1).replace('.0', '') + ' k';
  return String(Math.round(n));
};

/** "nice" upper bound + tick step for an axis. */
export const niceScale = (max: number, ticks = 4): { top: number; step: number } => {
  if (max <= 0) return { top: 1, step: 1 };
  const rawStep = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  return { top: Math.ceil(max / step) * step, step };
};
