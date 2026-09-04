# Administrer le backend SolFerme (PythonAnywhere)

Guide de référence pour gérer l'API au quotidien, sans être expert.
Complément du guide d'installation : [DEPLOIEMENT_PYTHONANYWHERE.md](DEPLOIEMENT_PYTHONANYWHERE.md).

> **Valeurs de ton installation** (remplace si besoin)
>
> | | |
> |---|---|
> | Utilisateur PythonAnywhere | `ahmad5` |
> | URL de l'API | `https://ahmad5.pythonanywhere.com` |
> | Admin Django | `https://ahmad5.pythonanywhere.com/admin/` |
> | Compte admin | `barryedu56@gmail.com` |
> | Code | `~/SolFerme` (= `/home/ahmad5/SolFerme`) |
> | Config secrète | `~/SolFerme/backend/.env` |
> | Environnement Python | `solferme` (`~/.virtualenvs/solferme`) |
> | Sauvegardes locales | `~/solferme-backups/` (14 derniers jours) |
> | Sauvegardes hors-site | Google Drive, dossier **SolFerme-Backups** (90 derniers jours), compte `barryedu56@gmail.com`, remote rclone `gdrive` |
> | Fichier WSGI | `/var/www/ahmad5_pythonanywhere_com_wsgi.py` |
> | Base de données | `ahmad5$solferme` sur `ahmad5.mysql.pythonanywhere-services.com` |

---

## Sommaire

1. [Comment c'est organisé](#1-comment-cest-organisé)
2. [Se connecter et travailler](#2-se-connecter-et-travailler)
3. [Déployer une mise à jour](#3-déployer-une-mise-à-jour)
4. [La base de données](#4-la-base-de-données)
5. [Les sauvegardes](#5-les-sauvegardes)
6. [Les tâches planifiées](#6-les-tâches-planifiées)
7. [Les logs — où regarder quand ça casse](#7-les-logs--où-regarder-quand-ça-casse)
8. [Le fichier `.env` (configuration)](#8-le-fichier-env-configuration)
9. [Gérer les comptes utilisateurs](#9-gérer-les-comptes-utilisateurs)
10. [Surveiller la santé et les quotas](#10-surveiller-la-santé-et-les-quotas)
11. [HTTPS et domaine](#11-https-et-domaine)
12. [Sécurité — les règles à ne jamais enfreindre](#12-sécurité--les-règles-à-ne-jamais-enfreindre)
13. [Quand quelque chose casse — diagnostic](#13-quand-quelque-chose-casse--diagnostic)
14. [Aide-mémoire commandes](#14-aide-mémoire-commandes)

---

## 1. Comment c'est organisé

Ton backend sur PythonAnywhere = **4 morceaux** :

| Morceau | Où le gérer | À quoi ça sert |
|---|---|---|
| **Web app** (Django) | onglet **Web** | Répond aux requêtes de l'app mobile / du navigateur |
| **Base MySQL** | onglet **Databases** | Stocke toutes les données (fermes, ventes, employés…) |
| **Tâches planifiées** | onglet **Tasks** | Rappels automatiques + sauvegarde quotidienne |
| **Fichiers** | onglet **Files** ou console | Le code, le `.env`, les logs, les sauvegardes |

Les onglets du tableau de bord :

- **Dashboard** — vue d'ensemble, consommation CPU
- **Consoles** — ouvrir un terminal (« Bash »)
- **Files** — parcourir / éditer les fichiers dans le navigateur
- **Web** — config de l'app, bouton **Reload**, liens vers les logs
- **Tasks** — tâches planifiées et « always-on »
- **Databases** — MySQL (mot de passe, création de base, console SQL)
- **Account** — plan, quotas, mot de passe du compte, 2FA

---

## 2. Se connecter et travailler

### La console Bash (l'outil principal)

Onglet **Consoles** → **Bash**. C'est un terminal Linux dans le navigateur.
Premier réflexe à chaque session :

```bash
workon solferme
cd ~/SolFerme/backend
```

`workon solferme` active l'environnement Python (le prompt affiche `(solferme)`).
Sans ça, `python manage.py …` utilisera le mauvais Python.

### L'onglet Files

Pour éditer un fichier à la souris (ex. le `.env`) : **Files** → navigue jusqu'au
dossier → icône **crayon**. Bouton **Save** en haut à droite.

### VS Code depuis ton PC (confortable, optionnel)

Le plan Developer donne un accès SSH. Tu peux connecter VS Code (« Remote - SSH »)
pour éditer les fichiers du serveur comme s'ils étaient locaux.
Hôte SSH : `ssh.pythonanywhere.com`, utilisateur `ahmad5`.

---

## 3. Déployer une mise à jour

Le cycle, à chaque fois que tu changes le code sur ton PC :

```
Sur le PC :  git add -A  →  git commit -m "..."  →  git push
Sur le serveur :  git pull  →  (étapes ci-dessous)  →  Reload
```

### Sur le serveur (console Bash)

```bash
workon solferme
cd ~/SolFerme && git pull
```

Puis, **seulement si concerné** :

| Si `git pull` a modifié… | …lance |
|---|---|
| `backend/requirements.txt` | `pip install -r backend/requirements.txt` |
| un fichier dans `backend/farm_management/migrations/` | `cd backend && python manage.py migrate` |
| le CSS/JS de l'admin (rare) | `cd backend && python manage.py collectstatic --noinput` |

### Toujours pour finir

Onglet **Web** → gros bouton vert **Reload**.
Sans Reload, l'ancienne version continue de tourner.

> **Règle d'or** : toute modification du `.env` ou du code exige un **Reload**.

---

## 4. La base de données

### La voir sans risque : l'admin Django

`https://ahmad5.pythonanywhere.com/admin/` — interface web pour consulter et
éditer les données. **C'est la façon sûre.** Connexion avec le compte admin.

### Console SQL

Deux moyens :

```bash
# a) via Django (se connecte automatiquement à la bonne base)
cd ~/SolFerme/backend && python manage.py dbshell

# b) directement (l'onglet Databases donne aussi un bouton "console")
mysql --user=ahmad5 --host=ahmad5.mysql.pythonanywhere-services.com -p 'ahmad5$solferme'
```

Quelques requêtes utiles (lecture seule, sans danger) :

```sql
SELECT COUNT(*) FROM farm_management_user;
SELECT id, name, status FROM farm_management_farm;
SELECT id, email, is_superuser, is_active FROM farm_management_user;
SELECT COUNT(*) FROM farm_management_sale WHERE status = 'ACTIVE';
SHOW TABLES;
```

> ⚠️ **JAMAIS** de `DELETE` ou `UPDATE` sans `WHERE`, et **jamais** sans avoir
> fait une sauvegarde juste avant (section 5). Une erreur ici est irréversible.

### Compter / inspecter via Django (plus lisible)

```bash
python manage.py shell -c "from farm_management.models import *; print('Fermes:', Farm.objects.count(), '| Lots:', Lot.objects.count(), '| Ventes:', Sale.objects.count())"
```

---

## 5. Les sauvegardes

**État : en place et vérifié (2026-09-04). Entièrement automatique — rien à faire au quotidien.**

Chaque nuit à **02:00**, une tâche planifiée (onglet Tasks) lance
`~/SolFerme/backend/scripts/backup_db.sh`, qui :

1. Copie toute la base (`mysqldump`) dans un fichier daté, compressé
2. L'enregistre en local : `~/solferme-backups/` (garde les **14** derniers jours)
3. L'envoie aussi sur **Google Drive** (rclone, remote `gdrive`, dossier
   **SolFerme-Backups**, garde les **90** derniers jours) — pour survivre à la
   perte du compte PythonAnywhere lui-même

### Vérifier que ça tourne (de temps en temps, pas obligatoire)

- Onglet **Tasks** → icône 📋 sur la ligne « Daily 02:00 » → journal des dernières exécutions
- Google Drive (`barryedu56@gmail.com`) → dossier **SolFerme-Backups** → un fichier `.sql.gz` daté du jour

### Sauvegarde manuelle / export à la demande

La **même commande**, à tout moment, fait exactement la même chose (local + Drive) :

```bash
bash ~/SolFerme/backend/scripts/backup_db.sh
```

Sortie attendue : `OK — XX Ko, N table(s) détectée(s)` puis `Copie hors-site OK (rétention 90 j).`

### Récupérer une copie sur ton PC

- Depuis PythonAnywhere : onglet **Files** → `solferme-backups/` → clic sur le `.sql.gz` → **Download**
- Depuis Google Drive : directement sur drive.google.com, dossier **SolFerme-Backups**

### Restaurer

> ⚠️ **La restauration ÉCRASE la base en ligne.** À ne lancer QUE le jour où tu
> as réellement perdu des données. Pas pour « voir si ça marche ».

**Pour tester une sauvegarde sans risque**, restaure-la dans une base *séparée* :
onglet Databases → créer une base `test` → `ahmad5$test` devient ta cible.

```bash
# 1. Choisir le fichier réel (adapte la date/heure) :
ls -1t ~/solferme-backups/
FICHIER=~/solferme-backups/solferme_2026-09-04_1109.sql.gz

# 2. Réinjecter (mot de passe MySQL demandé) :
gunzip -c "$FICHIER" | mysql \
  --user=ahmad5 \
  --host=ahmad5.mysql.pythonanywhere-services.com \
  -p 'ahmad5$solferme'          # <- cible ; mettre 'ahmad5$test' pour un test
```

Tout revient à l'état de la date du fichier. Puis onglet **Web** → **Reload**.

**Si même le serveur PythonAnywhere est perdu** : récupère le fichier depuis
Google Drive (à la main, ou avec rclone configuré sur n'importe quelle autre
machine — `rclone copy gdrive:SolFerme-Backups/<fichier> .`), puis réinjecte-le
sur la nouvelle base MySQL avec la même commande.

### Si la copie Google Drive s'arrête (jeton expiré)

L'appli Google `SolFerme Backup` est en statut **« Test »** — pense à cliquer
**« Publier l'application »** dans Google Cloud Console (Google Auth Platform →
Audience) pour éviter toute expiration du jeton par inactivité prolongée.
Si malgré tout `rclone` réclame une nouvelle autorisation un jour, seule la
**sauvegarde locale** est affectée entre-temps — refaire simplement l'étape
« Configurer le remote gdrive » ci-dessous.

<details>
<summary>Reconfigurer le remote Google Drive depuis zéro (rare — nouveau serveur, jeton révoqué...)</summary>

**a) Installer rclone sur le serveur** (sans droits admin) :

```bash
mkdir -p ~/bin && cd /tmp
wget https://downloads.rclone.org/rclone-current-linux-amd64.zip
unzip -oq rclone-current-linux-amd64.zip
cp rclone-*-linux-amd64/rclone ~/bin/ && chmod +x ~/bin/rclone
~/bin/rclone version
```

**b) Configurer le remote `gdrive`** — `~/bin/rclone config` :
- `n` (new remote) → nom : **`gdrive`**
- Storage : **`drive`** (Google Drive)
- `client_id` / `client_secret` : l'identifiant OAuth créé pour SolFerme Backup
  dans Google Cloud Console (projet **SolFerme Backup**, écran de consentement
  externe + testeur `barryedu56@gmail.com` + scope `drive.file` déjà en place ;
  si le projet Cloud n'existe plus, refaire un « ID client OAuth » type
  *Application de bureau* dans APIs et services → Identifiants)
- `scope` : **`3`** (`drive.file` — rclone ne voit QUE les fichiers qu'il crée, le
  plus sûr)
- `service_account_file` : **vide — appuyer sur Entrée, ne rien taper** (surtout
  pas `n`, sinon la config est cassée en silence) · advanced config : `n`
- « Use web browser to automatically authenticate? » : **`n`** (on est sur un serveur)
- rclone affiche une commande `rclone authorize "drive" "..."` → **la copier**

**c) Autoriser depuis un PC avec navigateur :**

```powershell
C:\platform-tools\rclone.exe authorize "drive" "...colle-la-commande-du-serveur..."
```

Le navigateur s'ouvre → connexion **barryedu56@gmail.com** → écran « Google n'a
pas validé cette application » → **Continuer** → autoriser l'accès →
« Success! ». rclone affiche un bloc `eyJ0b2tlbi...` → **le copier**, le coller
dans le `rclone config` du serveur qui attend au prompt `config_token>`. Puis :
Shared Drive → `n`, garder → `y`, `q`.

**d) Vérifier :**

```bash
~/bin/rclone lsd gdrive:
bash ~/SolFerme/backend/scripts/backup_db.sh
```

La sortie doit finir par `Copie hors-site OK`.

</details>

### Copie hors-site vers Google Drive (rclone)

Pour survivre à la perte de tout le compte PythonAnywhere. Une fois configuré,
le script `backup_db.sh` envoie **automatiquement** chaque sauvegarde sur Drive
(rétention 90 jours côté Drive, 14 jours en local).

**a) Installer rclone sur le serveur** (sans droits admin) :

```bash
mkdir -p ~/bin && cd /tmp
wget https://downloads.rclone.org/rclone-current-linux-amd64.zip
unzip -oq rclone-current-linux-amd64.zip
cp rclone-*-linux-amd64/rclone ~/bin/ && chmod +x ~/bin/rclone
~/bin/rclone version
```

**b) Configurer le remote `gdrive`** — `~/bin/rclone config` :
- `n` (new remote) → nom : **`gdrive`**
- Storage : **`drive`** (Google Drive)
- `client_id` / `client_secret` : laisser **vide** (Entrée)
- `scope` : **`3`** (`drive.file` — rclone ne voit QUE les fichiers qu'il crée, le
  plus sûr)
- `service_account_file` : vide · advanced config : `n`
- « Use web browser to automatically authenticate? » : **`n`** (on est sur un serveur)
- rclone affiche une commande `rclone authorize "drive" "..."` → **la copier**

**c) Autoriser depuis ton PC** (qui a un navigateur) :

```powershell
C:\platform-tools\rclone.exe authorize "drive" "...colle-la-commande-du-serveur..."
```

Le navigateur s'ouvre → connexion **barryedu56@gmail.com** → Autoriser.
rclone affiche un bloc `{"access_token":...}` → **le copier**, le coller dans le
`rclone config` du serveur qui attend. Puis : Shared Drive → `n`, garder → `y`, `q`.

**d) Créer le dossier + tester :**

```bash
~/bin/rclone mkdir gdrive:SolFerme-Backups
bash ~/SolFerme/backend/scripts/backup_db.sh
```

La sortie doit finir par `Copie hors-site OK`. Vérifie dans Google Drive : dossier
**SolFerme-Backups** contenant le `.sql.gz` du jour.

**Restaurer depuis Drive** (le jour où même le serveur est perdu) : sur n'importe
quelle machine avec rclone configuré →
`rclone copy gdrive:SolFerme-Backups/solferme_AAAA-MM-JJ_HHMM.sql.gz .`

---

## 6. Les tâches planifiées

Onglet **Tasks**. Deux types :

- **Scheduled tasks** — s'exécutent à heure fixe (daily) ou toutes les heures (hourly).
- **Always-on tasks** — un processus qui tourne en continu (le plan Developer en inclut 1).

### Tâches SolFerme

| Tâche | Type | Commande |
|---|---|---|
| Rappels (push + retards) | Scheduled, **hourly** | `/home/ahmad5/.virtualenvs/solferme/bin/python /home/ahmad5/SolFerme/backend/manage.py process_reminders` |
| Sauvegarde base | Scheduled, **daily 02:00** | `bash /home/ahmad5/SolFerme/backend/scripts/backup_db.sh` |

### Gérer une tâche

- **Voir le journal** : icône « liste » (📋) dans la colonne Actions → montre les
  dernières exécutions et leur sortie. **Premier endroit à regarder si une tâche
  semble ne rien faire.**
- **Modifier** : icône crayon.
- **Désactiver temporairement** : icône pause. **Supprimer** : croix rouge.
- Une tâche `hourly` tourne à la minute que tu choisis, chaque heure.

### Tester une commande de tâche à la main

Colle simplement sa commande dans une console Bash. Si elle marche là, elle
marchera en tâche planifiée.

---

## 7. Les logs — où regarder quand ça casse

Onglet **Web**, section **Log files**, 3 fichiers cliquables :

| Fichier | Contenu | Quand le lire |
|---|---|---|
| **error.log** | Traceback Python complet | Une page renvoie **500** / l'app plante |
| **server.log** | Démarrage de l'app, `print()`, messages WSGI | L'app ne démarre pas (**502**) |
| **access.log** | Chaque requête HTTP reçue (méthode, URL, code) | Vérifier qu'une requête arrive bien |

Depuis la console :

```bash
tail -n 50 /var/log/ahmad5.pythonanywhere.com.error.log
tail -f  /var/log/ahmad5.pythonanywhere.com.error.log   # suivi en direct (Ctrl+C pour arrêter)
```

Les logs sont **rotés** automatiquement (anciens dans `/var/log/`, suffixés `.1`, `.2.gz`…).

---

## 8. Le fichier `.env` (configuration)

Emplacement : `~/SolFerme/backend/.env`. **Jamais commité, jamais partagé.**

| Variable | Rôle |
|---|---|
| `DJANGO_DEBUG` | **Toujours `False`** en production |
| `DJANGO_SECRET_KEY` | Clé de signature. Si fuitée → en régénérer une (voir plus bas) |
| `DJANGO_ALLOWED_HOSTS` | Domaines autorisés. Doit contenir `ahmad5.pythonanywhere.com` |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` — force le HTTPS |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | Connexion MySQL. `DB_NAME` = `ahmad5$solferme` (avec le `$`) |
| `DB_INIT_COMMAND` | `SET sql_mode='STRICT_TRANS_TABLES'` (sinon erreur 1227 sur MySQL managé) |
| `CORS_ALLOWED_ORIGINS` | Origines web autorisées à appeler l'API (dont `localhost:8081` pour le dev) |
| `CORS_ALLOW_ALL_ORIGINS` | `False` en production |
| `EMAIL_HOST` … | SMTP. Commenté pour l'instant → les e-mails sont écrits dans les logs, pas envoyés |
| `DEFAULT_FROM_EMAIL` | Expéditeur des e-mails |
| `CONTACT_INBOX` | Boîte qui reçoit le formulaire de contact du site vitrine |

> **Après chaque modification du `.env` → onglet Web → Reload.**

### Régénérer une clé secrète (si fuite)

```bash
python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
```
Colle le résultat dans `DJANGO_SECRET_KEY`, Reload.
⚠️ Change la clé = déconnecte tous les utilisateurs (les jetons deviennent invalides).

---

## 9. Gérer les comptes utilisateurs

### Le compte SuperAdmin (un seul autorisé)

Le modèle `User` de SolFerme interdit d'avoir 2 SuperAdmin. Pour en créer un :

```bash
python manage.py createsuperuser
```

Si ça refuse (« un seul compte SuperAdmin ») → il en existe déjà un, réutilise-le.

### Réinitialiser un mot de passe

```bash
python manage.py changepassword barryedu56@gmail.com
```

### Désactiver / réactiver un utilisateur

Via l'admin `/admin/` (case « actif »), ou :

```bash
python manage.py shell -c "from farm_management.models import User; u=User.objects.get(email='x@y.com'); u.is_active=False; u.save(); print('désactivé')"
```

### Voir tous les comptes

```bash
python manage.py shell -c "from farm_management.models import User; [print(u.id, u.email, u.role, 'actif' if u.is_active else 'INACTIF') for u in User.objects.all()]"
```

---

## 10. Surveiller la santé et les quotas

Onglet **Account** :

| Ressource | Limite (plan Developer) | Où voir |
|---|---|---|
| **CPU / jour** | 5000 secondes | Barre sur le Dashboard |
| **Disque** | 5 Go | Dashboard, ou `du -sh ~/*` en console |
| **Web app** | 1 | — |

- **Si tu épuises le CPU du jour** : le serveur est ralenti (« tarpitted »)
  jusqu'à minuit UTC, puis repart. Rare avec peu d'utilisateurs.
- **Disque qui se remplit** : souvent les sauvegardes ou les logs.
  ```bash
  du -sh ~/solferme-backups ~/SolFerme ~/.virtualenvs
  ```
  La rotation du script garde 14 jours ; baisse `SOLFERME_BACKUP_KEEP_DAYS` si besoin.
- **L'app web** est relancée périodiquement par PythonAnywhere (c'est normal).
  Le premier chargement après une longue inactivité peut être lent.

---

## 11. HTTPS et domaine

- **Certificat HTTPS** : fourni automatiquement pour `ahmad5.pythonanywhere.com`.
- **Forcer HTTPS** : onglet Web → section Security → activé.
- **Domaine personnalisé** (`api.solferme.com`, plus tard) :
  1. Acheter `solferme.com`
  2. Onglet Web → « Add a new domain » → suivre les instructions (un enregistrement
     DNS `CNAME` vers `webapp-XXXX.pythonanywhere.com`)
  3. Ajouter le domaine à `DJANGO_ALLOWED_HOSTS` et `CORS_ALLOWED_ORIGINS` dans le `.env`
  4. Reload
  Le certificat du domaine perso est aussi automatique (Let's Encrypt).

---

## 12. Sécurité — les règles à ne jamais enfreindre

1. `DJANGO_DEBUG=False` en production. Toujours. (`True` expose la config et le code.)
2. Le `.env` ne quitte **jamais** le serveur. Pas de commit, pas de partage, pas de capture d'écran.
3. Mot de passe **fort** sur le compte PythonAnywhere + **2FA activée** (onglet Account).
4. Mot de passe MySQL fort, différent de celui du compte PA.
5. Une sauvegarde **avant** toute opération SQL manuelle.
6. Garder Django à jour (les mises à jour `6.0.x` sont surtout des correctifs de sécurité) :
   ```bash
   pip install --upgrade "django~=6.0.0" && python manage.py check --deploy
   ```
   Puis commit du `requirements.txt`, push, et sur le serveur `pip install -r ...` + Reload.
7. En cas de fuite d'un secret : régénère `DJANGO_SECRET_KEY`, change le mot de passe MySQL
   (onglet Databases) et reporte-le dans le `.env`, Reload.
8. Surveille qui a accès à `/admin/` (`python manage.py shell` → liste des `is_staff=True`).

---

## 13. Quand quelque chose casse — diagnostic

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| **502** sur tout le site | L'app n'a pas démarré | Lire `server.log` → souvent une erreur d'import / de config. Corriger, Reload. |
| **500** sur une page | Erreur Python à l'exécution | Lire `error.log` (dernier traceback). |
| **400 Bad Request** partout | `DJANGO_ALLOWED_HOSTS` vide ou faux | Corriger le `.env`, Reload. |
| Erreurs base de données | `.env` `DB_*` faux, ou MySQL indisponible | Vérifier l'onglet Databases ; tester `python manage.py dbshell`. |
| `/admin/` sans style (CSS) | `collectstatic` pas fait / pas de Reload | `python manage.py collectstatic --noinput` puis Reload. |
| Une tâche planifiée « ne fait rien » | Erreur dans la commande | Lire le **log de la tâche** (icône 📋, onglet Tasks). |
| Push / e-mails non reçus | Plan gratuit, ou SMTP non configuré | Vérifier le plan (Account) et le bloc `EMAIL_*` du `.env`. |
| App mobile : « impossible de joindre le serveur » | API down, ou mauvaise URL dans l'app | Ouvrir `https://ahmad5.pythonanywhere.com/api/` dans un navigateur : doit répondre du JSON. |
| Tout est lent | Quota CPU du jour épuisé | Onglet Account → attendre le reset à minuit UTC. |

**Réflexe général** : `error.log` d'abord, `server.log` ensuite, puis le log de la
tâche concernée.

---

## 14. Aide-mémoire commandes

```bash
# --- Toujours en début de session ---
workon solferme
cd ~/SolFerme/backend

# --- Déployer une mise à jour ---
cd ~/SolFerme && git pull
pip install -r backend/requirements.txt        # si requirements a changé
cd backend
python manage.py migrate                        # si nouvelles migrations
python manage.py collectstatic --noinput        # si statiques admin changés
#   → puis onglet Web → Reload

# --- Base de données ---
python manage.py dbshell                         # console SQL
python manage.py shell                           # console Python/Django
bash ~/SolFerme/backend/scripts/backup_db.sh     # sauvegarde immédiate (local + Drive)
~/bin/rclone lsd gdrive:                          # vérifier l'accès à Google Drive
~/bin/rclone ls gdrive:SolFerme-Backups           # lister les sauvegardes sur Drive

# --- Comptes ---
python manage.py changepassword <email>
python manage.py createsuperuser

# --- Diagnostic ---
tail -n 50 /var/log/ahmad5.pythonanywhere.com.error.log
tail -n 50 /var/log/ahmad5.pythonanywhere.com.server.log
python manage.py check --deploy                  # vérifie la config de prod

# --- Espace disque ---
du -sh ~/solferme-backups ~/SolFerme ~/.virtualenvs
```

---

## Ressources

- Aide PythonAnywhere : <https://help.pythonanywhere.com/>
- Forum PythonAnywhere : <https://www.pythonanywhere.com/forums/>
- Support : `support@pythonanywhere.com` (répondent vite, en anglais)
- Doc Django déploiement : <https://docs.djangoproject.com/en/6.0/howto/deployment/>
- Guide d'installation SolFerme : [DEPLOIEMENT_PYTHONANYWHERE.md](DEPLOIEMENT_PYTHONANYWHERE.md)
