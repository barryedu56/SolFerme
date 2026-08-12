/**
 * Calcule la performance globale d'un lot basée sur la production, la survie et la santé.
 *
 * @param initialQuantity Nombre initial de poules
 * @param currentQuantity Nombre actuel de poules vivantes
 * @param sickQuantity Nombre actuel de poules malades
 * @param actualProduction Production réelle (en nombre d'œufs, pas en casiers)
 * @param days Période sur laquelle la production est calculée (par défaut 1 jour)
 * @param expectedRate Taux de ponte attendu (par défaut 0.85 soit 85%)
 * @returns Performance entre 0 et 100
 */
export const calculatePerformance = (
  initialQuantity: number,
  currentQuantity: number,
  sickQuantity: number,
  actualProduction: number,
  days: number = 1,
  expectedRate: number = 0.85
): number => {
  // Sécurisation des entrées pour éviter NaN
  const initQ = Number(initialQuantity) || 0;
  const currQ = Number(currentQuantity) || 0;
  const sickQ = Number(sickQuantity) || 0;
  const prod = Number(actualProduction) || 0;
  const d = Math.max(1, Number(days) || 1);

  if (initQ <= 0 || currQ <= 0) return 0;

  // 1. Taux de survie
  const survivalRate = Math.min(currQ / initQ, 1);

  // 2. Production attendue basée sur les poules vivantes
  const expectedProduction = currQ * expectedRate * d;

  // 3. Performance de production (réel / attendu)
  const productionPerf = expectedProduction > 0
    ? Math.min(prod / expectedProduction, 1.1)
    : 0;

  // 4. Impact des maladies
  const healthFactor = Math.max(0, (currQ - (sickQ * 0.5)) / currQ);

  // 5. Formule Globale
  let performance = productionPerf * survivalRate * healthFactor * 100;

  return Math.max(0, Math.min(Math.round(performance || 0), 100));
};

export const getPerformanceLabel = (performance: number, t?: any): { label: string, color: string } => {
  if (performance >= 95) return { label: t ? t('performance.good') : 'Très bonne', color: '#4CAF50' };
  if (performance >= 80) return { label: t ? t('performance.average') : 'Moyenne', color: '#FBC02D' };
  return { label: t ? t('performance.bad') : 'À surveiller', color: '#F44336' };
};
