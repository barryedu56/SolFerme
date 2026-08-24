# 🐔 SolFerme

SolFerme est une application de gestion d'exploitation avicole conçue pour permettre aux propriétaires et aux employés de gérer efficacement les fermes, les lots de volailles, la production d'œufs, les ventes, l'alimentation, la santé, les dépenses, les employés et l'ensemble de l'historique des opérations.

L'application a été pensée avec une approche **Offline-First**, afin de permettre son utilisation même lorsque la connexion Internet est absente ou instable.

SolFerme possède une interface adaptée à plusieurs plateformes :

- 📱 Android
- 🌐 Web / Desktop
- 🍎 iOS (prévu / support selon l'état actuel du projet)

---

# 📌 1. Présentation du projet

SolFerme permet de centraliser la gestion quotidienne d'une exploitation avicole.

L'application couvre notamment :

- gestion des fermes ;
- gestion des lots ;
- suivi des volailles ;
- suivi de la production d'œufs ;
- conversion des œufs en casiers ;
- ventes ;
- paiements ;
- alimentation ;
- santé des volailles ;
- mouvements ;
- préparation et distribution d'aliments ;
- dépenses ;
- rappels ;
- tâches des employés ;
- présences ;
- paie ;
- demandes des employés ;
- statistiques ;
- rapports ;
- historique des opérations ;
- gestion des utilisateurs ;
- gestion des permissions.

L'objectif principal est de conserver une **trace fiable de l'activité réelle de la ferme**.

L'application n'est donc pas un simple CRUD.

Les données représentent l'historique réel d'une exploitation et doivent être manipulées avec beaucoup de précaution.

---

# 🏗️ 2. Architecture générale

Le projet est composé principalement de deux parties :

```text
SolFerme/
│
├── frontend/
│   └── Application React Native / Expo
│
└── backend/
    └── API Django
````

Architecture générale :

```text
                 ┌─────────────────────┐
                 │      SolFerme       │
                 │      Frontend       │
                 │ React Native / Expo │
                 └──────────┬──────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
          Données locales          API Backend
             SQLite                    │
                │                      │
                │                ┌─────▼─────┐
                │                │  Django   │
                │                │    API    │
                │                └─────┬─────┘
                │                      │
                │                ┌─────▼─────┐
                │                │   MySQL   │
                │                └───────────┘
                │
          SyncManager
                │
                └──────── Synchronisation
```

---

# 💻 3. Technologies utilisées

## Frontend

Le frontend utilise principalement :

* React Native
* Expo
* TypeScript
* React Navigation
* SQLite
* AsyncStorage
* architecture Repository
* système de synchronisation Offline-First

## Backend

Le backend utilise :

* Python
* Django
* Django REST Framework
* MySQL

---

# 📂 4. Structure du frontend

La structure principale est organisée autour des écrans, composants, repositories, base locale et outils de synchronisation.

```text
frontend/
│
├── src/
│   │
│   ├── screens/
│   │   ├── DashboardScreen.tsx
│   │   ├── FinanceScreen.tsx
│   │   ├── FarmsScreen.tsx
│   │   ├── FarmDetailScreen.tsx
│   │   ├── LotDetailScreen.tsx
│   │   ├── EmployeesScreen.tsx
│   │   ├── TasksScreen.tsx
│   │   ├── AttendanceScreen.tsx
│   │   ├── PayrollScreen.tsx
│   │   ├── StatisticsScreen.tsx
│   │   └── ...
│   │
│   ├── components/
│   │
│   ├── repositories/
│   │
│   ├── database/
│   │
│   ├── utils/
│   │   ├── syncManager.ts
│   │   └── offlineStorage.ts
│   │
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   │
│   ├── context/
│   │
│   ├── hooks/
│   │
│   ├── api/
│   │
│   └── i18n/
│
└── ...
```

---

# 🔐 5. Rôles utilisateurs

SolFerme possède principalement deux types d'utilisateurs :

## 👑 PROPRIETAIRE

Le propriétaire possède les droits de gestion complets de l'exploitation.

Il peut notamment accéder à :

* finances ;
* employés ;
* base de données ;
* historique global ;
* statistiques ;
* gestion des fermes ;
* gestion des lots ;
* paie ;
* rapports ;
* exportations ;
* opérations réservées au propriétaire.

## 👷 EMPLOYE

L'employé possède un accès limité aux fonctionnalités nécessaires à son travail.

Il peut notamment accéder à :

* son tableau de bord ;
* ses tâches ;
* ses présences ;
* sa paie ;
* ses demandes ;
* certaines informations liées aux fermes/lots selon les permissions prévues.

### ⚠️ Règle importante

Les permissions ne doivent jamais être déterminées uniquement par l'interface.

Le frontend doit respecter les permissions existantes et ne doit pas contourner les règles du backend.

---

# 🧠 6. LOGIQUE MÉTIER — RÈGLE LA PLUS IMPORTANTE DU PROJET

SolFerme n'est pas un simple système CRUD.

Une opération réalisée dans une ferme représente un événement réel.

Par conséquent :

> Une donnée historique ne doit jamais être supprimée ou modifiée arbitrairement simplement parce qu'un utilisateur veut la corriger.

Avant toute modification d'une fonctionnalité, il faut comprendre la différence entre :

* modification ;
* annulation ;
* archivage ;
* suppression.

---

# ✏️ 7. Modification

La **modification** sert à corriger ou mettre à jour une information lorsque cela est autorisé par la logique métier.

Exemple :

```text
Production enregistrée :
56 casiers
```

Si une information saisie est incorrecte et que la modification est autorisée, elle peut être corrigée.

La modification ne doit cependant pas être utilisée pour effacer artificiellement l'historique.

---

# ❌ 8. Annulation

L'**annulation** sert à invalider une opération qui a réellement été enregistrée.

Une annulation n'est pas une suppression.

Exemple :

```text
Production
56 casiers
       ↓
Annulation
       ↓
Production annulée
```

L'opération doit rester identifiable dans l'historique.

Le système doit pouvoir comprendre qu'une opération existait mais qu'elle a ensuite été annulée.

### ⚠️ Important

Après une annulation :

* les données dépendantes doivent être recalculées correctement ;
* les cartes/statistiques doivent être mises à jour ;
* l'historique doit refléter l'annulation ;
* le stock concerné doit être recalculé ;
* aucune suppression physique injustifiée ne doit être effectuée.

---

# 📦 9. Archivage

L'archivage sert à retirer une donnée de la vue active sans la supprimer.

Exemple :

```text
Ferme active
      ↓
Archivage
      ↓
Ferme archivée
```

La ferme existe toujours dans le système.

Elle peut éventuellement être réactivée lorsque la logique métier l'autorise.

L'archivage ne doit donc pas être confondu avec la suppression.

---

# 🗑️ 10. Suppression

La suppression est une opération beaucoup plus forte.

Elle consiste à supprimer définitivement une donnée lorsque la logique métier autorise réellement cette opération.

### ⚠️ Règle spécifique importante

Le bouton de suppression n'est pas disponible partout.

La suppression est réservée aux endroits prévus par la logique métier de SolFerme.

En particulier :

> La suppression d'un historique est autorisée dans le **Journal d'activité global** lorsque les règles le permettent.

Elle ne doit pas être ajoutée arbitrairement dans les historiques d'actions d'un lot.

Par exemple :

```text
Lot
 └── Historique des actions
      ├── Production
      ├── Vente
      ├── Alimentation
      ├── Santé
      └── Conversion
```

Cet historique ne doit pas recevoir un bouton de suppression simplement pour faciliter l'interface.

---

# 🐣 11. Gestion des lots

Un lot représente un groupe de volailles appartenant à une ferme.

Un lot possède notamment :

* une quantité initiale ;
* une date d'achat ;
* une ferme ;
* une production ;
* des ventes ;
* des mouvements ;
* des informations de santé ;
* de l'alimentation ;
* un historique d'actions.

Les données d'un lot doivent rester cohérentes avec toutes les opérations réalisées dessus.

---

# 🥚 12. Production et conversion des œufs

La production constitue une partie importante de SolFerme.

Le système distingue notamment :

* casiers produits ;
* casiers vendables ;
* casiers en attente ;
* conversions ;
* casiers vendus ;
* stock disponible.

### Exemple

Une production peut être :

```text
363 casiers produits
306 casiers vendables
57 casiers en attente
```

Les casiers en attente peuvent ensuite être convertis selon les règles métier.

Il ne faut jamais modifier directement les compteurs uniquement pour faire correspondre deux écrans.

Les statistiques doivent être calculées à partir des opérations réelles.

---

# 📊 13. Cohérence des stocks

Plusieurs écrans peuvent afficher des indicateurs différents.

Par exemple :

```text
Vendables totaux
        =
Vendables disponibles
+
Vendables déjà vendus
```

Un écart entre deux écrans n'est donc pas forcément un bug.

Avant de modifier un calcul :

1. identifier la définition exacte de l'indicateur ;
2. identifier sa source ;
3. vérifier les opérations prises en compte ;
4. vérifier les ventes ;
5. vérifier les annulations ;
6. vérifier les conversions ;
7. vérifier les périodes utilisées.

---

# 💰 14. Gestion financière

SolFerme gère notamment :

* ventes ;
* créances ;
* paiements ;
* encaissements ;
* dépenses ;
* revenus ;
* bénéfices ;
* paie ;
* bonus.

Les données financières sont sensibles.

Une modification d'interface ne doit jamais modifier :

* les calculs ;
* les montants ;
* les statuts ;
* les paiements ;
* les créances ;
* les règles d'annulation.

---

# 👨‍💼 15. Gestion des employés

Le système permet notamment :

* création d'employés ;
* modification ;
* gestion des tâches ;
* présence ;
* paie ;
* bonus ;
* demandes ;
* consultation du profil.

Les informations liées aux employés doivent respecter les permissions du rôle connecté.

---

# 💵 16. Gestion de la paie

La paie comprend notamment :

* salaires ;
* paiements ;
* bonus ;
* historique ;
* masse salariale ;
* statut des paiements.

Une annulation de paiement doit respecter la logique métier.

Afficher un message de succès ne suffit pas :

```text
Confirmation
     ↓
Action backend
     ↓
Mise à jour des données
     ↓
Mise à jour de l'interface
     ↓
Historique cohérent
```

---

# 🔄 17. Architecture Offline-First

SolFerme est conçu pour fonctionner même lorsque la connexion est indisponible.

Principe général :

```text
Utilisateur
     ↓
Frontend
     ↓
SQLite local
     ↓
Sync Queue
     ↓
Connexion disponible
     ↓
SyncManager
     ↓
API Django
     ↓
Base serveur
```

### Lecture

Les données doivent autant que possible être lues depuis la source locale prévue par l'architecture Offline-First.

### Écriture

Une opération locale peut être enregistrée puis synchronisée avec le serveur lorsque la connexion est disponible.

---

# 🔁 18. Synchronisation

Le `SyncManager` est responsable de la synchronisation des données.

Il peut notamment gérer :

* opérations en attente ;
* synchronisation ;
* conflits ;
* correspondance des identifiants ;
* déduplication ;
* récupération des données serveur.

### ⚠️ Important

Il ne faut pas remplacer ou contourner le système Offline-First pour résoudre rapidement un problème d'interface.

Avant toute modification :

```text
UI
 ↓
Repository
 ↓
Database / API
 ↓
SyncManager
```

Il faut identifier à quel niveau se trouve réellement le problème.

---

# 🖥️ 19. Android et Web/Desktop

Android est la **référence fonctionnelle** du projet.

Les adaptations Desktop/Web ont été réalisées progressivement.

Le principe est :

```text
Android
   ↓
Source de vérité
   ↓
Web/Desktop
   ↓
Adaptation visuelle
```

L'objectif n'est pas de créer une logique métier différente pour le Web.

Le Web doit utiliser les mêmes règles métier.

---

# 📱 20. Règle de non-régression Android

Toute modification Desktop/Web doit respecter :

> Android ne doit pas être modifié accidentellement.

Les adaptations spécifiques au Web doivent généralement être conditionnées par :

```typescript
Platform.OS === 'web'
```

et/ou :

```typescript
isDesktop
isTablet
isDesktopOrTablet
```

Une modification de style Desktop ne doit pas casser :

* les champs ;
* les curseurs ;
* les montants ;
* les boutons ;
* les modales ;
* les ScrollView ;
* la navigation Android.

---

# 🌐 21. Responsive Design

Le projet utilise notamment `useBreakpoint()` pour déterminer la taille d'écran.

Les interfaces Desktop doivent :

* utiliser correctement l'espace disponible ;
* éviter les débordements horizontaux ;
* éviter les interfaces inutilement larges ;
* conserver la structure visuelle actuelle ;
* ne pas inventer un nouveau design ;
* rester simples à manipuler à la souris.

### Règle importante

Adapter l'affichage ne signifie pas réécrire l'application.

On privilégie :

* `maxWidth` ;
* centrage ;
* `flexWrap` ;
* grilles adaptées ;
* largeur contrôlée ;
* modales centrées ;
* tableaux lorsque cela améliore la lisibilité.

---

# 🎨 22. Design

SolFerme utilise principalement une identité visuelle basée sur :

* jaune ;
* orange ;
* blanc ;
* couleurs associées à l'univers des œufs et de l'aviculture.

Le design existant doit être conservé.

Lors d'une adaptation Desktop :

> Ne pas changer inutilement les couleurs, formes, composants ou identité visuelle.

L'objectif est de rendre l'interface plus agréable et plus compacte, pas de refaire le design.

---

# ⚠️ 23. Gestion des erreurs

Les erreurs du backend doivent être affichées correctement à l'utilisateur.

Un problème ne doit pas être masqué par un message générique du type :

```text
Une erreur est survenue.
```

lorsque le backend fournit une raison exploitable.

Le Web doit notamment avoir un comportement cohérent avec Android.

Lorsqu'une action échoue :

```text
Utilisateur
   ↓
Action
   ↓
Backend
   ↓
Erreur
   ↓
Extraction du message
   ↓
Message clair à l'utilisateur
```

Cela est particulièrement important pour :

* annulation ;
* modification ;
* suppression ;
* archivage ;
* réactivation ;
* paiement ;
* rappel ;
* vente ;
* production ;
* conversion ;
* tâches ;
* paie.

---

# 🌍 24. Traductions

Le projet utilise un système de traduction.

Les traductions doivent être cohérentes entre les langues disponibles.

Une clé appelée dans un écran doit exister dans les dictionnaires correspondants.

Éviter les fallbacks du type :

```text
Texte indisponible
```

Lorsqu'un nouveau texte est ajouté, vérifier les fichiers de traduction concernés.

---

# 📄 25. Exportations

SolFerme possède plusieurs fonctionnalités d'export :

* PDF ;
* rapports ;
* statistiques ;
* données globales ;
* paie ;
* production ;
* stock ;
* etc.

Un export Web doit produire un document réellement lisible.

Avant de considérer un export comme terminé, vérifier :

* données présentes ;
* titres ;
* colonnes ;
* montants ;
* dates ;
* pagination ;
* largeur ;
* lisibilité ;
* informations importantes ;
* compatibilité avec les données réelles.

Un bouton d'export qui ne déclenche rien doit être considéré comme un bug.

---

# 🧭 26. Navigation

Les routes principales sont définies dans :

```text
src/navigation/AppNavigator.tsx
```

Avant d'ajouter une route :

1. vérifier si une route existante répond déjà au besoin ;
2. vérifier les permissions ;
3. vérifier la navigation Android ;
4. vérifier la navigation Web ;
5. ne pas inventer de route inutile.

---

# 🧪 27. Validation avant modification

Avant de modifier un écran important, effectuer :

### 1. Audit

Identifier :

* données utilisées ;
* repositories ;
* handlers ;
* permissions ;
* navigation ;
* logique métier ;
* styles ;
* comportement Android ;
* comportement Web.

### 2. Modification minimale

Modifier uniquement ce qui est nécessaire.

### 3. Vérification TypeScript

Lancer :

```bash
npx tsc --noEmit
```

### 4. Vérification des différences

Contrôler :

```text
git diff
```

ou l'équivalent disponible dans l'environnement.

### 5. Vérification métier

S'assurer que :

* les handlers sont toujours présents ;
* les repositories sont inchangés si aucune modification n'est nécessaire ;
* les permissions sont intactes ;
* les statuts sont inchangés ;
* les calculs sont inchangés.

---

# 🚫 28. Ce qu'un développeur/agent ne doit PAS faire

Ne pas :

* supprimer une logique métier pour résoudre un problème d'interface ;
* modifier les calculs sans audit ;
* supprimer des historiques pour corriger un affichage ;
* ajouter un bouton de suppression partout ;
* contourner les repositories ;
* contourner le SyncManager ;
* créer une logique Web différente de la logique Android ;
* modifier `Input.tsx` sans nécessité ;
* changer les règles d'annulation ;
* modifier les statuts arbitrairement ;
* modifier les permissions ;
* supprimer une fonctionnalité Android pour faciliter le Web ;
* inventer des données ;
* considérer un message de succès comme preuve que l'opération a réellement été appliquée.

---

# 🔍 29. Méthode recommandée pour les futurs agents IA

Tout agent travaillant sur SolFerme doit suivre cette méthode :

```text
1. Comprendre la demande
        ↓
2. Auditer le code existant
        ↓
3. Identifier la logique métier concernée
        ↓
4. Identifier les fichiers concernés
        ↓
5. Vérifier Android
        ↓
6. Vérifier Web/Desktop
        ↓
7. Modifier uniquement le nécessaire
        ↓
8. Vérifier TypeScript
        ↓
9. Vérifier les handlers
        ↓
10. Vérifier les permissions
        ↓
11. Vérifier Offline-First
        ↓
12. Vérifier le résultat
```

---

# 📝 30. Règle fondamentale pour les agents IA

Avant toute modification importante, l'agent doit comprendre que :

> **SolFerme est une application métier existante.**

Il ne doit pas traiter le projet comme un nouveau projet dans lequel il peut librement réorganiser les fonctionnalités.

Une demande d'amélioration visuelle doit rester une amélioration visuelle.

Une demande de correction d'un bug métier doit être traitée après identification précise de la logique concernée.

Lorsqu'une règle métier existe déjà, elle doit être respectée même si une autre solution semble techniquement plus simple.

---

# 🚀 31. Installation du projet

## Cloner le projet

```bash
git clone <URL_DU_REPOSITORY>
cd SolFerme
```

## Frontend

```bash
cd frontend
npm install
```

Puis lancer Expo :

```bash
npx expo start
```

Pour le Web :

```bash
npx expo start --web
```

## Backend

```bash
cd backend
```

Créer/configurer l'environnement Python selon la configuration du projet puis installer les dépendances :

```bash
pip install -r requirements.txt
```

Lancer Django :

```bash
python manage.py runserver
```

---

# ⚙️ 32. Variables d'environnement

Les informations sensibles ne doivent jamais être écrites directement dans le code.

Les variables concernant notamment :

* API ;
* base de données ;
* authentification ;
* clés secrètes ;
* configuration de production ;

doivent être placées dans les fichiers d'environnement prévus par le projet.

Ne jamais publier :

```text
.env
```

avec des informations sensibles.

---

# 🔒 33. Sécurité

Ne jamais committer :

* mots de passe ;
* tokens ;
* clés API ;
* secrets Django ;
* identifiants de base de données ;
* fichiers `.env` contenant des secrets.

Le backend reste responsable de la validation finale des permissions et des opérations sensibles.

---

# 📚 34. État général du projet

Le projet a progressivement reçu des adaptations Desktop/Web tout en conservant Android comme référence.

Les principales phases d'adaptation ont concerné :

* navigation ;
* Dashboard ;
* Finance ;
* Fermes ;
* Lots ;
* Employés ;
* Tâches ;
* Présences ;
* Paie ;
* Statistiques ;
* Formulaires ;
* Modales ;
* Profils ;
* Paramètres ;
* Centre d'aide ;
* responsive Web/Desktop.

L'objectif global reste :

> **Conserver une seule logique métier et adapter uniquement la présentation selon la plateforme.**

---

# 🛠️ 35. En cas de bug

Lorsqu'un bug est découvert, ne pas corriger immédiatement au hasard.

Identifier d'abord :

```text
Bug visuel ?
Bug frontend ?
Bug repository ?
Bug SQLite ?
Bug synchronisation ?
Bug API ?
Bug backend ?
Bug logique métier ?
Bug permission ?
```

Exemple :

Si Android et Web affichent tous les deux :

```text
Succès
```

mais que la donnée ne change pas réellement, le problème n'est probablement pas uniquement visuel.

Il faut suivre toute la chaîne :

```text
Bouton
 ↓
Handler
 ↓
Repository
 ↓
API / SQLite
 ↓
Backend
 ↓
Réponse
 ↓
Mise à jour locale
 ↓
Rafraîchissement UI
```

---

# 👨‍💻 36. Pour les nouveaux contributeurs

Avant de modifier le projet, il est fortement recommandé de lire dans cet ordre :

1. ce README ;
2. `AppNavigator.tsx` ;
3. les repositories ;
4. `syncManager.ts` ;
5. la base locale ;
6. les écrans concernés ;
7. les endpoints backend correspondants ;
8. les modèles Django concernés.

Ne jamais modifier une fonctionnalité métier importante sans comprendre son historique et ses dépendances.

---

# 📌 37. Résumé

SolFerme est une application de gestion avicole **Offline-First**, multi-plateforme et orientée métier.

Les principes fondamentaux sont :

```text
Android = référence fonctionnelle
Web/Desktop = adaptation de présentation
Backend = source de validation métier
Repository = accès aux données
SQLite = stockage local
SyncManager = synchronisation
Historique = traçabilité
```

Et surtout :

> **L'historique réel de la ferme doit être préservé.**

Les opérations de :

* modification ;
* annulation ;
* archivage ;
* suppression ;

ne sont pas interchangeables.

Toute évolution du projet doit préserver cette logique.

---

# 🐔 SolFerme

**Gestion moderne et fiable des exploitations avicoles.**

> Une seule logique métier.
> Plusieurs plateformes.
> Des données cohérentes.
> Un historique préservé.
