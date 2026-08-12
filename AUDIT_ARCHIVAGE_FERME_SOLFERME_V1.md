# Audit du Système d'Archivage des Fermes - SolFerme V1

## 1. Objectifs
Remplacer la suppression définitive des fermes par un système d'archivage sécurisé pour maintenir l'intégrité des données historiques et prévenir les pertes accidentelles.

## 2. Modifications Backend (Django)

### Modèle Farm
- Ajout du champ `status` (ACTIF, ARCHIVE).
- Valeur par défaut : `ACTIF`.

### FarmViewSet
- **Blocage de la suppression** : La méthode `destroy` lève désormais une `ValidationError` si on tente de supprimer une ferme, suggérant l'archivage.
- **Règle métier d'archivage** : Une ferme ne peut être archivée que si elle ne contient **aucun lot actif** (`ACTIF`).
- **Actions personnalisées** :
  - `archive/` : Bascule le statut en `ARCHIVE`.
  - `reactivate/` : Bascule le statut en `ACTIF`.
- **Filtrage** :
  - Le queryset par défaut pour les employés est limité aux fermes `ACTIF`.
  - Les statistiques excluent par défaut les données des fermes archivées, sauf si le paramètre `include_archived_farms` est fourni.

## 3. Modifications Frontend (React Native)

### Internationalisation (i18n)
- Ajout de `common.archive`.
- Ajout de messages spécifiques : `farms.archiveFarmConfirm`, `farms.archiveSuccess`, `farms.archiveError`.

### CreateFarmScreen
- Remplacement du bouton "Supprimer" par "Archiver".
- Changement de l'appel API `DELETE /farms/{id}/` par `POST /farms/{id}/archive/`.
- Gestion des erreurs métier retournées par le serveur (ex: lots actifs présents).

### FarmsScreen (Liste)
- Ajout d'un bouton de filtre "Archive" pour les propriétaires.
- Distinction visuelle des fermes archivées (opacité réduite, badge "Inactif").
- Chargement conditionnel des fermes selon le filtre de statut.

### FarmDetailScreen
- Affichage d'un bandeau d'alerte si la ferme est archivée.
- Bouton de réactivation directe depuis le détail de la ferme.
- Synchronisation des statistiques locales avec le statut de la ferme.

## 4. Tests de Validation
- [x] Tentative de suppression via API directe -> Bloquée.
- [x] Archivage d'une ferme avec lots actifs -> Bloqué avec message d'erreur.
- [x] Archivage d'une ferme vide ou avec lots terminés -> Succès.
- [x] Réactivation d'une ferme archivée -> Succès.
- [x] Visibilité : Un employé ne voit pas les fermes archivées.
- [x] Statistiques : Les fermes archivées sont exclues des calculs globaux par défaut.

## 5. Conclusion
Le système est désormais conforme aux exigences de sécurité des données. La suppression est désactivée au profit d'un cycle de vie "Actif -> Archivé" qui préserve les rapports financiers et de production passés.
