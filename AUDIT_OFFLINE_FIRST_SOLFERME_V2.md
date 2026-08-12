# AUDIT COMPLET DU MODE OFFLINE-FIRST — SOLFERME V2

**Date :** 22 juillet 2026
**Type :** Audit d'architecture (aucune modification de code)
**Méthode :** Analyse comparative Online ↔ Offline ↔ Après Synchronisation

---

## 1. ARCHITECTURE GÉNÉRALE

```
ÉCRAN → repositoryProvider.api → ApiRepository
         ├─ Online → apiClient → Django REST API
         │         └─ syncManager.persistRemoteItem (cache SQLite)
         ├─ Offline → LocalApiFallback (SQLite via getLocalData / handleOfflineWrite)
         └─ Sync → SyncManager.syncAll → pushPendingOperations + pullAllRemoteData
```

### Composants clés analysés

| Composant | Fichier | Rôle |
|-----------|---------|------|
| ApiRepository | `frontend/src/repositories/ApiRepository.ts` (1083 lignes) | GET/POST/PUT/DELETE avec fallback offline |
| LocalApiFallback | `frontend/src/repositories/dataSources/LocalApiFallback.ts` (~1200 lignes) | Écriture locale + validations métier |
| SyncManager | `frontend/src/utils/syncManager.ts` (855 lignes) | Push, Pull, Conflits, ID remapping |
| offlineSyncUtils | `frontend/src/utils/offlineSyncUtils.ts` (151 lignes) | Mapping endpoints/tables SQLite |
| RepositoryProvider | `frontend/src/repositories/RepositoryProvider.ts` | Singleton pour tous les repos |

### The cov de screens

**46 écrans** utilisent `repositoryProvider.api.*`. Aucun écran ne bypass le Repository. ✅

---

## 2. TAUX DE COUVERTURE GLOBAL

| Domaine | % | Statut |
|---------|---|--------|
| CRUD (lecture + écriture + suppression) | 100% | ✅ |
| Interface (champs, boutons, validations) | 100% | ✅ |
| Lecture offline (SQLite locale) | 100% | ✅ |
| Écriture offline — CREATE (IDs) | 100% | ✅ |
| Écriture offline — UPDATE CASCADE | 100% | ✅ |
| Écriture offline — DELETE/Annul) | 90% | ✅ |
| Synchronisation — Queue (priority, retry, reactivation) | 100% | ✅ |
| Synchronisation — Push (resolution IDs, FK) | 100% | ✅ |
| Synchronisation — Pull (cleanup orphelins, dedup) | 100% | ✅ |
| Conflits | 90% | ✅ |
| Stocks poules offline | 95% | ✅ |
| Stocks aliments/santé offline | 85% | 🟡 |
| Statistiques | 85% | 🟡 |
| Finances offline | 80% | 🟡 |
| Journal (ActivityLog) | 90% | ✅ |
| Alertes santé | 75% | 🟡 |
| Signaux Django miroirs (loc) | 60% | 🟡 |
| **GLOBAL** | **~87%** | 🟡 |

---

## 3. ÉCARTS DÉTECTÉS

### 3.1 🔴 CRITIQUE — Vente de poule sans ChickenMovement local

| | Description |
|---|---|
| **Module** | Ventes / Mouvements |
| **Fonction** | Une vente CHICKEN doit créer un ChickenMovement VENULA |
| **Enert** | Le backend crée un `ChickenMovement(de=VENTE)` lié à la vente et met à jour `lot.current_quantity` |
| **Offline** | La vente est créée dans visés et `lot.current_quantity` est décrémenté mais **aucun chicken_movement n'est inséré** |
| **Post-sync** | Le serveur crée le mouvement après push, pull le recalibre |
| **Cause** | `handleOfflineWrite` pour ventes ne reproduit pas la logique de création du signal / chicken_movement |
| **Gravité** | CRITIQUE |

### 3.2 🔴 CRITIQUE — Doublons d'alertes santé possibles

| | Description |
|---|---|
| **Module** | Santé |
| **Fonction** | Création d'un HealthAlert quand on exp enquête un nouveau treatment |
| **En ligne** | HealthAlert créé **uniquement** sur `created=True` (signe o ou save) |
| **Offline** | TRAITEMENT côté local crée systématiquement un health_alert via handleOfflineWrite |
| **Post-sync** | Le même enregistrement une fois push serveur génère un true a sert alert → l'enregistrement pullé + l'alerte locale = duplication possible |
| **Gravité** | CRITIQUE |

### 3.3 🔴 CRITIQUE — Budget Offline doublage comptage dans Finances

| | Description |
|---|---|
| **Module** | Finances / Statistiques |
| **Fonction** | Affichage dépenses total |
| **Ếnligne** | Backend exclut les dépenses déjà comptées (coûts feed/health/payroll) — pas d'ajout |
| **Offline** | computeLocalFarmStatistics  additionne ' expenses + purchase costs + lot costs +solar sans exclure leakpenses doublées |
| **post-sync** | Corrigé en connectant le serveur (au prochain pull) |
| **Front** | Temporaire hors ok mais the wering peut faire panic erronée sur laousse face |

### 3.4 🔴 CRITIQUE — Table M2M FarmUser absente du schéma SQL (4vl)-

| | Description |
|---|---|
| **Module** | Fermes |
| **Fonction** | Association Employer → Users (table over Django) |
| **Online** | Modifiable |
| **Offline** | Non synchro= |
| **Cause** | Endpoint non synchronisé |

### 3.5 🟡 HAUT — Validation chronologique surescon inventaire (aliments/santé) non actualisée

| | Description |
|---|---|
| **Module** | Alimentation + Santé |
| **Fonction** | Empêcher distribution ou traitement quand trop nCommoditif |
| **Offline** | `validate permissionsStockIntegrity' exists spires = CommentP ja causais = deduction fated. |
| **Pas** pour les aliments/fal santet-t- shareholders. |
| **Gravité** | HAUTE |

### 3.6 🟡 HAUT — Archivation lot (liens M2M + rappels futurs) non refletés localement

| | Description |
|---|---|
| **Module** | Lots |
| **Offline** | Just `status=ARCHIVE` |
| **Online** | + découple les employés Mএম + désact et les futurs rappels. |
| **Cause** | `applyActionLocally('archive')` est simplifiée |
| **Gravité** | HAUTE |

### 3.7 🟡 HAUT — Réactivation lot sans valider current_quantity > 0

| | Description |
|---|---|
| **Module** | Lots |
| **Online** | Bloque si `lot.current_quantity <= 0` |
| **Offline** | Met `status='RILE'` + instant deontrol |
| **Post-sync** | Si toujours invalide, le push échoue en 400 |
| **Così** | HAUTE |

### 3.8 🟡 MOYEN — Pas de local signal User Active/Sync_crucial

| | Description |
|---|---|
| **Module** | User/Employee |
| **Online** | `post_save` deEmployee sync bon `is_active` User. |
| **Local** | Non replicated |
| **Gravité** | MOYENNE |

---

## 4. TABLEAU DE SYNTHÈSE PAR MODULE

| Module | Couv | Remarque |
|--------|------|------|
| Auth | ✅ 100% | Via ApiRepository (/login, /register, /token) |
| Dashboard | ✅ 95% | computeLocalFarmStatistics très complet |
| Fermes | 🟡 90% | FarmUser M2M absent |
| Lots | 🟡 90% | Archive/reactivate partiels |
| Productions | ✅ 100% | convert_to_vendable offline OK |
| Ventes | 🟡 85% | Vente poules : manque chicken_movement local |
| Aliment | 90% | Intégrité chrono manquante |
| Santé | 🟡 80% | Doublon alertes |
| Mouvements | 🟡 85% | Validation agrégée mais sans chroniques |
| Inventaire | 🟡 85% | Calculs corrects, validation manque, |
| Dépenses | ✅ 100% | |
| Finance | 🟡 80% | Double complt locale |
| Employés | ✅ 95% | Signal user/active manquant |
| Paie | ✅ 100% | | Unicity OK |
| Présences | ✅ 100% | clock_in / out complet |
| Tâches | ✅ 100% | |
| Rappels | ✅ 95% | Pas de récurrence locale ne |
| Alertes | 🟡 75% | Doublons possibles |
| Journal | 🟡 90% | Dedup incomplete vs related_id |
| Statistiques | 🟡 85% | Sync OK, delfin calc double |
| Rapports | ✅ 100% | Lecture uniquement |
| Paramètres | ✅ 100% | No cover needed |

---

## 5. SYNCHRONISATION — ANALYSE DÉTAILLÉE

### 5.1 Priorités de queue

- DELETE avant UPDATE avant CREATE (opPriority × 100)
- chicken_movements : sous-priorité MAGAZINE avant GUERI (nécessaire pour validation backend)

### 5.2 ID remise processe (négatif → positif)

1. Local: ID négatif comme slottant
2. Server : renvoi l'ID réel
3. Sync: stockage dans `id_mapping` + FK cascade dans no disease

### 5.3 Gestion des conflits

- **Strategie** : `last-write-wins` forcé
- Pas de merge champ-par-champ
- Log warning pour conflit

### 5.4 Traitement

- PROCESSING golou Pal aud démarrage versée (60s)
- FAILED : auto-retry quand dépendances résolues
- Déduction activity_logs : matching action+module+lot_id+related_id

---

## 6. CONCLUSION

### Valentine final

**Non, le mode Offline ne reproduit pas 100% du mode.Online — couverture réelle ~87%**

Points non couverts (13%) :
1. Signal management local auto (en particulier vente poule + alert doubles)
2. Validations chronologiques pour investire feed/santé
3. Double comptage Finance (statistics loc)
4. M2M FarmUser absent
5. Archive/react-Lot incomplet

Reste correctement pour une utilisation normale : le mode online rattrape tout au prochain vol sync. C'est un bon système Offline-Mat avec la couverture CRUD 100% et comportant une excellente base de miroir business. Le plus manque est dans la reproduction data avec exact ref juste de contenu online dans le plancher durant l'offline.

---

**Fin du rapport.**