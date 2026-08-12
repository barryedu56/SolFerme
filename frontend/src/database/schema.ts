/**
 * Schéma SQLite local — miroir des modèles Django backend.
 *
 * VERSION 2 — Ajout des colonnes expense_id (FK OneToOne Django).
 *
 * ⚠️ IMPORTANT — Divergences avec le backend Django :
 *
 * CHAMPS CALCULÉS (dans le serializer Django, PAS dans le modèle MySQL) :
 *   - lots.current_eggs_stock, lots.current_broken_eggs_stock : calculés
 *     par le LotSerializer via aggregation des productions/ventes d'œufs.
 *   - lots.total_casiers_produits : somme des casiers_produits des productions actives.
 *   - lots.has_data : flag indiquant si le lot a des données associées.
 *   - employees.bonus_total : somme des primes actives.
 *   - employees.estimated_total : salaire + bonus_total.
 *
 * CHAMPS DÉNORMALISÉS (stockés localement, absents du backend) :
 *   - employees.lots_json : JSON array [{id, name}] — représentation M2M Django.
 *   - employees.last_bonus_json : JSON object — dernière prime.
 *   - *_name / *_label : champs de convenance pour affichage sans JOIN.
 *   - employees.user_name, user_email, user_phone, user_image : dénormalisés.
 *
 * COLONNES FK CRÉÉES PAR SIGNAUX DJANGO (persistées localement) :
 *   - feed_purchases.expense_id : FK → expenses (OneToOneField, créé par signal).
 *   - health_purchases.expense_id : FK → expenses (OneToOneField, créé par signal).
 *   - payrolls.expense_id : FK → expenses (OneToOneField, créé par signal).
 *   Ces colonnes sont synchronisées depuis le serveur pour maintenir
 *   la cohérence achat/dépense/salaire localement.
 *
 * Stratégie d'ID :
 *  - Chaque table a `id INTEGER PRIMARY KEY` = le server_id MySQL.
 *  - Pour les enregistrements créés hors-ligne, on utilise un ID négatif temporaire
 *    (ex: -1, -2...). Le SyncManager remplace par le vrai ID après synchro.
 *  - `_needs_sync INTEGER DEFAULT 0` : marque les records créés/modifiés offline.
 */
export const VERSION = 11;

// Migrations incrémentales (appliquées seulement si _schema_version < VERSION)
export const MIGRATIONS: { from: number; sql: string[] }[] = [
  {
    from: 1,
    sql: [
      // Ajout des colonnes expense_id FK (créées par signaux Django)
      `ALTER TABLE feed_purchases ADD COLUMN expense_id INTEGER`,
      `ALTER TABLE health_purchases ADD COLUMN expense_id INTEGER`,
      `ALTER TABLE payrolls ADD COLUMN expense_id INTEGER`,
    ],
  },
  {
    from: 2,
    sql: [
      // Ajout de updated_at pour tracker le moment où un item sync_queue passe en PROCESSING
      // (nécessaire pour éviter de réactiver des items qui viennent juste d'être traités)
      `ALTER TABLE sync_queue ADD COLUMN updated_at TEXT`,
    ],
  },
  {
    from: 3,
    sql: [
      // Ajout de la colonne capacity aux fermes existantes
      `ALTER TABLE farms ADD COLUMN capacity INTEGER DEFAULT 0`,
    ],
  },
  {
    from: 4,
    sql: [
      // Ajout de la colonne created_at aux dépenses existantes pour le graphe par Jour
      `ALTER TABLE expenses ADD COLUMN created_at TEXT`,
    ],
  },
  {
    from: 5,
    sql: [
      // Ajout de la table farm_users (relation M2M Farm↔User absente précédemment)
      `CREATE TABLE IF NOT EXISTS farm_users (
        id INTEGER PRIMARY KEY,
        farm_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        user_name TEXT,
        user_email TEXT,
        role TEXT NOT NULL DEFAULT 'Worker',
        created_at TEXT,
        _needs_sync INTEGER DEFAULT 0,
        UNIQUE(farm_id, user_id)
      )`,
    ],
  },
  {
    from: 6,
    sql: [
      // Ajout des champs de coût détaillé sur les lots
      `ALTER TABLE lots ADD COLUMN unit_price REAL`,
      `ALTER TABLE lots ADD COLUMN subjects_price REAL`,
      `ALTER TABLE lots ADD COLUMN extra_expenses REAL DEFAULT 0`,
      `ALTER TABLE lots ADD COLUMN real_cost_per_subject REAL`,
      // Table des frais additionnels d'un lot
      `CREATE TABLE IF NOT EXISTS lot_expenses (
        id INTEGER PRIMARY KEY,
        lot_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        _needs_sync INTEGER DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_lot_expenses_lot ON lot_expenses(lot_id)`,
    ],
  },
  {
    from: 7,
    sql: [
      // Ajout de payment_status à la table sales existante
      `ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'NON_PAYE'`,
      // Création de la table sale_payments
      `CREATE TABLE IF NOT EXISTS sale_payments (
        id INTEGER PRIMARY KEY,
        sale_id INTEGER NOT NULL,
        farm_id INTEGER NOT NULL,
        lot_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'CASH',
        payment_date TEXT NOT NULL,
        reference TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIF',
        created_by_id INTEGER,
        created_by_name TEXT,
        created_at TEXT,
        updated_at TEXT,
        _needs_sync INTEGER DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id)`
    ],
  },
  {
    from: 8,
    sql: [
      // Création de la table egg_conversions (miroir du modèle Django EggConversion)
      `CREATE TABLE IF NOT EXISTS egg_conversions (
        id INTEGER PRIMARY KEY,
        production_id INTEGER NOT NULL,
        lot_id INTEGER NOT NULL,
        farm_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        from_state TEXT NOT NULL DEFAULT 'EN_ATTENTE',
        to_state TEXT NOT NULL DEFAULT 'VENDABLE',
        conversion_date TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIF',
        created_by_id INTEGER,
        created_by_name TEXT,
        created_at TEXT,
        updated_at TEXT,
        _needs_sync INTEGER DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_egg_conversions_production ON egg_conversions(production_id)`,
      `CREATE INDEX IF NOT EXISTS idx_egg_conversions_lot ON egg_conversions(lot_id, conversion_date)`,
    ],
  },
  {
    from: 9,
    sql: [
      // BUG-08 fix : lot_expenses et sale_payments étaient absents des endpoints syncables.
      // Aucun changement DDL nécessaire (tables déjà créées). Cette migration est un marqueur
      // de version pour garantir que les clients upgraderont bien à VERSION=10.
      // On en profite pour créer l'index manquant sur egg_conversions (idempotent).
      `CREATE INDEX IF NOT EXISTS idx_egg_conversions_farm ON egg_conversions(farm_id)`,
    ],
  },
  {
    from: 10,
    sql: [
      // Ajout de la colonne period_key à la table payrolls pour gérer la périodicité
      `ALTER TABLE payrolls ADD COLUMN period_key TEXT`,
    ],
  },
];

// Toutes les commandes CREATE TABLE dans l'ordre (respecte les FK)
export const SCHEMA_SQL: string[] = [

  // ─── 1. USERS ───
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    profile_image TEXT,
    role TEXT NOT NULL DEFAULT 'PROPRIETAIRE',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 2. FARMS ───
  `CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    description TEXT,
    capacity INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    has_data INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 2b. FARM USERS (membres d'une ferme, M2M Farm↔User) ───
  `CREATE TABLE IF NOT EXISTS farm_users (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    user_email TEXT,
    role TEXT NOT NULL DEFAULT 'Worker',
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0,
    UNIQUE(farm_id, user_id)
  )`,

  // ─── 3. LOTS ───
  `CREATE TABLE IF NOT EXISTS lots (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    breed TEXT NOT NULL,
    initial_quantity INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL,
    purchase_date TEXT NOT NULL,
    purchase_price REAL NOT NULL,
    unit_price REAL,                         -- prix unitaire par sujet (nouveau)
    subjects_price REAL,                     -- quantité × prix unitaire
    extra_expenses REAL DEFAULT 0,           -- total des frais supplémentaires
    real_cost_per_subject REAL,              -- coût total / quantité
    supplier TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    motif_fin TEXT,
    -- ⬇️ Champs calculés par le backend (LotSerializer), absents du modèle Django :
    current_eggs_stock REAL DEFAULT 0,      -- calculé: somme productions - ventes œufs
    current_broken_eggs_stock REAL DEFAULT 0, -- calculé: somme productions cassées - ventes cassées
    total_casiers_produits INTEGER DEFAULT 0, -- calculé: sum(productions.casiers_produits)
    has_data INTEGER DEFAULT 0,              -- calculé: flag présence de données liées
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 3b. LOT EXPENSES ───
  `CREATE TABLE IF NOT EXISTS lot_expenses (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 4. PRODUCTIONS ───
  `CREATE TABLE IF NOT EXISTS productions (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    casiers_produits INTEGER NOT NULL,
    casiers_vendables INTEGER NOT NULL,
    oeufs_casses INTEGER DEFAULT 0,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 4b. EGG CONVERSIONS ───
  `CREATE TABLE IF NOT EXISTS egg_conversions (
    id INTEGER PRIMARY KEY,
    production_id INTEGER NOT NULL,
    lot_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    from_state TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    to_state TEXT NOT NULL DEFAULT 'VENDABLE',
    conversion_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 5. SALES ───
  `CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    product_type TEXT NOT NULL DEFAULT 'NORMAL',
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    customer_name TEXT,
    customer_phone TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    payment_status TEXT DEFAULT 'NON_PAYE',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 5b. SALE PAYMENTS ───
  `CREATE TABLE IF NOT EXISTS sale_payments (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL,
    lot_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'CASH',
    payment_date TEXT NOT NULL,
    reference TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 6. FEEDS (distribution) ───
  `CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    feed_type TEXT NOT NULL DEFAULT 'Standard',
    quantity_kg REAL NOT NULL,
    bags_count INTEGER DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    supplier TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 7. HEALTH RECORDS (traitements) ───
  `CREATE TABLE IF NOT EXISTS health_records (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'Flacon',
    date TEXT NOT NULL,
    cost REAL DEFAULT 0,
    veterinarian TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 8. CHICKEN MOVEMENTS ───
  `CREATE TABLE IF NOT EXISTS chicken_movements (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    sale_id INTEGER,
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 9. EMPLOYEES ───
  `CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    -- ⬇️ Champs dénormalisés du User lié (absents du modèle Employee Django) :
    user_name TEXT,
    user_email TEXT,
    user_phone TEXT,
    user_image TEXT,
    farm_id INTEGER NOT NULL,
    farm_name TEXT,
    position TEXT NOT NULL,
    salary REAL NOT NULL,
    payment_frequency TEXT DEFAULT 'MENSUEL',
    address TEXT,
    hired_at TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    -- ⬇️ Champs calculés par le backend (EmployeeSerializer), absents du modèle Django :
    bonus_total REAL DEFAULT 0,      -- calculé: sum(bonuses.amount) actives
    estimated_total REAL DEFAULT 0,  -- calculé: salary + bonus_total
    lots_json TEXT,                  -- JSON array [{id, name}] — M2M Django dénormalisé
    last_bonus_json TEXT,            -- JSON object — dernière prime, dénormalisé
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 10. EXPENSES ───
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 11. FEED INVENTORY (matières premières) ───
  `CREATE TABLE IF NOT EXISTS feed_inventory (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    feed_type TEXT NOT NULL,
    quantity_kg REAL DEFAULT 0,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0,
    UNIQUE(lot_id, feed_type)
  )`,

  // ─── 12. HEALTH INVENTORY ───
  `CREATE TABLE IF NOT EXISTS health_inventory (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    product_type TEXT DEFAULT 'Autre',
    quantity REAL DEFAULT 0,
    unit TEXT DEFAULT 'Flacon',
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0,
    UNIQUE(lot_id, product_name)
  )`,

  // ─── 13. FEED PURCHASES ───
  // NOTE: expense_id est un OneToOneField côté Django créé par signal post_save.
  // Il est stocké localement pour la cohérence achat↔dépense.
  `CREATE TABLE IF NOT EXISTS feed_purchases (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    lot_id INTEGER,
    date TEXT NOT NULL,
    feed_type TEXT NOT NULL,
    quantity_kg REAL NOT NULL,
    total_price REAL NOT NULL,
    supplier TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    expense_id INTEGER,              -- FK → expenses (OneToOne Django, créé par signal)
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 14. HEALTH PURCHASES ───
  // NOTE: expense_id est un OneToOneField côté Django créé par signal post_save.
  `CREATE TABLE IF NOT EXISTS health_purchases (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    lot_id INTEGER,
    date TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_type TEXT DEFAULT 'Autre',
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'Flacon',
    total_price REAL NOT NULL,
    supplier TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    expense_id INTEGER,              -- FK → expenses (OneToOne Django, créé par signal)
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 15. PREPARED FEED INVENTORY ───
  `CREATE TABLE IF NOT EXISTS prepared_feed_inventory (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    feed_name TEXT NOT NULL,
    quantity_kg REAL DEFAULT 0,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0,
    UNIQUE(lot_id, feed_name)
  )`,

  // ─── 16. FEED PREPARATIONS ───
  `CREATE TABLE IF NOT EXISTS feed_preparations (
    id INTEGER PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    feed_name TEXT NOT NULL,
    quantity_produced_kg REAL NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_by_name TEXT,
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 17. FEED PREPARATION INGREDIENTS ───
  `CREATE TABLE IF NOT EXISTS feed_preparation_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preparation_id INTEGER NOT NULL,
    material_name TEXT NOT NULL,
    quantity_used_kg REAL NOT NULL,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 18. PAYROLLS ───
  // NOTE: expense_id est un OneToOneField côté Django créé par signal post_save.
  `CREATE TABLE IF NOT EXISTS payrolls (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    employee_name TEXT,
    date TEXT NOT NULL,
    month TEXT,
    period_key TEXT,
    base_salary REAL NOT NULL,
    bonus REAL DEFAULT 0,
    deduction REAL DEFAULT 0,
    amount_paid REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    payment_method TEXT DEFAULT 'CASH',
    expense_id INTEGER,              -- FK → expenses (OneToOne Django, créé par signal)
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 19. ATTENDANCES ───
  `CREATE TABLE IF NOT EXISTS attendances (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    employee_name TEXT,
    lot_id INTEGER NOT NULL,
    lot_name TEXT,
    date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    status TEXT NOT NULL DEFAULT 'PRESENT',
    note TEXT,
    updated_by_id INTEGER,
    updated_by_name TEXT,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0,
    UNIQUE(employee_id, date, lot_id)
  )`,

  // ─── 20. TASKS ───
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    employee_name TEXT,
    farm_id INTEGER,
    farm_name TEXT,
    lot_id INTEGER,
    lot_name TEXT,
    task_type TEXT NOT NULL DEFAULT 'AUTRE',
    task_type_label TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT NOT NULL,
    due_time TEXT,
    priority TEXT DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_by_id INTEGER,
    created_by_name TEXT,
    completed_at TEXT,
    completion_comment TEXT,
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 21. REMINDERS ───
  `CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    lot_id INTEGER,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    repetition TEXT DEFAULT 'ONCE',
    description TEXT,
    status TEXT DEFAULT 'PENDING',
    created_by_id INTEGER,
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 22. BONUSES ───
  `CREATE TABLE IF NOT EXISTS bonuses (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    employee_name TEXT,
    employee_farm TEXT,
    amount REAL NOT NULL,
    bonus_type TEXT NOT NULL DEFAULT 'PERFORMANCE',
    bonus_type_label TEXT,
    reason TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIF',
    created_by_id INTEGER,
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 23. EMPLOYEE REQUESTS ───
  `CREATE TABLE IF NOT EXISTS employee_requests (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    employee_name TEXT,
    farm_id INTEGER NOT NULL,
    farm_name TEXT,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT,
    updated_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 24. HEALTH ALERTS ───
  `CREATE TABLE IF NOT EXISTS health_alerts (
    id INTEGER PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    farm_name TEXT,
    lot_id INTEGER NOT NULL,
    lot_name TEXT,
    type TEXT NOT NULL,
    color TEXT NOT NULL,
    quantity INTEGER,
    date TEXT,
    created_by_name TEXT,
    is_viewed INTEGER DEFAULT 0,
    viewed_by_id INTEGER,
    viewed_at TEXT,
    created_at TEXT,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 25. ACTIVITY LOGS ───
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    farm_id INTEGER,
    lot_id INTEGER,
    lot_name TEXT,
    related_id INTEGER,
    _needs_sync INTEGER DEFAULT 0
  )`,

  // ─── 25bis. LOT EXPENSES : déjà défini en 3b — NE PAS DUPLIQUER
  // BUG-27 FIX : définition dupliquée retirée (CREATE TABLE IF NOT EXISTS l'évitait silencieusement)

  // ─── TABLE TECHNIQUE : FILE D'ATTENTE DE SYNCHRONISATION ───
  `CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,       -- 'CREATE' | 'UPDATE' | 'DELETE'
    endpoint TEXT NOT NULL,        -- '/productions/' etc
    payload_json TEXT NOT NULL,    -- JSON.stringify du payload
    local_id INTEGER,             -- id local de l'enregistrement (négatif si offline)
    table_name TEXT NOT NULL,     -- nom de la table concernée
    created_at TEXT NOT NULL,
    updated_at TEXT,              -- dernière mise à jour (utilisé pour détecter les items bloqués)
    synced_at TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SYNCED | FAILED
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
  )`,

  // ─── TABLE TECHNIQUE : MAPPING ID LOCAL → SERVEUR ───
  `CREATE TABLE IF NOT EXISTS id_mapping (
    local_id INTEGER NOT NULL,    -- ID temporaire négatif
    server_id INTEGER,            -- ID MySQL après synchro
    table_name TEXT NOT NULL,
    synced_at TEXT,
    PRIMARY KEY (local_id, table_name)
  )`,

  // ─── INDEX POUR PERFORMANCES ───
  `CREATE INDEX IF NOT EXISTS idx_productions_lot ON productions(lot_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_lot ON sales(lot_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_feeds_lot ON feeds(lot_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_health_records_lot ON health_records(lot_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_movements_lot ON chicken_movements(lot_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_farm ON expenses(farm_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_payrolls_employee ON payrolls(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendances_employee ON attendances(employee_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_employee ON tasks(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)`,
  `CREATE INDEX IF NOT EXISTS idx_lot_expenses_lot ON lot_expenses(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id)`,
];

/** Prochain ID négatif disponible pour création offline */
export const NEXT_NEGATIVE_ID_SQL = `SELECT COALESCE(MIN(id), 0) AS min_id FROM (
  SELECT MIN(id) AS id FROM users UNION ALL SELECT MIN(id) FROM farms UNION ALL
  SELECT MIN(id) FROM lots UNION ALL SELECT MIN(id) FROM productions UNION ALL
  SELECT MIN(id) FROM sales UNION ALL SELECT MIN(id) FROM feeds UNION ALL
  SELECT MIN(id) FROM health_records UNION ALL SELECT MIN(id) FROM chicken_movements UNION ALL
  SELECT MIN(id) FROM employees UNION ALL SELECT MIN(id) FROM expenses UNION ALL
  SELECT MIN(id) FROM feed_inventory UNION ALL SELECT MIN(id) FROM health_inventory UNION ALL
  SELECT MIN(id) FROM feed_purchases UNION ALL SELECT MIN(id) FROM health_purchases UNION ALL
  SELECT MIN(id) FROM prepared_feed_inventory UNION ALL SELECT MIN(id) FROM feed_preparations UNION ALL
  SELECT MIN(id) FROM payrolls UNION ALL SELECT MIN(id) FROM attendances UNION ALL
  SELECT MIN(id) FROM tasks UNION ALL SELECT MIN(id) FROM reminders UNION ALL
  SELECT MIN(id) FROM bonuses UNION ALL SELECT MIN(id) FROM employee_requests UNION ALL
  SELECT MIN(id) FROM health_alerts UNION ALL SELECT MIN(id) FROM activity_logs UNION ALL
  SELECT MIN(id) FROM lot_expenses UNION ALL SELECT MIN(id) FROM sale_payments UNION ALL
  SELECT MIN(id) FROM egg_conversions UNION ALL SELECT MIN(local_id) FROM id_mapping UNION ALL
  SELECT MIN(local_id) FROM sync_queue
)`;

/**
 * ⚠️ CORRECTION CRITIQUE (BUG A — réutilisation d'IDs négatifs / perte de données).
 * L'ancienne version ne calculait que MIN(id) sur les tables métier. Dès qu'un id négatif
 * était remplacé par son id serveur (replaceLocalId -5 → 45), l'id -5 disparaissait des
 * tables, donc MIN(id) remontait et l'id -5 pouvait être RÉUTILISÉ pour un nouvel
 * enregistrement offline. Comme id_mapping conservait l'ancienne correspondance (-5 → 45),
 * le contrôle anti-doublon du SyncManager (getServerIdForLocalId) voyait un mapping déjà
 * existant et SUPPRIMAIT le CREATE → l'enregistrement n'était JAMAIS synchronisé = perte de
 * données définitive.
 * Correctif : inclure id_mapping.local_id (qui retient CHAQUE id négatif jamais alloué,
 * sans jamais le nettoyer) et sync_queue.local_id dans le calcul. L'allocation devient
 * strictement décroissante et monotone → aucun id négatif n'est réutilisé tant que la base
 * n'est pas vidée (logout), moment où les mappings sont aussi purgés.
 */