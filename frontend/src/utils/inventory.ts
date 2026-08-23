export const isNormalEgg = (type: string): boolean => {
  if (!type) return false;
  const normalizedType = type.trim().toUpperCase();
  const normalVariants = [
    'NORMAL',
    'ŒUFS NORMAUX',
    'OEUFS NORMAUX',
    'OEUFS',
    'NORMAL EGGS',
    'NORMAUX',
    'NORMAL TRAYS',
    'CASIERS NORMAUX'
  ];
  return normalVariants.includes(normalizedType);
};

export const isBrokenEgg = (type: string): boolean => {
  if (!type) return false;
  const normalizedType = type.trim().toUpperCase();
  const brokenVariants = [
    'BROKEN',
    'ŒUFS CASSÉS',
    'OEUFS CASSÉS',
    'BROKEN EGGS',
    'CASSÉS',
    'CASSES',
    'BROKEN TRAYS',
    'CASIERS CASSÉS'
  ];
  return brokenVariants.includes(normalizedType);
};

export interface StockData {
  productions: any[];
  sales: any[];
  lotId: number | string;
  /** Conversions de casiers (EN_ATTENTE → VENDABLE). En option : si absent, le calcul ignore les conversions. */
  conversions?: any[];
}

const isActiveStatus = (value: any) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'ACTIF' || normalized === 'ACTIVE';
};

export const calculateAvailableStock = (data: StockData, productType: string, excludeSaleId?: number | string) => {
  const { productions, sales, conversions = [], lotId } = data;
  const targetLotId = Number(lotId);

  if (isNaN(targetLotId)) return 0;

  const getLotId = (item: any) => {
    const raw = item?.lot_id ?? item?.lot;
    if (typeof raw === 'object' && raw !== null) return Number(raw.id);
    return Number(raw);
  };

  let totalProduced = productions
    .filter((p: any) => getLotId(p) === targetLotId && isActiveStatus(p.status))
    .reduce((sum: number, p: any) => {
      if (isNormalEgg(productType)) return sum + (Number(p.casiers_vendables) || 0);
      if (isBrokenEgg(productType)) return sum + ((Number(p.oeufs_casses) || 0) / 30);
      return sum;
    }, 0);

  // Les conversions de casiers (EN_ATTENTE → VENDABLE) augmentent le stock vendable
  // disponible pour les œufs normaux. Seules les conversions ACTIVES comptent.
  // Elles sont ignorées pour les œufs cassés (les conversions ne produisent pas de cassés).
  if (isNormalEgg(productType)) {
    const convertedToVendable = conversions
      .filter((c: any) => {
        if (getLotId(c) !== targetLotId) return false;
        const status = (c?.status || 'ACTIVE').toUpperCase();
        const toState = (c?.to_state || '').toUpperCase();
        return (status === 'ACTIF' || status === 'ACTIVE') && toState === 'VENDABLE';
      })
      .reduce((sum: number, c: any) => sum + (Number(c.quantity) || 0), 0);
    totalProduced += convertedToVendable;
  }

  const totalSold = sales
    .filter((s: any) => {
      const isSameLot = getLotId(s) === targetLotId;
      const isActive = isActiveStatus(s.status);
      const isNotExcluded = excludeSaleId ? Number(s.id) !== Number(excludeSaleId) : true;
      return isSameLot && isActive && isNotExcluded;
    })
    .filter((s: any) => {
      if (isNormalEgg(productType)) return isNormalEgg(s.product_type);
      if (isBrokenEgg(productType)) return isBrokenEgg(s.product_type);
      return false;
    })
    .reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);

  return Math.max(0, totalProduced - totalSold);
};
