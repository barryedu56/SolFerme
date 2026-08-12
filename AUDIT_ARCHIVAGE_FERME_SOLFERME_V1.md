# Audit du Système d'Archivage des Fermes - SolFerme V1

## 1. Objectifs
Remplacer la suppression définitive systématique par un système de suppression conditionnelle et d'archivage sécurisé. L'objectif est de permettre la suppression des éléments créés par erreur (sans données) tout en imposant l'archivage dès qu'un historique métier existe.

## 2. Modifications Backend (Django)

### Modèles Farm & Lot
- Utilisation du champ `status` (ACTIF, ARCHIVE, TERMINE pour les lots).
- Ajout du champ calculé `has_data` dans les sérialiseurs pour informer le frontend de la présence d'historique (productions, ventes, mouvements, etc.).

### ViewSets (FarmViewSet & LotViewSet)
- **Validation `destroy`** : La méthode `destroy` vérifie exhaustivement si l'élément possède des relations liées.
  - Si `has_data` est `True` : La suppression (`DELETE`) est rejetée avec un message explicite invitant à l'archivage.
  - Si `has_data` est `False` : La suppression définitive est autorisée (nettoyage des erreurs de saisie).
- **Actions d'archivage** : Les endpoints `archive/` et `reactivate/` permettent de gérer le cycle de vie sans perte de données.

## 3. Modifications Frontend (React Native)

### Internationalisation (i18n)
- `farms.hasDataDeleteError` : Message expliquant l'impossibilité de supprimer une ferme avec historique.
- `lots.hasDataDeleteError` : Message similaire pour les lots.

### Ecrans de Création/Édition (CreateFarmScreen & CreateLotScreen)
- **Interface Dynamique** : L'icône d'action bascule intelligemment :
  - **Poubelle (`delete`)** : Affichée si `has_data` est faux (élément vide).
  - **Archive (`archive`)** : Affichée si `has_data` est vrai (historique présent).
- **Logique de Confirmation** : Les dialogues d'alerte adaptent leurs textes (Titre, Message, Boutons) selon la possibilité ou non de supprimer définitivement.
- **Gestion des Erreurs** : Capture des messages d'erreur du backend pour informer l'utilisateur en cas de blocage métier.

### FarmsScreen (Liste)
- Ajout d'un bouton de filtre "Archive" pour les propriétaires.
- Distinction visuelle des fermes archivées (opacité réduite, badge "Inactif").
- Chargement conditionnel des fermes selon le filtre de statut.

### FarmDetailScreen
- Affichage d'un bandeau d'alerte si la ferme est archivée.
- Bouton de réactivation directe depuis le détail de la ferme.
- Synchronisation des statistiques locales avec le statut de la ferme.

## 4. Correctifs Techniques & Robustesse
- **Migration de Base de Données** : Application des migrations Django pour l'ajout effectif du champ `status` dans la base MySQL (résolution de l'erreur `OperationalError 1054`).
- **Sécurisation des Signaux** : Correction d'une erreur `DoesNotExist` dans `signals.py`. Utilisation de blocs `try/except` lors de l'accès aux relations `OneToOne` (`expense`) pour éviter les crashs lors de suppressions en cascade ou de synchronisations asynchrones.
- **Filtrage des Statistiques** : Correction de la clause `WHERE` dans `FarmViewSet.statistics` pour assurer la compatibilité SQL avec les jointures complexes.

## 5. Tests de Validation
- [x] Application des migrations DB -> Succès.
- [x] Tentative de suppression via API directe -> Bloquée.
- [x] Archivage d'une ferme avec lots actifs -> Bloqué avec message d'erreur.
- [x] Archivage d'une ferme vide ou avec lots terminés -> Succès.
- [x] Réactivation d'une ferme archivée -> Succès.
- [x] Tentative de suppression d'une ferme déjà archivée -> Bloquée par le serveur (Sécurité maximale).
- [x] Robustesse des signaux (Achat -> Dépense) -> Validé.
- [x] Visibilité : Un employé ne voit pas les fermes archivées.
- [x] Statistiques : Les fermes archivées sont exclues des calculs globaux par défaut.

## 6. Conclusion
Le système est désormais techniquement robuste et conforme aux exigences de sécurité des données. La suppression est remplacée par un cycle de vie "Actif -> Archivé" totalement intégré, préservant l'intégrité de la base de données et des rapports financiers.
