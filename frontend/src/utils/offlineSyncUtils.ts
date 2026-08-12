export const ENDPOINT_TABLE_MAP: Record<string, string> = {
  farms: 'farms',
  'farm-users': 'farm_users',
  lots: 'lots',
  'lot-expenses': 'lot_expenses',
  'sale-payments': 'sale_payments',
  productions: 'productions',
  sales: 'sales',
  feeds: 'feeds',
  movements: 'chicken_movements',
  'health-records': 'health_records',
  employees: 'employees',
  users: 'users',
  expenses: 'expenses',
  'feed-inventory': 'feed_inventory',
  'health-inventory': 'health_inventory',
  'feed-purchases': 'feed_purchases',
  'health-purchases': 'health_purchases',
  'prepared-feed-inventory': 'prepared_feed_inventory',
  'feed-preparations': 'feed_preparations',
  payrolls: 'payrolls',
  attendances: 'attendances',
  tasks: 'tasks',
  reminders: 'reminders',
  bonuses: 'bonuses',
  'employee-requests': 'employee_requests',
  'health-alerts': 'health_alerts',
  'activity-logs': 'activity_logs',
  'egg-conversions': 'egg_conversions',
};

export const ID_FIELD_TABLE_MAP: Record<string, string> = {
  farm: 'farms',
  lot: 'lots',
  employee: 'employees',
  user: 'users',
  created_by: 'users',
  updated_by: 'users',
  sale: 'sales',
  payroll: 'payrolls',
  attendance: 'attendances',
  request: 'employee_requests',
  health_alert: 'health_alerts',
  preparation: 'feed_preparations',   // Pour feed_preparation_ingredients.preparation_id
  lot_expense: 'lot_expenses',        // Pour résolution FK lot_expenses
};

export const normalizeEndpoint = (endpoint: string): string => {
  return endpoint.trim().replace(/\s+/g, '').replace(/^\/*|\/*$/g, '');
};

export const parseEndpoint = (endpoint: string, configParams?: Record<string, any>) => {
  const normalized = normalizeEndpoint(endpoint);
  const [pathPart, queryPart] = normalized.split('?');
  const pathSegments = pathPart.split('/').filter(Boolean);

  const params: Record<string, any> = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }
  if (configParams) {
    if (configParams.params) {
      Object.assign(params, configParams.params);
    } else {
      Object.assign(params, configParams);
    }
  }

  const resource = pathSegments[0];
  let id: number | undefined;
  let action: string | undefined;

  if (pathSegments.length > 1) {
    if (/^-?\d+$/.test(pathSegments[1])) {
      // Pattern: /resource/{id}/ ou /resource/{id}/action/
      id = Number(pathSegments[1]);
      if (pathSegments.length > 2) {
        action = pathSegments.slice(2).join('/');
      }
    } else {
      // Pattern: /resource/action/ (pas d'ID, action directement)
      // Ex: /attendances/clock_in/, /attendances/clock_out/
      action = pathSegments.slice(1).join('/');
    }
  }

  const tableName = resource && (pathSegments.length === 1 || id !== undefined || (pathSegments.length >= 2 && !(/^-?\d+$/.test(pathSegments[1])))) ? ENDPOINT_TABLE_MAP[resource] : undefined;

  return {
    resource,
    tableName,
    id,
    action,
    params,
    fullPath: pathPart,
  };
};

export const getTableNameFromEndpoint = (endpoint: string, configParams?: Record<string, any>): string | undefined => {
  const parsed = parseEndpoint(endpoint, configParams);
  return parsed.tableName;
};

export const getEndpointId = (endpoint: string): number | undefined => {
  return parseEndpoint(endpoint).id;
};

export const getLocalReferenceTable = (fieldName: string): string | undefined => {
  const key = fieldName.replace(/_id$/, '');
  return ID_FIELD_TABLE_MAP[key] || ENDPOINT_TABLE_MAP[key];
};

/**
 * Mappe les champs FK Django (ex: 'owner', 'farm', 'lot') vers les colonnes SQLite
 * correspondantes (ex: 'owner_id', 'farm_id', 'lot_id'), et vice-versa.
 *
 * Le backend Django utilise le nom du champ ForeignKey (ex: 'owner'),
 * les tables SQLite locales utilisent le nom de la colonne DB (ex: 'owner_id').
 * Cette fonction garantit que les deux formes sont présentes pour les INSERT/UPDATE locaux.
 *
 * @param columnNames - Set des noms de colonnes de la table SQLite cible
 * @param row - L'enregistrement à mapper (données de l'API ou du formulaire)
 * @returns Une copie de row avec les champs FK mappés dans les deux sens
 */
export const mapForeignKeyFields = (
  columnNames: Set<string>,
  row: Record<string, any>
): Record<string, any> => {
  const result: Record<string, any> = { ...row };

  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;

    if (key.endsWith('_id')) {
      // Si la table a 'owner' mais pas 'owner_id'
      const baseKey = key.replace(/_id$/, '');
      if (!columnNames.has(key) && columnNames.has(baseKey) && !(baseKey in result)) {
        result[baseKey] = value;
        // Supprimer la forme _id qui n'existe pas dans la table
        delete result[key];
      }
    } else {
      // Si la table a 'owner_id' mais pas 'owner'
      const idKey = key + '_id';
      if (!columnNames.has(key) && columnNames.has(idKey) && !(idKey in result)) {
        result[idKey] = value;
        // Supprimer la forme sans _id qui n'existe pas dans la table
        delete result[key];
      }
    }
  }

  return result;
};
