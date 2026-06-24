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
  if (initialQuantity <= 0 || currentQuantity <= 0) return 0;

  // 1. Taux de survie
  const survivalRate = currentQuantity / initialQuantity;

  // 2. Production attendue basée sur les poules vivantes
  const expectedProduction = currentQuantity * expectedRate * days;

  // 3. Performance de production (réel / attendu)
  // On limite à 1.1 (110%) pour éviter des scores aberrants si surproduction exceptionnelle
  const productionPerf = expectedProduction > 0
    ? Math.min(actualProduction / expectedProduction, 1.1)
    : 0;

  // 4. Impact des maladies
  // On réduit la performance proportionnellement au nombre de malades
  // Chaque poule malade réduit le facteur santé.
  // Si 100% sont malades, le facteur est 0.5 (on ne tombe pas à 0 car elles sont vivantes)
  const healthFactor = (currentQuantity - (sickQuantity * 0.5)) / currentQuantity;

  // 5. Formule Globale
  // Performance = (Production Perf) * (Survival Rate) * (Health Factor) * 100
  let performance = productionPerf * survivalRate * healthFactor * 100;

  // Limiter entre 0 et 100
  return Math.max(0, Math.min(Math.round(performance), 100));
};

export const getPerformanceLabel = (performance: number): { label: string, color: string } => {
  if (performance >= 95) return { label: 'Très bonne', color: '#4CAF50' };
  if (performance >= 80) return { label: 'Moyenne', color: '#FBC02D' };
  return { label: 'À surveiller', color: '#F44336' };
};
