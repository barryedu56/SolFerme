/**
 * Utilitaire de gestion des périodes de paie selon la périodicité de l'employé.
 * Gère MENSUEL, SEMESTRIEL, ANNUEL.
 */

export interface PeriodInfo {
  periodKey: string;
  periodLabel: string;
}

const MONTH_NAMES_FR = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const MONTH_NAMES_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Calcule la clé canonique de période (ex: "2026-10", "2026-S2", "2026")
 * et le libellé utilisateur lisible.
 */
export const getPeriodInfo = (
  frequency: string = 'MENSUEL',
  dateStr?: string | Date,
  locale: string = 'fr'
): PeriodInfo => {
  let date: Date;

  if (!dateStr) {
    date = new Date();
  } else if (typeof dateStr === 'string') {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      date = new Date(dateStr);
    }
  } else {
    date = dateStr;
  }

  if (isNaN(date.getTime())) {
    date = new Date();
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const freq = (frequency || 'MENSUEL').toUpperCase();
  const isFr = locale === 'fr';

  let periodKey = '';
  let periodLabel = '';

  if (freq === 'SEMESTRIEL') {
    if (month <= 6) {
      periodKey = `${year}-S1`;
      periodLabel = isFr ? `Janvier → Juin ${year}` : `January → June ${year}`;
    } else {
      periodKey = `${year}-S2`;
      periodLabel = isFr ? `Juillet → Décembre ${year}` : `July → December ${year}`;
    }
  } else if (freq === 'ANNUEL') {
    periodKey = `${year}`;
    periodLabel = isFr ? `Année ${year}` : `Year ${year}`;
  } else {
    // MENSUEL
    const monthPadded = month.toString().padStart(2, '0');
    periodKey = `${year}-${monthPadded}`;
    const monthNames = isFr ? MONTH_NAMES_FR : MONTH_NAMES_EN;
    const monthName = monthNames[month] || `Mois ${month}`;
    periodLabel = `${monthName} ${year}`;
  }

  return { periodKey, periodLabel };
};

/**
 * Normalise un period_key ou un mois existant si non renseigné.
 */
export const normalizePeriodKey = (
  frequency: string,
  dateStr?: string,
  existingMonth?: string,
  existingPeriodKey?: string
): string => {
  if (existingPeriodKey && existingPeriodKey.trim() !== '') {
    return existingPeriodKey.trim();
  }

  if (existingMonth) {
    const m = existingMonth.trim();
    if (/^\d{4}-\d{2}$/.test(m) || /^\d{4}-S[12]$/.test(m) || /^\d{4}$/.test(m)) {
      return m;
    }
  }

  return getPeriodInfo(frequency, dateStr).periodKey;
};
