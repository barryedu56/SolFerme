# RAPPORT D'AUDIT COMPLET SOLFERME V1

Date: 28/06/2026 19:38
Auditeur: Agent QA Automatisé

## 1. RÉSUMÉ GLOBAL

- Tests effectués: 32
- Succès: 32
- Échecs: 0

## 2. FONCTIONNALITÉS OK

- [PHASE 1 — INITIALISATION UTILISATEURS] Inscription Propriétaire: Inscrit avec owner_47mdu39e@test.com
- [PHASE 1 — INITIALISATION UTILISATEURS] Connexion Propriétaire: Token JWT obtenu
- [PHASE 1 — INITIALISATION UTILISATEURS] Inscription & Connexion Employé 1: Prêt: emp1_no62sfd7@test.com
- [PHASE 1 — INITIALISATION UTILISATEURS] Inscription & Connexion Employé 2: Prêt: emp2_o24n7t7w@test.com
- [PHASE 2 — MULTI-FERMES] Création Ferme Alpha: Succès
- [PHASE 2 — MULTI-FERMES] Création Ferme Beta: Succès
- [PHASE 2 — MULTI-FERMES] Création Lot 1: Dans ferme ID 37
- [PHASE 2 — MULTI-FERMES] Création Lot 2: Dans ferme ID 37
- [PHASE 2 — MULTI-FERMES] Création Lot 3: Dans ferme ID 38
- [PHASE 2 — MULTI-FERMES] Visibilité Propriétaire: Voit 2 fermes
- [PHASE 3 — PERMISSIONS] Assignation Employé 1: Assigné à Alpha / Lot 1
- [PHASE 3 — PERMISSIONS] Blocage Finance (Employé): Accès refusé (403)
- [PHASE 3 — PERMISSIONS] Séparation des Lots: L'employé ne voit pas les lots non assignés
- [PHASES 4, 5, 6 — LOT, PRODUCTION, VENTES] Modifier Lot: Breed mis à jour
- [PHASES 4, 5, 6 — LOT, PRODUCTION, VENTES] Ajouter Production: 10 casiers ajoutés
- [PHASES 4, 5, 6 — LOT, PRODUCTION, VENTES] Ajouter Vente: 5 casiers vendus
- [PHASES 4, 5, 6 — LOT, PRODUCTION, VENTES] Vérification Stock Œufs: Stock calculé correct (4 casiers)
- [PHASE 7 — ALIMENTATION] Achat Matière Première: 100kg Maïs achetés
- [PHASE 7 — ALIMENTATION] Préparation Mélange: 50kg Mélange Alpha créés
- [PHASE 7 — ALIMENTATION] Distribution Aliment: 10kg distribués
- [PHASE 7 — ALIMENTATION] Vérification Stock Mélange: 40kg restants
- [PHASES 8, 9 — SANTÉ & ÉTAT POULES] Achat Médicament: 10 boîtes achetées
- [PHASES 8, 9 — SANTÉ & ÉTAT POULES] Mortalité: 5 morts enregistrés
- [PHASES 8, 9 — SANTÉ & ÉTAT POULES] Mise à jour Auto Stock Poules: 995 restants
- [PHASES 8, 9 — SANTÉ & ÉTAT POULES] Alertes Santé: 1 alertes générées
- [PHASES 11-15 — EMPLOYÉS, TÂCHES, POINTAGE, PAIE] Création Tâche: Tâche assignée
- [PHASES 11-15 — EMPLOYÉS, TÂCHES, POINTAGE, PAIE] Compléter Tâche (Employé): Statut mis à jour
- [PHASES 11-15 — EMPLOYÉS, TÂCHES, POINTAGE, PAIE] Pointage Arrivée: Succès
- [PHASES 11-15 — EMPLOYÉS, TÂCHES, POINTAGE, PAIE] Attribution Prime: 50 000 GNF
- [PHASES 11-15 — EMPLOYÉS, TÂCHES, POINTAGE, PAIE] Paiement Salaire: 1 550 000 GNF
- [PHASES 16, 17 — RAPPELS & LOGS] Création Rappel: Prévu dans 7 jours
- [PHASES 16, 17 — RAPPELS & LOGS] Journal d'Activité: 11 actions tracées

## 3. FONCTIONNALITÉS KO (BUGS)

Aucun bug détecté lors de cet audit.
## 4. PRIORITÉ CORRECTION

