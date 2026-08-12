export const TASK_TYPES = [
  { id: 'SANTE', label: 'Santé', icon: 'medical-services' },
  { id: 'ALIMENTATION', label: 'Alimentation', icon: 'restaurant' },
  { id: 'PRODUCTION', label: 'Production', icon: 'egg' },
  { id: 'ENTRETIEN', label: 'Entretien', icon: 'cleaning-services' },
  { id: 'GESTION_LOT', 'label': 'Gestion lot', icon: 'inventory' },
  { id: 'AUTRE', label: 'Autre', icon: 'more-horiz' },
];

export const TASK_TITLES_BY_TYPE: Record<string, string[]> = {
  SANTE: [
    'Traitement',
    'Vaccination',
    'Contrôle santé',
    'Distribution médicament',
  ],
  ALIMENTATION: [
    'Préparation aliment',
    'Distribution aliment',
  ],
  PRODUCTION: [
    'Ramassage œufs',
    'Tri œufs',
    'Contrôle production',
  ],
  ENTRETIEN: [
    'Nettoyage bâtiment',
    'Nettoyage matériel',
    'Désinfection',
  ],
  GESTION_LOT: [
    'Comptage poules',
    'Contrôle mortalité',
    'Contrôle malades',
  ],
  AUTRE: [
    'Autre tâche',
  ],
};
