/**
 * Formats a number or string to have spaces as thousands separators.
 * Example: 1000000 -> "1 000 000"
 */
export const formatNumber = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '';

  const stringValue = value.toString().replace(/\s/g, '');
  if (isNaN(Number(stringValue))) return stringValue;

  const parts = stringValue.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (parts[1]) {
    parts[1] = parts[1].substring(0, 2); // Limite à 2 décimales pour l'affichage
  }
  return parts.join('.');
};

/**
 * Removes spaces from a formatted string to get the raw numeric string.
 * Example: "1 000 000" -> "1000000"
 */
export const parseFormattedNumber = (value: string): string => {
  return value.replace(/\s/g, '');
};

/**
 * Formats a number for display with dynamic currency.
 */
export const formatCurrency = (value: number | string | undefined | null, currency: string = 'GNF'): string => {
  if (value === undefined || value === null || value === '') return `0 ${currency}`;
  return `${formatNumber(value)} ${currency}`;
};
