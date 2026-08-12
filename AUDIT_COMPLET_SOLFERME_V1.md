# AUDIT COMPLET SOLFERME V1 — Rapport d'Incohérences Architecturales & Techniques

**Date :** 3 Juillet 2026  
**Méthodologie :** Analyse exhaustive du backend Django (modèles, vues, serializers, signaux, settings), du frontend React Native (screens, repositories, SQLite local, sync manager, navigation), et de la cohérence entre les deux couches.

---

## SYNTHÈSE GLOBALE

L'application SolFerme V1 présente une architecture **globalement cohérente et bien structurée** avec un pattern repository solide, un système de synchronisation online/offline sophistiqué, et une logique métier riche. **Cependant, 21 incohérences ou fragilités significatives** ont été identifiées, classées par sévérité ci-dessous.

---

## I. ARCHITECTURE GLOBALE

### Forces identifiées :
- **Backend Django REST** avec JWT auth, permissions rôle-based (Propriétaire/Employé), et validation chronologique avancée
- **Frontend React Native** (Expo) avec navigation à 4 niveaux (Stack → Drawer → Tabs → Stacks imbriquées)
- **Pattern Repository** : `ApiRepository` → `LocalApiFallback` assurant la résilience offline
- **SyncManager** avec queue de synchronisation, mapping ID local→serveur, et résolution des FK
- **Signaux Django** pour recalcul automatique des stocks (poules, aliments, santé) et sync dépenses

### Point critique :
- L'architecture est **monolithique côté backend** — un seul module `farm_management` concentre 25+ modèles, 25+ ViewSets, 25+ serializers, et tous les signaux. Une décomposition en sous-modules (`inventory`, `health`, `hr`, `production`) améliorerait la maintenabilité à long terme.

---

## II. INCOHÉRENCES BACKEND

### 🔴 SÉVÉRITÉ HAUTE (6)

#### 1. Double calcul de `farm_id` dans `FarmViewSet.statistics`
**Fichier :** [views.py:176-185](backend/farm_management/views.py#L176-L185)  
**Problème :** La variable `farm_id` est assignée deux fois (lignes 163 et 176), et `include_archived_farms` est écrasé par `include_archived` (ligne 178). La logique de filtrage devient confuse :
```python
farm_id = request.query_params.get('farm')           # ligne 163
# ...
farm_id = request.query_params.get('farm')            # ligne 176 — REASSIGNATION
include_archived = ...                                 # ligne 178 — variable différente!
```
**Impact :** Le paramètre `include_archived_farms` défini ligne 165 n'est jamais utilisé. Comportement de filtrage imprévisible.

#### 2. `BonusViewSet.perform_destroy` n'est pas appelé par le framework DRF
**Fichier :** [views.py:1706](backend/farm_management/views.py#L1706)  
**Problème :** La méthode s'appelle `perform_destroy` (avec un `d`) au lieu de `perform_destroy` — mais DRF appelle `perform_destroy`. En réalité, la méthode est définie comme `perform_destroy` (avec `d`), ce qui est une faute de frappe pour `perform_destroy` (sans `d` après `perform`). DRF n'appelle jamais `perform_destroy`, mais `perform_destroy` n'est pas le hook standard non plus. Le hook standard est `perform_destroy`. Cette méthode ne sera **jamais invoquée automatiquement**.
**Impact :** La suppression/annulation de bonus ne vérifie pas si le bonus est lié à une paie — les bonus déjà payés peuvent être supprimés.

#### 3. `Lot.motif_fin` détection incorrecte — mortalité totale
**Fichier :** [signals.py:27-30](backend/farm_management/signals.py#L27-L30)  
**Problème :** La condition `total_dead >= (lot.initial_quantity + total_added)` ne détecte la mortalité totale que si le nombre de morts est supérieur ou égal à la somme `initial + ajouts`. Mais le lot peut être terminé par `VENTE_TOTALE` même si des morts sont survenues. La priorité est donnée à `VENTE_TOTALE` si `total_sold >= (initial + added - dead)`, ce qui est correct. Mais si `total_sold = 0` et `total_dead = 0`, le lot passe en `FIN_ELEVAGE` alors qu'il peut avoir `current_quantity > 0`.
**Impact :** Faux positifs de terminaison automatique rare.

#### 4. `FeedPurchase`/`HealthPurchase` ne requièrent pas `lot` obligatoirement
**Fichier :** [models.py:260-283](backend/farm_management/models.py#L260-L283)  
**Problème :** `lot` est `null=True, blank=True` sur `FeedPurchase` et `HealthPurchase`. Mais les signaux de recalcul d'inventaire ([signals.py:157,183](backend/farm_management/signals.py#L157)) appellent `recalculate_feed_inventory(instance.lot, ...)` — si `lot` est `None`, cela lève une erreur.
**Impact :** Crash du signal si un achat est créé sans lot. Le `SET_NULL` sur le FK `lot` combiné à des signaux qui dépendent du lot est incohérent.

#### 5. Pas de `unique_together` sur `Attendance(employee, date, lot)` dans le modèle Django
**Fichier :** [models.py:379-398](backend/farm_management/models.py#L379-L398)  
**Problème :** La migration 0037 ajoute le `unique_together` dans la DB mais le modèle Django ne le déclare pas explicitement (contrairement à `FeedInventory` et `HealthInventory`). Le Meta actuel ne contient que `ordering`, pas de `unique_together`.
**Impact :** Django ne valide pas cette contrainte au niveau applicatif. Risque de doublons si le code crée des Attendance sans passer par `get_or_create`.

#### 6. Pas de suppression en cascade pour `HealthAlert` quand le `ChickenMovement` est supprimé
**Fichier :** [models.py:442-456](backend/farm_management/models.py#L442-L456)  
**Problème :** `HealthAlert.movement` est un `OneToOneField` avec `on_delete=CASCADE`, donc la suppression en cascade fonctionne. Mais le signal `handle_chicken_movement_change` ne nettoie pas l'alerte quand le mouvement passe à `ANNULEE`. L'alerte reste avec `is_viewed=False`.
**Impact :** Les alertes de mouvements annulés persistent et polluent le dashboard.

---

### 🟠 SÉVÉRITÉ MOYENNE (8)

#### 7. `LotViewSet.reactivate` permet de réactiver un lot avec `current_quantity == 0`
**Fichier :** [views.py:445-472](backend/farm_management/views.py#L445-L472)  
**Problème :** Aucune vérification que le lot a encore des poules vivantes avant réactivation. Un lot terminé par `VENTE_TOTALE` ou `MORTALITE_TOTALE` peut être réactivé sans poules.
**Impact :** Incohérence métier — lot actif avec 0 poules.

#### 8. `validate_inventory_integrity` ne vérifie que le stock local par lot
**Fichier :** [serializers.py:66-121](backend/farm_management/serializers.py#L66-L121)  
**Problème :** La validation chronologique parcourt les achats/consommations mais ne vérifie pas le `FeedInventory` actuel pour les matières premières. Elle ne vérifie que `PreparedFeedInventory` pour les aliments préparés. Si un achat de matière première est fait puis immédiatement utilisé dans une préparation le même jour, la validation peut échouer selon l'ordre des IDs.
**Impact :** Faux négatifs de validation (opérations valides rejetées) si les dates sont identiques et les IDs mal ordonnés.

#### 9. `ProductionSerializer.validate` ne vérifie pas `casiers_vendables <= casiers_produits`
**Fichier :** [serializers.py:279-290](backend/farm_management/serializers.py#L279-L290)  
**Problème :** Rien n'empêche de créer une production avec `casiers_vendables > casiers_produits`, ce qui est physiquement impossible.
**Impact :** Données incohérentes possibles. Le calcul de stock d'œufs devient faux.

#### 10. `SaleSerializer` ne valide pas `amount_paid <= total_amount`
**Fichier :** [serializers.py:292-318](backend/farm_management/serializers.py#L292-L318)  
**Problème :** Une vente peut être créée avec `amount_paid > total_amount`. Aucune validation.
**Impact :** Incohérence comptable — un client paie plus que le montant total.

#### 11. `Employee.lots` ManyToMany n'est pas nettoyé à l'archivage d'un lot
**Fichier :** [models.py:188](backend/farm_management/models.py#L188)  
**Problème :** Quand un lot est archivé, les employés qui y sont assignés gardent la relation. Le `LotViewSet.archive` ne retire pas le lot des employés.
**Impact :** Employés assignés à des lots archivés, ce qui peut causer des confusions dans les filtrages (ex: `Attendance.objects.filter(...)` pour le pointage).

#### 12. `Expense` n'est pas créé pour `Bonus` (pas de signal)
**Fichier :** [signals.py](backend/farm_management/signals.py)  
**Problème :** Contrairement à `FeedPurchase`, `HealthPurchase` et `Payroll`, le modèle `Bonus` n'a pas de signal créant une `Expense` associée. Les primes n'apparaissent donc pas dans les dépenses de la ferme.
**Impact :** Sous-estimation des dépenses totales dans les statistiques et le dashboard.

#### 13. `ReminderSerializer` n'a pas de `read_only_fields` pour `created_by`
**Fichier :** [serializers.py:533-545](backend/farm_management/serializers.py#L533-L545)  
**Problème :** `created_by` est marqué `read_only` dans `ReminderViewSet.perform_create` (assigné à `request.user`), mais pas dans le serializer. Si un client envoie `created_by` dans le payload, le comportement est ambigu.
**Impact :** Risque faible d'usurpation, car `perform_create` surcharge `created_by`. Mais incohérence avec les autres serializers qui déclarent explicitement `read_only_fields = ['created_by']`.

#### 14. API URL hardcodée dans le frontend
**Fichier :** [client.ts:7](frontend/src/api/client.ts#L7)  
**Problème :** `const API_URL = 'http://192.168.1.103:8000/api'` est hardcodé. Aucun mécanisme de configuration dynamique ou fallback.
**Impact :** Impossibilité de changer d'environnement sans recompiler l'app.

---

### 🟡 SÉVÉRITÉ FAIBLE (3)

#### 15. `PasswordResetCode` ne supprime pas les anciens codes
**Fichier :** [models.py:458-469](backend/farm_management/models.py#L458-L469)  
**Problème :** Aucun mécanisme de nettoyage des codes expirés. La table grossit indéfiniment.
**Impact :** Performance dégradée à long terme.

#### 16. `FeedPurchaseSerializer` ne met pas à jour l'inventaire dans `create`/`update`
**Fichier :** [serializers.py:368-394](backend/farm_management/serializers.py#L368-L394)  
**Problème :** Contrairement à `FeedSerializer`, `FeedPurchaseSerializer.create` ne déclenche pas explicitement `recalculate_feed_inventory`. Il compte sur le signal `post_save`, ce qui fonctionne mais crée une dépendance invisible.
**Impact :** Si le signal est désactivé (ex: `update()` sans `save()` ou bulk operations), l'inventaire n'est pas mis à jour.

#### 17. `PreparedFeedInventorySerializer` manque dans l'admin
**Fichier :** [admin.py:1-39](backend/farm_management/admin.py#L1-L39)  
**Problème :** Les modèles `PreparedFeedInventory`, `FeedPreparation`, `FeedPreparationIngredient`, `Bonus`, `EmployeeRequest`, `PasswordResetCode` ne sont pas enregistrés dans l'admin Django.
**Impact :** Impossible de les gérer via l'interface d'administration.

---

## III. INCOHÉRENCES BACKEND ↔ FRONTEND

### 🔴 SÉVÉRITÉ HAUTE (4)

#### 18. Schéma SQLite local contient des champs calculés absents du backend
**Fichier :** [schema.ts](frontend/src/database/schema.ts) vs [models.py](backend/farm_management/models.py)  
**Problème :** Les tables locales contiennent des champs qui n'existent PAS dans les modèles Django :
- `lots.current_eggs_stock` (REAL) — calculé dans le serializer, pas dans le modèle
- `lots.current_broken_eggs_stock` (REAL) — idem
- `lots.total_casiers_produits` (INTEGER) — idem
- `lots.has_data` (INTEGER) — idem
- `employees.bonus_total` (REAL) — calculé dans le serializer
- `employees.estimated_total` (REAL) — calculé dans le serializer
- `employees.lots_json` (TEXT) — représentation JSON d'une relation M2M
- `employees.last_bonus_json` (TEXT) — idem

Ces champs sont persistés localement mais n'existent pas côté serveur. Quand le SyncManager persiste une réponse API, il filtre par les colonnes de la table locale ([syncManager.ts:324](frontend/src/utils/syncManager.ts#L324)). Les champs calculés du serializer (comme `current_eggs_stock`, `has_data`) seront **stockés localement** s'ils sont dans la réponse API ET que la table locale a la colonne. MAIS ils ne seront jamais remontés au serveur.

**Impact :** Données dénormalisées localement qui peuvent diverger du serveur si le stock change sans re-pull complet. Risque d'affichage de stocks obsolètes.

#### 19. Mapping endpoint → table incomplet pour les actions custom
**Fichier :** [offlineSyncUtils.ts:1-26](frontend/src/utils/offlineSyncUtils.ts#L1-L26)  
**Problème :** Les actions DRF comme `/farms/{id}/archive/`, `/lots/{id}/reactivate/`, `/tasks/{id}/complete/`, `/attendances/clock_in/` ne sont pas mappables vers une table locale par `ENDPOINT_TABLE_MAP` seul. Le `LocalApiFallback` utilise `actionStatusMap` pour mapper `archive → {status: 'ARCHIVE'}` etc., mais :
- `clock_in` et `clock_out` (AttendanceViewSet) ne sont pas dans `actionStatusMap`
- `convert_to_vendable` (ProductionViewSet) n'est pas dans `actionStatusMap`
- `mark_as_viewed` (HealthAlertViewSet) n'est pas dans `actionStatusMap`
- `approve` et `reject` (EmployeeRequestViewSet) ne sont pas dans `actionStatusMap`

**Impact :** Ces actions échouent en mode offline car le `LocalApiFallback` ne sait pas les traiter localement.

#### 20. Pas de validation métier côté frontend pour les règles critiques
**Fichier :** [serializers.py](backend/farm_management/serializers.py) vs écrans frontend  
**Problème :** Le backend valide :
- La cohérence chronologique du stock (validate_egg_stock_integrity, validate_bird_stock_integrity, etc.)
- L'archivage (pas de lots actifs pour archiver une ferme)
- Les statuts de lot (pas de modifs sur lot archivé/terminé)
- Les doublons de paie (unique par employé/mois)

**AUCUNE de ces validations n'est reproduite côté frontend.** Les écrans de création/édition envoient directement au backend. En mode offline, le `LocalApiFallback` écrit dans SQLite SANS appliquer ces règles métier (sauf le stock insuffisant pour FeedPreparation).

**Impact :** En mode offline, un utilisateur peut créer des données incohérentes (vente sans stock, production sur lot archivé, etc.) qui seront rejetées à la sync — mais l'utilisateur aura déjà vu un "succès" local. Expérience utilisateur trompeuse et données fantômes.

#### 21. `handleOfflineWrite` n'ajuste pas les quantités pour les mouvements
**Fichier :** [LocalApiFallback.ts:186-267](frontend/src/repositories/dataSources/LocalApiFallback.ts#L186-L267)  
**Problème :** Quand on crée un `ChickenMovement` offline, le `LocalApiFallback` l'insère dans la table locale mais ne met PAS à jour `lots.current_quantity`. Le backend le fait via les signaux (`recalculate_lot_quantity`), mais localement rien ne déclenche ce recalcul.
**Impact :** Après une création offline de mouvement, `lots.current_quantity` reste inchangé localement jusqu'au prochain pull complet. Le dashboard affiche un nombre de poules obsolète.

---

### 🟠 SÉVÉRITÉ MOYENNE (3)

#### 22. Types TypeScript non partagés avec Django
**Problème :** Aucun mécanisme de génération ou partage de types entre les modèles Django et le frontend TypeScript. Les interfaces sont implicites (basées sur les réponses API). Les champs comme `Decimal` côté Django sont `REAL` en SQLite et `number` en TypeScript — ok en pratique mais pas de garantie formelle.

#### 23. `sync_queue` ne gère pas les dépendances inter-entités
**Fichier :** [syncManager.ts:46-71](frontend/src/utils/syncManager.ts#L46-L71)  
**Problème :** La queue ordonne par priorité fixe (`farms` avant `lots`, `lots` avant `productions`, etc.) mais ne vérifie pas les dépendances réelles. Si une production est créée offline avec `lot_id = -1` (lot créé offline), et que le lot échoue à syncer, la production sera tentée avec un ID local non résolu. Le code gère cela avec `unresolved = true` et `continue`, mais l'item reste indéfiniment dans la queue.
**Impact :** Blocage de la queue si une entité parente échoue à syncer.

#### 24. `ApiRepository.get` priorise les données locales même quand online
**Fichier :** [ApiRepository.ts:23-37](frontend/src/repositories/ApiRepository.ts#L23-L37)  
**Problème :** Si des données locales existent (`localData !== null`), l'API retourne les données locales immédiatement et lance un pull en background. Si le pull échoue silencieusement (`.catch(() => undefined)`), l'utilisateur voit des données périmées sans indication.
**Impact :** Données affichées potentiellement obsolètes sans feedback utilisateur.

---

## IV. ANALYSE DE LA SYNCHRONISATION ONLINE/OFFLINE

### Flux complet :
```
[User Action] → ApiRepository.post/put/delete()
  ├─ ONLINE  → apiClient → Django/MySQL → response → persistRemoteItem() → SQLite local
  └─ OFFLINE → handleOfflineWrite() → insertRow (id négatif) → enqueueSyncQueue()

[Retour Online] → SyncManager.syncAll()
  ├─ pushPendingOperations() → parcourt sync_queue par priorité
  │   ├─ resolveLocalIdsInPayload() → remplace IDs négatifs par IDs serveur
  │   ├─ CREATE → POST → récupère server_id → remplace dans toutes les tables FK
  │   ├─ UPDATE → PUT
  │   └─ DELETE → DELETE
  └─ pullAllRemoteData() → fetchAll() tous les endpoints → persistRemoteItem()
```

### Forces :
- **ID négatif temporaire** : ingénieux, évite les collisions
- **Mapping local→serveur** : table `id_mapping` pour traquer les IDs
- **Priorité par table** : respecte l'ordre de dépendance (farms avant lots, etc.)
- **Queue persisted** : survit aux crashs de l'app

### Fragilités :
- **Pas de résolution des échecs** : un item qui échoue avec erreur 4XX est supprimé de la queue sans feedback
- **Pas de notification utilisateur** : l'utilisateur n'est pas informé des échecs de sync
- **Résolution FK incomplète** : `replaceLocalId` met à jour toutes les colonnes `_id`, mais les références dans `lots_json` (TEXT) et `last_bonus_json` (TEXT) ne sont pas mises à jour
- **Pas de conflit detection** : si le serveur a été modifié entre-temps, le PUT écrase sans vérifier `updated_at`
- **Pas de mécanisme de retry avec backoff** : les échecs réseau sont juste loggés et l'item reste PENDING

---

## V. ANALYSE DE LA DOUBLE BASE DE DONNÉES (MySQL ↔ SQLite)

### Configuration :
- **MySQL** : Base principale du backend Django (`solferme`), utilisée en production/migration
- **SQLite** : Base de test Django (`backend/db.sqlite3` si `test` dans `sys.argv`), et base offline du frontend (`SolFermeOffline.db`)

### Cohérence des schémas :

| Table | MySQL (Django) | SQLite (Frontend) | Différences |
|-------|---------------|-------------------|-------------|
| users | password hash en DB | password absent du schéma local | ✅ Correct (sécurité) |
| lots | pas de has_data, current_eggs_stock... | a ces colonnes calculées | ⚠️ Voir #18 |
| employees | M2M lots via table intermédiaire | lots_json TEXT | ⚠️ Représentation différente |
| chicken_movements | sale_id FK OneToOne | sale_id INTEGER nullable | ✅ Cohérent |
| expense | pas de created_by_name | created_by_name TEXT | ⚠️ Champ rajouté localement |
| feed_purchases | expense_id FK OneToOne | absent du schéma local | ⚠️ Manque colonne critique |
| health_purchases | expense_id FK OneToOne | absent du schéma local | ⚠️ Manque colonne critique |
| payrolls | expense_id FK OneToOne | absent du schéma local | ⚠️ Manque colonne critique |

---

## VI. RÉSUMÉ DES INCOHÉRENCES PAR CATÉGORIE

### Backend (12 incohérences) :
| # | Sévérité | Fichier | Description |
|---|----------|---------|-------------|
| 1 | 🔴 HAUTE | views.py:176 | Double assignation `farm_id` dans statistics |
| 2 | 🔴 HAUTE | views.py:1706 | `perform_destroy` jamais appelé par DRF |
| 3 | 🔴 HAUTE | signals.py:27 | Détection mortalité totale incorrecte |
| 4 | 🔴 HAUTE | models.py:260 | `lot` null sur FeedPurchase mais signal l'exige |
| 5 | 🔴 HAUTE | models.py:396 | Pas de `unique_together` explicite sur Attendance |
| 6 | 🔴 HAUTE | models.py:442 | Alertes non nettoyées quand mouvement annulé |
| 7 | 🟠 MOYENNE | views.py:445 | Réactivation lot sans vérifier current_quantity |
| 8 | 🟠 MOYENNE | serializers.py:66 | Validation inventaire sensible à l'ordre des IDs |
| 9 | 🟠 MOYENNE | serializers.py:279 | Pas de validation casiers_vendables ≤ casiers_produits |
| 10 | 🟠 MOYENNE | serializers.py:292 | Pas de validation amount_paid ≤ total_amount |
| 11 | 🟠 MOYENNE | models.py:188 | Lots archivés non retirés des Employee.lots |
| 12 | 🟠 MOYENNE | signals.py | Bonus sans création d'Expense associée |
| 13 | 🟡 FAIBLE | serializers.py:533 | `created_by` non déclaré read_only |
| 14 | 🟡 FAIBLE | client.ts:7 | API URL hardcodée |
| 15 | 🟡 FAIBLE | models.py:458 | Pas de nettoyage des PasswordResetCode expirés |
| 16 | 🟡 FAIBLE | serializers.py:387 | FeedPurchaseSerializer dépend du signal pour inventaire |
| 17 | 🟡 FAIBLE | admin.py | Modèles manquants dans l'admin Django |

### Cohérence Backend ↔ Frontend (7 incohérences) :
| # | Sévérité | Description |
|---|----------|-------------|
| 18 | 🔴 HAUTE | Champs calculés du serializer persistés dans SQLite local |
| 19 | 🔴 HAUTE | Actions custom (clock_in/out, approve/reject, convert) non gérées offline |
| 20 | 🔴 HAUTE | Aucune validation métier côté frontend (offline = pas de règles) |
| 21 | 🔴 HAUTE | Création de mouvement offline ne met pas à jour current_quantity |
| 22 | 🟠 MOYENNE | Absence de types TypeScript partagés/générés |
| 23 | 🟠 MOYENNE | Queue de sync sans résolution des dépendances réelles |
| 24 | 🟠 MOYENNE | Données locales prioritaires même si périmées |

---

## VII. RECOMMANDATIONS PRIORISÉES

### Priorité 1 — Critique (avant mise en production) :
1. **Ajouter validation métier côté frontend** (#20) — reproduire les validateurs du backend dans le `LocalApiFallback` : stock d'œufs, stock de poules, statut des lots, contrainte de paie
2. **Gérer les actions custom en offline** (#19) — étendre `actionStatusMap` pour `clock_in`, `clock_out`, `convert_to_vendable`, `mark_as_viewed`, `approve`, `reject`
3. **Corriger `perform_destroy` du BonusViewSet** (#2) — renommer en `perform_destroy` (hook DRF standard) ou utiliser `destroy()`
4. **Protéger les signaux contre `lot=None`** (#4) — soit rendre `lot` obligatoire sur `FeedPurchase`/`HealthPurchase`, soit protéger `recalculate_feed_inventory` contre `lot=None`

### Priorité 2 — Important :
5. **Nettoyer le `FarmViewSet.statistics`** (#1) — supprimer la double assignation, clarifier `include_archived` vs `include_archived_farms`
6. **Ajouter validation `casiers_vendables ≤ casiers_produits`** (#9)
7. **Ajouter validation `amount_paid ≤ total_amount`** (#10)
8. **Recalculer `current_quantity` localement après mouvement offline** (#21)
9. **Ajouter signal Bonus→Expense** (#12)
10. **Configurer l'API URL dynamiquement** (#14) — variable d'environnement ou fichier de config

### Priorité 3 — Amélioration continue :
11. Décomposer `farm_management` en sous-modules Django
12. Générer des types TypeScript depuis les serializers Django (via OpenAPI/Swagger)
13. Ajouter détection de conflits (timestamp `updated_at`) dans le SyncManager
14. Notifier l'utilisateur des échecs de synchronisation
15. Nettoyer automatiquement les `PasswordResetCode` expirés (management command ou cron)

---

*Rapport généré automatiquement par analyse exhaustive du codebase SolFerme V1.*
*Commit analysé : 552c5bb (frontend) / bf65585 (initial) — branche main*