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