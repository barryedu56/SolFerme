/**
 * Contenu du site vitrine SolFerme (WEB uniquement).
 * Source unique de vérité pour la copie — aligné sur les fonctionnalités
 * RÉELLES de l'application (fermes/lots, production d'œufs, alimentation &
 * stocks, santé, équipe & tâches, ventes & finances, rappels, offline-first).
 */

export const SITE = {
  name: 'SolFerme',
  tagline: 'Votre élevage, simplement maîtrisé.',
  intro:
    "L'application mobile de gestion d'élevage avicole qui aide les éleveurs à suivre leur production, leur alimentation, la santé du troupeau, leurs équipes et leurs finances — depuis une seule application, même sans connexion.",
  audience: "Aviculteurs, éleveurs de poules pondeuses et exploitations avicoles — pensé pour l'Afrique de l'Ouest et le contexte guinéen.",
  email: 'support@solferme.com',
  metaDescription:
    "SolFerme — application mobile de gestion d'élevage avicole : suivi de la production d'œufs, alimentation et stocks, santé du troupeau, employés, ventes et finances. Fonctionne hors-ligne. Pensée pour les éleveurs d'Afrique de l'Ouest.",
};

/**
 * Disponibilité réelle des applications. Aucune URL inventée : tant que
 * `url` est null, le site affiche « bientôt disponible » (pas de faux lien).
 */
export const DOWNLOAD = {
  android: { available: false as boolean, url: null as string | null, label: 'Bientôt sur Android' },
  ios: { available: false as boolean, url: null as string | null, label: 'Prochainement sur iOS' },
};

export const NAV = [
  { id: 'features', label: 'Fonctionnalités' },
  { id: 'how', label: 'Comment ça marche' },
  { id: 'faq', label: 'FAQ' },
  { id: 'download', label: 'Télécharger' },
  { id: 'contact', label: 'Contact' },
];

export const PROBLEMS = [
  'Informations dispersées entre cahiers, carnets et têtes',
  'Calculs de stocks et de coûts faits à la main',
  'Difficile de savoir combien de casiers sont réellement disponibles',
  'Traitements et rappels de vaccination oubliés',
  'Ventes, créances et dépenses impossibles à suivre au quotidien',
  'Aucune vision claire de la rentabilité de chaque lot',
];

export const FEATURES = [
  {
    icon: 'home-group',
    title: 'Fermes & lots',
    desc: "Créez vos fermes, organisez vos lots de pondeuses, suivez l'effectif, la performance et le cycle de vie de chaque lot.",
  },
  {
    icon: 'egg',
    title: "Production d'œufs",
    desc: 'Enregistrez chaque collecte : casiers produits, vendables, cassés. Convertissez les œufs en attente et suivez le stock disponible.',
  },
  {
    icon: 'silo',
    title: 'Alimentation & stocks',
    desc: "Achats d'aliments, préparations de mélanges, distributions par lot — l'inventaire des matières premières et de l'aliment préparé se met à jour tout seul.",
  },
  {
    icon: 'medical-bag',
    title: 'Santé du troupeau',
    desc: 'Traitements et soins vétérinaires, déclarations de maladies, guérisons et mortalités. Stock de produits de santé suivi automatiquement.',
  },
  {
    icon: 'account-hard-hat',
    title: 'Équipe & tâches',
    desc: 'Gérez vos employés, assignez des tâches, enregistrez les présences, calculez la paie et les primes.',
  },
  {
    icon: 'cash-multiple',
    title: 'Ventes & finances',
    desc: "Ventes d'œufs et de poules, encaissements et créances, dépenses par ferme et par lot, bénéfice net.",
  },
  {
    icon: 'bell-ring',
    title: 'Rappels & alertes',
    desc: 'Rappels programmés et alertes santé automatiques dès qu\'un événement important survient sur un lot.',
  },
  {
    icon: 'chart-box',
    title: 'Statistiques & historique',
    desc: "Tableaux de bord, tendances de production et de finances, et un historique complet de toutes les opérations.",
  },
];

export const BEFORE = [
  'Cahiers et carnets papier',
  'Calculs manuels',
  'Informations éparpillées',
  'Oublis de traitements',
  'Stocks approximatifs',
  'Rentabilité floue',
];

export const AFTER = [
  'Données centralisées dans une seule app',
  'Stocks et coûts calculés automatiquement',
  'Historique complet et consultable',
  'Rappels et alertes santé',
  'Statistiques par ferme et par lot',
  'Vision claire de chaque exploitation',
];

export const STEPS = [
  { title: "Installez l'application", desc: 'SolFerme s\'installe sur votre téléphone Android en quelques secondes.' },
  { title: 'Créez votre compte', desc: 'Un compte propriétaire suffit pour démarrer. Vos employés reçoivent ensuite leurs accès.' },
  { title: 'Ajoutez votre ferme et vos lots', desc: 'Renseignez votre exploitation, vos lots de pondeuses et leur effectif.' },
  { title: 'Gérez votre élevage au quotidien', desc: 'Production, alimentation, santé, ventes, équipe — tout au même endroit, même hors-ligne.' },
];

export const WHY = [
  { icon: 'gesture-tap', title: 'Simple', desc: 'Une interface pensée pour le terrain, utilisable par tous les membres de l\'équipe.' },
  { icon: 'layers', title: 'Centralisé', desc: 'Fini les cahiers éparpillés : toute l\'exploitation dans une seule application.' },
  { icon: 'wifi-off', title: 'Hors-ligne', desc: 'Continuez à travailler sans réseau ; tout se synchronise dès la connexion revenue.' },
  { icon: 'clock-fast', title: 'Gain de temps', desc: 'Les stocks, coûts et statistiques se calculent automatiquement.' },
  { icon: 'history', title: 'Traçable', desc: 'Chaque opération est historisée : production, ventes, soins, mouvements.' },
  { icon: 'lightbulb-on', title: 'Aide à la décision', desc: 'Des chiffres clairs pour piloter la rentabilité de chaque lot.' },
];

export const FAQ = [
  {
    q: "Qu'est-ce que SolFerme ?",
    a: "SolFerme est une application mobile de gestion d'élevage avicole (poules pondeuses). Elle centralise la production d'œufs, l'alimentation et les stocks, la santé du troupeau, la gestion des employés, ainsi que les ventes et les finances de l'exploitation.",
  },
  {
    q: 'À qui s\'adresse SolFerme ?',
    a: "Aux aviculteurs, aux éleveurs de poules pondeuses et aux exploitations avicoles, principalement en Afrique de l'Ouest et particulièrement en Guinée.",
  },
  {
    q: 'Sur quelles plateformes SolFerme fonctionne-t-il ?',
    a: "SolFerme est avant tout une application mobile pour Android (bientôt disponible), et prochainement iOS. Une version web est également accessible depuis un navigateur.",
  },
  {
    q: 'Peut-on gérer plusieurs fermes ?',
    a: "Oui. Un propriétaire peut créer et gérer plusieurs fermes, chacune avec ses lots, ses employés, ses stocks et ses finances.",
  },
  {
    q: 'Peut-on utiliser SolFerme sans connexion Internet ?',
    a: "Oui. SolFerme fonctionne hors-ligne : vous continuez à enregistrer la production, les ventes, les soins, l'alimentation, etc. Dès que la connexion revient, tout se synchronise automatiquement, sans doublon.",
  },
  {
    q: 'Mes données sont-elles protégées ?',
    a: "Oui. Chaque exploitation ne voit que ses propres données. L'accès est protégé par mot de passe et par une connexion sécurisée. Les employés n'accèdent qu'aux informations qui les concernent.",
  },
  {
    q: 'Comment télécharger l\'application ?',
    a: "L'application arrive très bientôt sur le Play Store. Laissez-nous votre adresse email via le formulaire de contact pour être prévenu dès sa sortie.",
  },
];

export const LEGAL_LINE = `© ${new Date().getFullYear()} SolFerme. Tous droits réservés.`;
