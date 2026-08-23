import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Alert, Platform } from 'react-native';
import { formatCurrency, formatNumber } from './formatters';

const triggerDownload = async (blob: Blob, filename: string, mimeType: string) => {
  console.log('[TEST SOLFERME] triggerDownload called', { filename, mimeType, Platform: Platform.OS });
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      console.log('[TEST SOLFERME] triggerDownload: web path');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      console.log('[TEST SOLFERME] triggerDownload: web download triggered');
      return;
    }

    console.log('[TEST SOLFERME] triggerDownload: native path');
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    const arrayBuffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(fileUri, { mimeType, UTI: mimeType });
    console.log('[TEST SOLFERME] triggerDownload: native share triggered');
  } catch (error) {
    console.error('[TEST SOLFERME] triggerDownload error:', error);
    throw error;
  }
};

/**
 * Propose à l'utilisateur de choisir le format d'exportation
 */
export const requestExportFormat = (title: string, data: any[], htmlContent: string, filename: string, t: (key: string, params?: any, fallback?: string) => string) => {
  // Sur web, générer directement le PDF par défaut (Alert.alert ne fonctionne pas bien sur web)
  if (Platform.OS === 'web') {
    exportToPDF(htmlContent, filename, t);
    return;
  }

  // Sur natif (Android/iOS), utiliser Alert.alert pour le choix de format
  Alert.alert(
    t('dbMgt.exportTitle') || "Format d'exportation",
    t('dbMgt.exportDesc') || "Choisissez le format de fichier pour " + title,
    [
      { text: 'PDF', onPress: () => exportToPDF(htmlContent, filename, t) },
      { text: 'Excel (XLSX)', onPress: () => exportToExcel(data, filename, t) },
      { text: 'Word (DOC)', onPress: () => exportToWord(htmlContent, filename, t) },
      { text: t('common.cancel'), style: 'cancel' }
    ],
    { cancelable: true }
  );
};

// --- PDF ---
export const exportToPDF = async (html: string, filename: string, t?: (key: string) => string) => {
  try {
    if (Platform.OS === 'web') {
      const html2pdf = require('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = html;
      const opt = {
        margin:       10,
        filename:     `${filename}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await html2pdf().set(opt).from(element).save();
      return;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const targetUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    console.error('[PDF Export Error]', error);
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('lots.exportError') : "Impossible de générer le PDF");
  }
};

// --- EXCEL ---
export const exportToExcel = async (data: any[], filename: string, t?: (key: string) => string) => {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t ? t('common.info') : "Données");
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    await triggerDownload(blob, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (error) {
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('lots.exportError') : "Impossible de générer le fichier Excel");
  }
};

// --- WORD ---
export const exportToWord = async (html: string, filename: string, t?: (key: string) => string) => {
  try {
    // Amélioration: Utiliser un meilleur format HTML pour Word avec styles CSS
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th { background-color: #f9d760; border: 1px solid #000; padding: 8px; font-weight: bold; text-align: left; }
  td { border: 1px solid #000; padding: 8px; }
  h1 { text-align: center; color: #000; font-weight: 900; text-transform: uppercase; }
  h2 { border-bottom: 2px solid #000; padding-bottom: 5px; font-weight: 900; }
  .summary { background-color: #f9d760; padding: 10px; border: 2px solid #000; margin: 10px 0; }
</style>
</head>
<body>`;
    const footer = "</body></html>";
    const fullContent = header + html + footer;

    if (Platform.OS === 'web') {
      const blob = new Blob([fullContent], { type: 'application/msword' });
      await triggerDownload(blob, `${filename}.doc`, 'application/msword');
      return;
    }

    const fileUri = `${FileSystem.cacheDirectory}${filename}.doc`;
    await FileSystem.writeAsStringAsync(fileUri, fullContent);
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/msword',
      UTI: 'com.microsoft.word.doc'
    });
  } catch (error) {
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('lots.exportError') : "Impossible de générer le fichier Word");
  }
};

/**
 * Exporte l'intégralité de la base de données dans un seul fichier Excel multi-feuilles
 */
export const exportAllToExcel = async (allData: { [key: string]: any[] }, filename: string, t?: (key: string) => string) => {
  try {
    const wb = XLSX.utils.book_new();
    let hasData = false;

    for (const [key, data] of Object.entries(allData)) {
      if (data && data.length > 0) {
        hasData = true;

        // Nom de la feuille traduit si possible
        const sheetName = t ? (t(`actions.${key}`) || t(`${key}.title`) || key) : key;

        // Transformation des objets complexes en chaînes pour ne pas perdre d'info
        const flattenedData = data.map(item => {
          const newItem: any = {};
          for (const [itemKey, value] of Object.entries(item)) {
            // Tentative de traduction de l'en-tête
            const translatedHeader = t ? (t(`common.${itemKey}`) || t(`reports.${itemKey}`) || t(`lots.${itemKey}`) || itemKey) : itemKey;

            if (value !== null && typeof value === 'object') {
              newItem[translatedHeader] = JSON.stringify(value);
            } else {
              newItem[translatedHeader] = value;
            }
          }
          return newItem;
        });
        const ws = XLSX.utils.json_to_sheet(flattenedData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // Excel limit
      }
    }

    if (!hasData) {
      Alert.alert("Info", t ? t('common.noData') : "Aucune donnée à exporter.");
      return;
    }

    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    await triggerDownload(blob, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (error) {
    console.error("Export Excel Error:", error);
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('dbMgt.exportError') : "Échec de l'exportation Excel.");
  }
};

/**
 * Exporte toute la base en PDF (Tableaux successifs avec en-têtes traduits)
 * Version améliorée : données complètes, lisibles, jamais tronquées.
 */
export const exportAllToPDF = async (allData: { [key: string]: any[] }, filename: string, t: (key: string, params?: any, fallback?: string) => string) => {
  // Champs techniques internes à masquer dans l'export
  const HIDDEN_FIELDS = new Set([
    '_needs_sync', '_sync_error', '_sync_attempts', '_local_id',
    'lots_json', 'expense', 'expense_id', 'updated_at',
  ]);

  const formatCellValue = (h: string, val: any): string => {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'boolean') return val ? '✓' : '✗';
    if (typeof val === 'object') {
      if (Array.isArray(val)) return val.length > 0 ? val.map((v: any) => v?.name || v?.label || String(v)).join(', ') : '-';
      return val.name || val.label || val.id || '-';
    }
    // Dates : champs contenant 'date', 'created', 'at' (mais PAS status, etc.)
    if ((h.includes('date') || h === 'created_at') && val && val !== '0') {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d.getFullYear() > 1970 ? d.toLocaleDateString(t('common.dateLocale', undefined, 'fr-FR')) : '-';
    }
    // Montants numériques
    if (typeof val === 'number') {
      if (['amount', 'price', 'salary', 'total', 'paid', 'cost', 'revenue', 'expense', 'deduction', 'bonus', 'base'].some(k => h.includes(k))) {
        return formatNumber(val) + ' GNF';
      }
      return formatNumber(val);
    }
    return String(val);
  };

  const FIELD_LABEL_MAP: Record<string, string> = {
    id: 'ID', name: 'Nom', status: 'Statut', date: 'Date', created_at: 'Créé le',
    farm: 'Ferme', farm_id: 'Ferme ID', lot: 'Lot', lot_id: 'Lot ID',
    employee: 'Employé', employee_id: 'Employé ID',
    amount: 'Montant', amount_paid: 'Montant payé', base_salary: 'Salaire de base',
    bonus: 'Prime', deduction: 'Déduction', payment_method: 'Mode paiement',
    total_price: 'Prix total', quantity: 'Quantité', quantity_kg: 'Quantité (kg)',
    feed_type: 'Type aliment', product_name: 'Produit', unit: 'Unité',
    month: 'Mois', period_key: 'Période', description: 'Description',
    category: 'Catégorie', animal_type: 'Type animal', breed: 'Race',
    current_quantity: 'Qté actuelle', initial_quantity: 'Qté initiale',
    purchase_date: 'Date achat', supplier: 'Fournisseur',
    total_eggs: 'Total œufs', sellable_eggs: 'Œufs vendables', broken_eggs: 'Œufs cassés',
    total_crates: 'Total casiers', sellable_crates: 'Casiers vendables',
    movement_type: 'Type mouvement', quantity_moved: 'Qté déplacée',
    from_lot: 'Lot source', to_lot: 'Lot destination',
    payment_frequency: 'Fréquence paie', position: 'Poste',
    phone: 'Téléphone', address: 'Adresse',
    treatment_type: 'Type traitement', diagnosis: 'Diagnostic',
    affected_count: 'Sujets atteints', treated_count: 'Sujets traités',
    recovery_count: 'Sujets guéris', dead_count: 'Morts',
  };

  const getLabel = (h: string): string => {
    if (FIELD_LABEL_MAP[h]) return FIELD_LABEL_MAP[h];
    return t(`common.${h}`, undefined, '') || t(`reports.${h}`, undefined, '') || t(`lots.${h}`, undefined, '') || h.replace(/_/g, ' ');
  };

  try {
    const dateStr = new Date().toLocaleString(t('common.dateLocale', undefined, 'fr-FR'));

    const pageStyles = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; padding: 15px; }
        .report-header { text-align: center; border-bottom: 4px solid #000; padding-bottom: 15px; margin-bottom: 25px; }
        .report-header h1 { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 4px 0; }
        .report-header p { margin: 3px 0; font-size: 11px; }
        .section { margin-bottom: 25px; page-break-inside: avoid; }
        .section-header { background-color: #1a1a1a; color: #fff; padding: 8px 12px; font-size: 13px; font-weight: 900; text-transform: uppercase; margin-bottom: 0; border-radius: 4px 4px 0 0; }
        .section-count { font-size: 10px; font-weight: normal; opacity: 0.8; }
        table { width: 100%; border-collapse: collapse; }
        thead tr th { background-color: #f9d760; color: #000; padding: 7px 8px; text-align: left; font-weight: 900; font-size: 9px; text-transform: uppercase; border: 1px solid #ccc; white-space: nowrap; }
        tbody tr td { padding: 6px 8px; border: 1px solid #ddd; font-size: 9.5px; vertical-align: top; word-break: break-word; }
        tbody tr:nth-child(odd) td { background-color: #fff; }
        tbody tr:nth-child(even) td { background-color: #f7f7f7; }
        tbody tr.cancelled td { color: #999; text-decoration: line-through; background-color: #fff0f0; }
        .page-break { page-break-before: always; }
      </style>
    `;

    let htmlSections = `
      ${pageStyles}
      <div class="report-header">
        <h1>SolFerme</h1>
        <p style="font-weight: bold;">${t('reports.slogan', undefined, "L'élevage de demain, aujourd'hui.")}</p>
        <p style="font-size:14px; font-weight:900; text-transform:uppercase; margin-top:10px; background:#000; color:#fff; display:inline-block; padding:5px 20px;">${t('dbMgt.globalExport', undefined, 'Export Base de Données')}</p>
        <p style="margin-top:8px; font-size:10px;">${t('reports.generatedOn', undefined, 'Généré le')} ${dateStr}</p>
      </div>
    `;

    const entries = Object.entries(allData).filter(([, data]) => data && data.length > 0);

    entries.forEach(([sectionTitle, data], sectionIdx) => {
      // Filtrer les champs internes/techniques
      const allFields = Object.keys(data[0]);
      const visibleFields = allFields.filter(f => !HIDDEN_FIELDS.has(f));

      const isPageBreak = sectionIdx > 0 && sectionIdx % 2 === 0;

      htmlSections += `
        <div class="section${isPageBreak ? ' page-break' : ''}">
          <div class="section-header">
            ${sectionTitle}
            <span class="section-count">(${data.length} entrée${data.length > 1 ? 's' : ''})</span>
          </div>
          <table>
            <thead>
              <tr>
                ${visibleFields.map(h => `<th>${getLabel(h)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.map(row => {
                const isCancelled = row.status === 'ANNULEE' || row.status === 'ANNULÉ';
                return `<tr class="${isCancelled ? 'cancelled' : ''}">
                  ${visibleFields.map(h => `<td>${formatCellValue(h, row[h])}</td>`).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    });

    if (Platform.OS === 'web') {
      const html2pdf = require('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = htmlSections;
      const opt = {
        margin:      [10, 8, 10, 8],
        filename:    `${filename}.pdf`,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak:   { mode: ['css', 'legacy'], before: '.page-break' },
      };
      await html2pdf().set(opt).from(element).save();
      return;
    }

    const fullHtml = `<html><head><meta charset="utf-8"/></head><body>${htmlSections}</body></html>`;
    const { uri } = await Print.printToFileAsync({ html: fullHtml });
    const targetUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    console.error("Export PDF Error:", error);
    Alert.alert(t('common.error'), t('dbMgt.exportError'));
  }
};

/**
 * Génère un PDF d'inventaire/stock (Matières premières, Aliments préparés, Santé)
 */
export const generateInventoryPDF = async (
  inventoryData: {
    rawMaterials: any[];
    preparedFeeds: any[];
    health: any[];
  },
  context: {
    farmName: string;
    lotName?: string;
    dateStr: string;
    totalFeed: number;
    totalHealth: number;
    thresholds: { FEED: number; HEALTH: number };
  },
  t: (key: string, params?: any, fallback?: string) => string
) => {
  const { rawMaterials, preparedFeeds, health } = inventoryData;
  const { farmName, lotName, dateStr, totalFeed, totalHealth, thresholds } = context;

  const getStatusLabel = (qty: number, type: 'feed' | 'health'): { label: string; color: string } => {
    const low = type === 'health' ? thresholds.HEALTH : thresholds.FEED;
    if (qty <= 0) return { label: t('inventory.outOfStock', undefined, 'Rupture de stock'), color: '#D32F2F' };
    if (qty < low)  return { label: t('inventory.lowStock', undefined, 'Stock faible'), color: '#F57C00' };
    return           { label: t('inventory.available', undefined, 'Disponible'), color: '#388E3C' };
  };

  const scopeLabel = lotName
    ? `${t('lots.lot', undefined, 'Lot')} : ${lotName}`
    : farmName !== t('common.all', undefined, 'Tous')
    ? `${t('farms.title', undefined, 'Ferme')} : ${farmName}`
    : t('common.all', undefined, 'Toutes les fermes');

  const buildSection = (
    title: string,
    items: any[],
    getRow: (item: any) => { name: string; sub: string; qty: number; unit: string; type: 'feed' | 'health' },
    accentColor: string
  ): string => {
    if (items.length === 0) return '';
    return `
      <div class="section">
        <div class="section-header" style="border-left: 5px solid ${accentColor};">
          <span class="section-title">${title}</span>
          <span class="section-count">${items.length} ${items.length > 1 ? 'produits' : 'produit'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>${t('common.name', undefined, 'Produit / Matière')}</th>
              <th>${t('inventory.type', undefined, 'Type')}</th>
              <th style="text-align: right;">${t('inventory.quantity', undefined, 'Quantité disponible')}</th>
              <th>${t('common.unit', undefined, 'Unité')}</th>
              <th>${t('common.status', undefined, 'Statut stock')}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => {
              const row = getRow(item);
              const st = getStatusLabel(row.qty, row.type);
              return `
                <tr class="${idx % 2 === 0 ? '' : 'alt'}">
                  <td><strong>${row.name}</strong></td>
                  <td class="sub">${row.sub || '-'}</td>
                  <td style="text-align: right; font-weight: 800; font-size: 13px;">${formatNumber(row.qty)}</td>
                  <td>${row.unit}</td>
                  <td><span class="badge" style="background:${st.color}20; color:${st.color}; border: 1px solid ${st.color}40;">${st.label}</span></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const css = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; padding: 20px; }
      .report-header { text-align: center; border-bottom: 4px solid #000; padding-bottom: 16px; margin-bottom: 24px; }
      .report-header h1 { font-size: 26px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
      .report-header .subtitle { font-size: 13px; font-weight: 700; margin: 6px 0 4px; }
      .report-header .scope { display: inline-block; background: #000; color: #fff; padding: 4px 18px; font-size: 11px; font-weight: 700; text-transform: uppercase; border-radius: 3px; margin: 8px 0 4px; }
      .report-header .date { font-size: 10px; color: #555; margin-top: 6px; }
      .summary-row { display: flex; gap: 16px; margin-bottom: 24px; }
      .summary-card { flex: 1; border: 2px solid #e0e0e0; border-radius: 8px; padding: 14px 18px; border-left-width: 5px; }
      .summary-card .value { font-size: 22px; font-weight: 900; margin-bottom: 2px; }
      .summary-card .label { font-size: 10px; color: #666; font-weight: 600; text-transform: uppercase; }
      .section { margin-bottom: 28px; page-break-inside: avoid; }
      .section-header { display: flex; align-items: center; justify-content: space-between; background: #f5f5f5; padding: 10px 14px; margin-bottom: 0; border-radius: 6px 6px 0 0; }
      .section-title { font-size: 13px; font-weight: 900; text-transform: uppercase; }
      .section-count { font-size: 10px; color: #777; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; }
      thead tr th { background: #f9d760; padding: 8px 10px; text-align: left; font-weight: 900; font-size: 9px; text-transform: uppercase; border: 1px solid #ddd; }
      tbody tr td { padding: 8px 10px; border: 1px solid #eee; font-size: 10px; vertical-align: middle; }
      tbody tr.alt td { background: #fafafa; }
      .sub { color: #777; font-size: 9.5px; }
      .badge { padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; white-space: nowrap; }
      .footer { text-align: center; margin-top: 30px; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
  `;

  const html = `
    <html><head><meta charset="utf-8"/>${css}</head><body>
      <div class="report-header">
        <h1>SolFerme</h1>
        <div class="subtitle">${t('reports.slogan', undefined, "L'élevage de demain, aujourd'hui.")}</div>
        <div class="scope">${t('inventory.title', undefined, 'Inventaire & Stock')}</div>
        <div style="margin-top: 6px; font-size: 11px; font-weight: 600;">${scopeLabel}</div>
        <div class="date">${t('reports.generatedOn', undefined, 'Généré le')} ${dateStr}</div>
      </div>

      <div class="summary-row">
        <div class="summary-card" style="border-left-color: #F57C00;">
          <div class="value" style="color:#F57C00;">${formatNumber(totalFeed)} kg</div>
          <div class="label">${t('lots.stockAliment', undefined, 'Stock Aliment total')}</div>
        </div>
        <div class="summary-card" style="border-left-color: #E91E63;">
          <div class="value" style="color:#E91E63;">${formatNumber(totalHealth)}</div>
          <div class="label">${t('inventory.healthProducts', undefined, 'Produits de Santé')}</div>
        </div>
      </div>

      ${buildSection(
        t('inventory.rawMaterials', undefined, 'Matières Premières'),
        rawMaterials,
        item => ({ name: item.feed_type, sub: '', qty: parseFloat(item.quantity_kg || 0), unit: 'kg', type: 'feed' }),
        '#FF9800'
      )}

      ${buildSection(
        t('inventory.preparedFeeds', undefined, 'Aliments Préparés'),
        preparedFeeds,
        item => ({ name: item.feed_name, sub: '', qty: parseFloat(item.quantity_kg || 0), unit: 'kg', type: 'feed' }),
        '#1976D2'
      )}

      ${buildSection(
        t('inventory.healthProductsTitle', undefined, 'Produits Sanitaires'),
        health,
        item => ({ name: item.product_name, sub: item.product_type || '', qty: parseFloat(item.quantity || 0), unit: item.unit || t('common.unit', undefined, 'Unité'), type: 'health' }),
        '#E91E63'
      )}

      <div class="footer">SolFerme — ${t('reports.generatedOn', undefined, 'Généré le')} ${dateStr}</div>
    </body></html>
  `;

  try {
    if (Platform.OS === 'web') {
      const html2pdf = require('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = html;
      const opt = {
        margin:      [8, 8, 8, 8],
        filename:    `SolFerme_Inventaire_${new Date().toISOString().slice(0,10)}.pdf`,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      await html2pdf().set(opt).from(element).save();
      return;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const targetUri = `${FileSystem.cacheDirectory}SolFerme_Inventaire.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    console.error('[Inventory PDF Error]', error);
    Alert.alert(t('common.error', undefined, 'Erreur'), t('lots.exportError', undefined, 'Impossible de générer le PDF'));
  }
};


export const generateConsolidatedReport = async (stats: any, period: string, t: (key: string, params?: any, fallback?: string) => string, userRole: string) => {
  try {
    const dateStr = new Date().toLocaleDateString(t('common.dateLocale'));

    let html = `
      <div style="font-family: sans-serif; padding: 20px; color: #000; background-color: #fff; border: 4px solid #000;">
        <div style="text-align: center; border-bottom: 4px solid #000; padding-bottom: 20px; margin-bottom: 20px;">
          <h1 style="font-weight: 900; text-transform: uppercase; margin: 0; font-size: 28px;">SolFerme</h1>
          <p style="font-weight: bold; margin: 5px 0;">${t('reports.slogan')}</p>
          <h2 style="background-color: #000; color: #fff; display: inline-block; padding: 5px 20px; margin-top: 15px; text-transform: uppercase;">
            ${t('statistics.title')} - ${period}
          </h2>
          <p style="margin-top: 10px;">${t('reports.generatedOn')} ${dateStr}</p>
        </div>

        <!-- 1. RESUME GLOBAL -->
        <div style="margin-bottom: 30px;">
          <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; font-weight: 900;">1. ${t('dashboard.recentActivitiesSection')}</h3>
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; margin-top: 10px;">
            <div style="width: 23%; border: 2px solid #000; padding: 10px; text-align: center; background-color: #f9d760; margin-bottom: 10px;">
              <div style="font-size: 10px; text-transform: uppercase; font-weight: bold;">${t('farms.title')}</div>
              <div style="font-size: 18px; font-weight: 900;">${stats.global.farms}</div>
            </div>
            <div style="width: 23%; border: 2px solid #000; padding: 10px; text-align: center; background-color: #f9d760; margin-bottom: 10px;">
              <div style="font-size: 10px; text-transform: uppercase; font-weight: bold;">${t('farms.batches')}</div>
              <div style="font-size: 18px; font-weight: 900;">${stats.global.lots}</div>
            </div>
            <div style="width: 23%; border: 2px solid #000; padding: 10px; text-align: center; background-color: #f9d760; margin-bottom: 10px;">
              <div style="font-size: 10px; text-transform: uppercase; font-weight: bold;">${t('lots.alive')}</div>
              <div style="font-size: 18px; font-weight: 900;">${formatNumber(stats.global.alive)}</div>
            </div>
            <div style="width: 23%; border: 2px solid #000; padding: 10px; text-align: center; background-color: #f9d760; margin-bottom: 10px;">
              <div style="font-size: 10px; text-transform: uppercase; font-weight: bold;">PERFORMANCE</div>
              <div style="font-size: 18px; font-weight: 900;">${stats.global.performance}%</div>
            </div>
          </div>
        </div>

        <!-- 2. PRODUCTION -->
        <div style="margin-bottom: 30px;">
          <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; font-weight: 900;">2. ${t('lots.statsProduction')}</h3>
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold;">${t('production.stats.produced')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right;">${formatNumber(stats.production.totalTrays)} ${t('dashboard.units.trays')}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold;">${t('production.stats.salable')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right;">${formatNumber(stats.production.salable)} ${t('dashboard.units.trays')}</td>
            </tr>
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold;">${t('lots.sold')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right;">${formatNumber(stats.production.sold)} ${t('dashboard.units.trays')}</td>
            </tr>
          </table>
        </div>

        <!-- 3. ALIMENTATION -->
        <div style="margin-bottom: 30px;">
          <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; font-weight: 900;">3. ${t('lots.statsAlimentation')}</h3>
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold;">${t('lots.consommationAliment')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right;">${formatNumber(stats.feeding.consumed)} ${t('common.kg')}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold;">${t('lots.stockAliment')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right;">${formatNumber(stats.feeding.stock)} ${t('common.kg')}</td>
            </tr>
          </table>
        </div>

        <!-- 4. SANTE -->
        <div style="margin-bottom: 30px;">
          <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; font-weight: 900;">4. ${t('lots.statsSante')}</h3>
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold; color: #D32F2F;">${t('lots.poulesMortes')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right; color: #D32F2F;">${stats.health.dead}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold; color: #F57C00;">${t('lots.poulesMalades')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right; color: #F57C00;">${stats.health.sick}</td>
            </tr>
            <tr style="background-color: #f9f9f9;">
              <td style="padding: 10px; border: 1px solid #000; font-weight: bold;">${t('lots.traitementsEffectues')}</td>
              <td style="padding: 10px; border: 1px solid #000; text-align: right;">${stats.health.treatments}</td>
            </tr>
          </table>
        </div>

        <!-- 5. FINANCE -->
        ${userRole !== 'EMPLOYE' ? `
        <div style="margin-bottom: 30px; page-break-inside: avoid;">
          <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px; text-transform: uppercase; font-weight: 900;">5. ${t('dashboard.finance')}</h3>
          <div style="padding: 20px; border: 2px solid #000; background-color: #f9d760;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="font-weight: bold;">${t('finance.income')} :</span>
              <span style="font-weight: 900;">${formatCurrency(stats.finance.income, t('common.currency'))}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="font-weight: bold;">${t('finance.expenses')} :</span>
              <span style="font-weight: 900;">${formatCurrency(stats.finance.expenses, t('common.currency'))}</span>
            </div>
            <div style="border-top: 2px solid #000; margin: 10px 0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 20px;">
              <span style="font-weight: 900;">${t('finance.balance')} :</span>
              <span style="font-weight: 900; color: ${stats.finance.profit >= 0 ? '#2E7D32' : '#D32F2F'};">${formatCurrency(stats.finance.profit, t('common.currency'))}</span>
            </div>
          </div>
        </div>
        ` : ''}

        <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #666; font-style: italic;">
          * ${t('statistics.realTimeData')} - SolFerme Analytics
        </div>
      </div>
    `;

    if (Platform.OS === 'web') {
      const html2pdf = require('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = html;
      const opt = {
        margin:       10,
        filename:     `Rapport_SolFerme_${period.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await html2pdf().set(opt).from(element).save();
      return;
    }

    const { uri } = await Print.printToFileAsync({ html });
    const targetUri = `${FileSystem.cacheDirectory}Rapport_SolFerme_${period.replace(/\s+/g, '_')}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    console.error("Consolidated Report Error:", error);
    Alert.alert(t('common.error'), t('lots.exportError'));
  }
};

/**
 * Exporte toute la base en Word
 */
export const exportAllToWord = async (allData: { [key: string]: any[] }, filename: string, t: (key: string, params?: any, fallback?: string) => string) => {
  try {
    let htmlContent = `<h1>${t('dbMgt.globalExport')}</h1>`;
    for (const [title, data] of Object.entries(allData)) {
      if (data && data.length > 0) {
        htmlContent += `<h2>${title}</h2><table border="1">`;
        const headers = Object.keys(data[0]);
        htmlContent += `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
        data.forEach(row => {
          htmlContent += `<tr>${headers.map(h => {
            const val = row[h];
            const displayVal = typeof val === 'number' ? formatNumber(val) : (val || '');
            return `<td>${displayVal}</td>`;
          }).join('')}</tr>`;
        });
        htmlContent += `</table><br/>`;
      }
    }

    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>`;
    const fullContent = header + htmlContent + "</body></html>";

    if (Platform.OS === 'web') {
      const blob = new Blob([fullContent], { type: 'application/msword' });
      await triggerDownload(blob, `${filename}.doc`, 'application/msword');
      return;
    }

    const fileUri = `${FileSystem.cacheDirectory}${filename}.doc`;
    await FileSystem.writeAsStringAsync(fileUri, fullContent);
    await Sharing.shareAsync(fileUri, { mimeType: 'application/msword', UTI: '.doc' });
  } catch (error) {
    Alert.alert(t('common.error'), t('dbMgt.exportError'));
  }
};

/**
 * Propose à l'utilisateur de choisir le format d'exportation GLOBAL
 */
export const requestGlobalExportFormat = (allData: { [key: string]: any[] }, filename: string, t: (key: string, params?: any, fallback?: string) => string) => {
  // Sur web, générer directement le PDF par défaut (Alert.alert ne fonctionne pas bien sur web)
  if (Platform.OS === 'web') {
    exportAllToPDF(allData, filename, t);
    return;
  }

  // Sur natif (Android/iOS), utiliser Alert.alert pour le choix de format
  Alert.alert(
    t('dbMgt.exportTitle') || "Format d'exportation",
    t('dbMgt.exportDesc') || "Choisissez le format pour l'export global",
    [
      { text: 'PDF', onPress: () => exportAllToPDF(allData, filename, t) },
      { text: 'Excel (XLSX)', onPress: () => exportAllToExcel(allData, filename) },
      { text: 'Word (DOC)', onPress: () => exportAllToWord(allData, filename, t) },
      { text: t('common.cancel'), style: 'cancel' }
    ]
  );
};

export const generatePayrollPDF = async (payrollData: any, t: (key: string, params?: any, fallback?: string) => string) => {
  const { name, position, base_salary, bonus, deduction, amount_paid, month } = payrollData;
  const html = `
    <div style="border: 2.5px solid #000; padding: 20px; font-family: sans-serif; background-color: #fff;">
      <h1 style="text-align: center; color: #000; font-weight: 900; text-transform: uppercase;">${t('reports.payrollTitle')}</h1>
      <p style="text-align: right; font-weight: bold;">${t('reports.period')} : ${month}</p>

      <div style="margin-top: 30px; border: 2px solid #000; padding: 15px; background-color: #f9f9f9;">
        <p style="margin: 5px 0;"><b>${t('reports.employee')} :</b> ${name}</p>
        <p style="margin: 5px 0;"><b>${t('reports.position')} :</b> ${position}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 30px; border: 2px solid #000;">
        <tr style="background-color: #f9d760; border-bottom: 2px solid #000;">
          <th style="border: 1px solid #000; padding: 12px; text-align: left; font-weight: 900;">${t('reports.designation')}</th>
          <th style="border: 1px solid #000; padding: 12px; text-align: right; font-weight: 900;">${t('reports.totalAmount')}</th>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 10px;">${t('reports.baseSalary')}</td>
          <td style="border: 1px solid #000; padding: 10px; text-align: right;">${formatCurrency(base_salary, t('common.currency'))}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 10px;">${t('reports.bonuses')}</td>
          <td style="border: 1px solid #000; padding: 10px; text-align: right;">${formatCurrency(bonus || 0, t('common.currency'))}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 10px;">${t('reports.deductions')}</td>
          <td style="border: 1px solid #000; padding: 10px; text-align: right;">-${formatCurrency(deduction || 0, t('common.currency'))}</td>
        </tr>
        <tr style="font-weight: 900; background-color: #f9d760; border-top: 2px solid #000;">
          <td style="border: 1px solid #000; padding: 12px;">${t('reports.netToPay')}</td>
          <td style="border: 1px solid #000; padding: 12px; text-align: right;">${formatCurrency(amount_paid, t('common.currency'))}</td>
        </tr>
      </table>

      <div style="margin-top: 50px; display: flex; justify-content: space-between;">
        <div style="text-align: center;">
          <p>${t('reports.employerSignature')}</p>
          <div style="height: 60px;"></div>
        </div>
        <div style="text-align: center;">
          <p>${t('reports.employeeSignature')}</p>
          <div style="height: 60px;"></div>
        </div>
      </div>
    </div>
  `;

  await exportToPDF(html, `Bulletin_${name.replace(/\s+/g, '_')}_${month.replace(/\s+/g, '_')}`, t);
};

export const generateGroupPayrollPDF = async (payrolls: any[], month: string, t: (key: string, params?: any, fallback?: string) => string, totalMasseSalariale: number) => {
  const filteredPayrolls = payrolls.filter(p => p.status !== 'ANNULEE' && p.status !== 'ANNULÉ');

  const rows = filteredPayrolls.map(p => {
    return `
      <tr>
        <td style="border: 1px solid #000; padding: 8px;">${p.employee}</td>
        <td style="border: 1px solid #000; padding: 8px;">${p.period}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${formatCurrency(p.salary, t('common.currency'))}</td>
        <td style="border: 1px solid #000; padding: 8px; font-weight: 900; color: ${p.isPaid ? '#2E7D32' : '#D32F2F'};">${p.status}</td>
      </tr>
    `;
  }).join('');

  const total = totalMasseSalariale;

  const html = `
    <div style="padding: 20px; font-family: sans-serif; border: 2px solid #000; background-color: #fff;">
      <h1 style="text-align: center; font-weight: 900; text-transform: uppercase;">${t('reports.payrollReportTitle')} - ${month}</h1>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; border: 2px solid #000;">
        <thead>
          <tr style="background-color: #f9d760; border-bottom: 2px solid #000;">
            <th style="border: 1px solid #000; padding: 10px; text-align: left; font-weight: 900;">${t('reports.employee')}</th>
            <th style="border: 1px solid #000; padding: 10px; text-align: left; font-weight: 900;">${t('reports.period')}</th>
            <th style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: 900;">${t('reports.totalAmount')}</th>
            <th style="border: 1px solid #000; padding: 10px; text-align: left; font-weight: 900;">${t('reports.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="font-weight: 900; background-color: #f9d760; border-top: 2px solid #000;">
            <td colspan="2" style="border: 1px solid #000; padding: 10px; text-align: right;">${t('reports.salaryMasse')}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: right;">${formatCurrency(total, t('common.currency'))}</td>
            <td style="border: 1px solid #000; padding: 10px;"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  await exportToPDF(html, `Paies_Groupees_${month.replace(/\s+/g, '_')}`, t);
};

// --- Fonctions existantes adaptées ---

export const generateReceiptPDF = async (sale: any, t: (key: string, params?: any, fallback?: string) => string) => {
  const html = `
    <div style="border: 3px solid #000; padding: 30px; font-family: sans-serif; background-color: #fff; max-width: 600px; margin: auto;">
      <h1 style="text-align: center; color: #000; font-weight: 900; margin-bottom: 0; text-transform: uppercase;">SolFerme</h1>
      <p style="text-align: center; margin-top: 5px; color: #000; font-weight: bold;">${t('reports.slogan')}</p>

      <div style="margin-top: 40px; border-bottom: 3px solid #000; padding-bottom: 10px; display: flex; justify-content: space-between;">
        <h2 style="margin: 0; font-weight: 900;">${t('reports.receiptTitle')}</h2>
        <span style="font-weight: 900;">#VT-${sale.id || t('reports.temp')}</span>
      </div>

      <div style="margin-top: 20px; border: 1.5px solid #000; padding: 10px; background-color: #f9f9f9;">
        <p style="margin: 5px 0;"><b>${t('common.date')} :</b> ${new Date(sale.date).toLocaleDateString(t('common.dateLocale'))}</p>
        <p style="margin: 5px 0;"><b>${t('reports.customer')} :</b> ${sale.customer_name} ${sale.customer_phone ? `(${sale.customer_phone})` : ''}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 30px; border: 2px solid #000;">
        <thead>
          <tr style="background-color: #f9d760; border-bottom: 2px solid #000;">
            <th style="padding: 12px; text-align: left; border-right: 1px solid #000; font-weight: 900;">${t('reports.designation')}</th>
            <th style="padding: 12px; text-align: center; border-right: 1px solid #000; font-weight: 900;">${t('reports.quantity')}</th>
            <th style="padding: 12px; text-align: right; border-right: 1px solid #000; font-weight: 900;">${t('reports.unitPrice')}</th>
            <th style="padding: 12px; text-align: right; font-weight: 900;">${t('common.total')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #000; border-right: 1px solid #000;">${sale.product_type}</td>
            <td style="padding: 12px; border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: center;">${sale.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #000; border-right: 1px solid #000; text-align: right;">${formatCurrency(sale.unit_price, t('common.currency'))}</td>
            <td style="padding: 12px; border-bottom: 1px solid #000; text-align: right; font-weight: bold;">${formatCurrency(sale.total_amount, t('common.currency'))}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 30px; margin-left: auto; width: 60%; border: 2px solid #000; padding: 10px; background-color: #f9d760;">
        <div style="display: flex; justify-content: space-between; padding: 5px 0;">
          <span>${t('reports.totalAmount')} :</span>
          <b style="font-weight: 900;">${formatCurrency(sale.total_amount, t('common.currency'))}</b>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 5px 0;">
          <span>${t('reports.paid')} :</span>
          <b style="font-weight: 900;">${formatCurrency(sale.amount_paid, t('common.currency'))}</b>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #000; margin-top: 5px; font-size: 1.2em;">
          <b style="font-weight: 900;">${t('reports.remaining')} :</b>
          <b style="color: ${sale.total_amount - sale.amount_paid > 0 ? '#D32F2F' : '#2E7D32'}; font-weight: 900;">
            ${formatCurrency(Math.max(0, sale.total_amount - sale.amount_paid), t('common.currency'))}
          </b>
        </div>
      </div>

      <div style="margin-top: 60px; text-align: center; font-style: italic; color: #888;">
        <p>${t('reports.thanks')}</p>
      </div>
    </div>
  `;
  const data = [{
    ID: sale.id || t('reports.temp'),
    [t('reports.customer')]: sale.customer_name,
    [t('reports.designation')]: sale.product_type,
    [t('reports.quantity')]: sale.quantity,
    [t('reports.unitPrice')]: sale.unit_price,
    [t('common.total')]: sale.total_amount,
    [t('reports.paid')]: sale.amount_paid,
    [t('common.date')]: sale.date
  }];
  requestExportFormat(t('reports.receiptTitle'), data, html, `Recu_${sale.id || 'nouveau'}`, t);
};

export const exportProductionData = async (productions: any[], title: string = "Production", t: (key: string, params?: any, fallback?: string) => string) => {
  // Sécurité : On s'assure de ne prendre que les colonnes de production, jamais de prix ou revenus
  const activeProductions = productions.filter(p => p.status !== 'ANNULEE');
  const data = activeProductions.map(p => ({
    [t('common.date')]: new Date(p.date).toLocaleDateString(t('common.dateLocale')),
    [t('lots.lot')]: p.lot_name || p.lot,
    [t('production.totalProduced')]: (p.casiers_produits || 0),
    [t('production.stats.salable')]: p.casiers_vendables || 0,
    [t('production.stats.nonSalable')]: ((p.oeufs_casses || 0) + (p.oeufs_deformes || 0)) / 30
  }));

  const rows = data.map(d => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${d[t('common.date')]}</td>
      <td style="border: 1px solid #000; padding: 8px;">${d[t('lots.lot')]}</td>
      <td style="border: 1px solid #000; padding: 8px; text-align: center;">${formatNumber(d[t('production.totalProduced')])}</td>
      <td style="border: 1px solid #000; padding: 8px; text-align: center;">${formatNumber(d[t('production.stats.salable')])}</td>
      <td style="border: 1px solid #000; padding: 8px; text-align: center;">${formatNumber(d[t('production.stats.nonSalable')])}</td>
    </tr>
  `).join('');

  const html = `
    <div style="border: 2.5px solid #000; padding: 20px; background-color: #fff; font-family: sans-serif;">
      <h1 style="text-align: center; color: #000; margin-top: 0; font-weight: 900; text-transform: uppercase; word-wrap: break-word;">
        ${t('reports.productionReportTitle')} - ${title}
      </h1>
      <p style="text-align: center; font-size: 0.9em; margin-bottom: 20px;">${t('reports.generatedOn')} ${new Date().toLocaleDateString(t('common.dateLocale'))}</p>

      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
        <thead style="background-color: #f9d760;">
          <tr style="border-bottom: 2px solid #000;">
            <th style="border: 1px solid #000; padding: 10px; font-weight: 900; font-size: 11px;">${t('common.date')}</th>
            <th style="border: 1px solid #000; padding: 10px; font-weight: 900; font-size: 11px;">${t('lots.lot')}</th>
            <th style="border: 1px solid #000; padding: 10px; font-weight: 900; font-size: 11px;">${t('production.totalProduced')}<br/>(${t('dashboard.units.trays')})</th>
            <th style="border: 1px solid #000; padding: 10px; font-weight: 900; font-size: 11px;">${t('production.stats.salable')}</th>
            <th style="border: 1px solid #000; padding: 10px; font-weight: 900; font-size: 11px;">${t('production.stats.nonSalable')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div style="margin-top: 30px; font-size: 10px; font-style: italic; color: #666;">
        * ${t('statistics.realTimeData')}
      </div>
    </div>
  `;

  requestExportFormat(title, data, html, `Production_${title.replace(/\s+/g, '_')}`, t);
};

export const generateConsolidatedFinancePDF = async (financeData: any, t: (key: string, params?: any, fallback?: string) => string) => {
  const { revenues, expenses, sales, expenses_list, period } = financeData;

  const salesRows = sales.filter((s: any) => s.status !== 'ANNULEE').map((s: any) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${new Date(s.date).toLocaleDateString(t('common.dateLocale'))}</td>
      <td style="border: 1px solid #000; padding: 8px;">${t('actions.sale')}: ${s.customer_name || t('reports.customer')}</td>
      <td style="border: 1px solid #000; padding: 8px; text-align: right; color: green; font-weight: 900;">${formatCurrency(s.amount_paid, t('common.currency'))}</td>
    </tr>
  `).join('');

  const expenseRows = expenses_list.filter((e: any) => e.status !== 'ANNULEE').map((e: any) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${new Date(e.date || e.created_at).toLocaleDateString(t('common.dateLocale'))}</td>
      <td style="border: 1px solid #000; padding: 8px;">${t('expense.category')}: ${e.description || e.category}</td>
      <td style="border: 1px solid #000; padding: 8px; text-align: right; color: red; font-weight: 900;">-${formatCurrency(e.amount, t('common.currency'))}</td>
    </tr>
  `).join('');

  const html = `
    <div style="border: 2.5px solid #000; padding: 20px; background-color: #fff; font-family: sans-serif;">
      <h1 style="text-align: center; color: #000; margin-top: 0; font-weight: 900; text-transform: uppercase;">${t('reports.financeTitle')} - ${period}</h1>
      <p style="text-align: center; font-size: 0.9em; margin-bottom: 20px;">${t('reports.generatedOn')} ${new Date().toLocaleDateString(t('common.dateLocale'))}</p>

      <!-- Résumé financier -->
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 20px;">
        <thead style="background-color: #f9d760;">
          <tr style="border-bottom: 2px solid #000;">
            <th style="border: 1px solid #000; padding: 12px; text-align: left; font-weight: 900;">${t('reports.designation')}</th>
            <th style="border: 1px solid #000; padding: 12px; text-align: right; font-weight: 900;">${t('reports.totalAmount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background-color: #fff;">
            <td style="border: 1px solid #000; padding: 10px;">${t('finance.income')}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: 900;">${formatCurrency(revenues, t('common.currency'))}</td>
          </tr>
          <tr style="background-color: #f9f9f9;">
            <td style="border: 1px solid #000; padding: 10px;">${t('finance.expenses')}</td>
            <td style="border: 1px solid #000; padding: 10px; text-align: right; font-weight: 900;">${formatCurrency(expenses, t('common.currency'))}</td>
          </tr>
          <tr style="background-color: #f9d760; font-weight: 900; border-top: 2px solid #000;">
            <td style="border: 1px solid #000; padding: 12px;">${t('finance.balance')}</td>
            <td style="border: 1px solid #000; padding: 12px; text-align: right; color: ${revenues - expenses >= 0 ? '#2E7D32' : '#D32F2F'};">${formatCurrency(revenues - expenses, t('common.currency'))}</td>
          </tr>
        </tbody>
      </table>

      <!-- Transactions -->
      <h3 style="border-bottom: 3px solid #000; padding-bottom: 5px; font-weight: 900; text-transform: uppercase;">${t('finance.recentTransactions')}</h3>
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
        <thead>
          <tr style="background-color: #000; color: #fff;">
            <th style="border: 1px solid #fff; padding: 10px; font-weight: 900;">${t('common.date')}</th>
            <th style="border: 1px solid #fff; padding: 10px; font-weight: 900;">${t('common.description')}</th>
            <th style="border: 1px solid #fff; padding: 10px; text-align: right; font-weight: 900;">${t('reports.totalAmount')} (${t('common.currency')})</th>
          </tr>
        </thead>
        <tbody>
          ${salesRows}
          ${expenseRows}
        </tbody>
      </table>
    </div>
  `;

  await exportToPDF(html, `Finance_${period.replace(/\s+/g, '_')}`, t);
};

/**
 * Génère un fichier Excel avec les statistiques de production
 * Structure: Feuille Résumé + Feuille Transactions
 */
export const generateProductionExcel = async (stats: any, period: string, t: (key: string, params?: any, fallback?: string) => string) => {
  try {
    const summary = stats?.summary || {};
    const dateStr = new Date().toLocaleDateString(t('common.dateLocale'));

    const wb = XLSX.utils.book_new();

    // Feuille 1: Résumé
    const summaryData = [
      { [t('reports.designation')]: t('reports.reportTitle'), [t('reports.value')]: 'Statistiques SolFerme' },
      { [t('reports.designation')]: t('reports.period'), [t('reports.value')]: period },
      { [t('reports.designation')]: t('reports.generatedOn'), [t('reports.value')]: dateStr },
      {},
      { [t('reports.designation')]: '--- ' + t('dashboard.recentActivitiesSection') + ' ---', [t('reports.value')]: '' },
      { [t('reports.designation')]: t('farms.title'), [t('reports.value')]: summary.farms_count || 0 },
      { [t('reports.designation')]: t('farms.batches'), [t('reports.value')]: summary.lots_count || 0 },
      { [t('reports.designation')]: t('lots.alive'), [t('reports.value')]: summary.current_birds || 0 },
      {},
      { [t('reports.designation')]: '--- ' + t('lots.statsProduction') + ' ---', [t('reports.value')]: '' },
      { [t('reports.designation')]: t('production.stats.produced'), [t('reports.value')]: (summary.production_total || 0) + ' ' + t('dashboard.units.trays') },
      { [t('reports.designation')]: t('production.stats.salable'), [t('reports.value')]: (summary.production_salable || 0) + ' ' + t('dashboard.units.trays') },
      { [t('reports.designation')]: t('lots.sold'), [t('reports.value')]: (summary.production_sold || 0) + ' ' + t('dashboard.units.trays') },
      {},
      { [t('reports.designation')]: '--- ' + t('lots.statsAlimentation') + ' ---', [t('reports.value')]: '' },
      { [t('reports.designation')]: t('lots.consommationAliment'), [t('reports.value')]: (summary.feeding_consumed || 0) + ' kg' },
      { [t('reports.designation')]: t('lots.stockAliment'), [t('reports.value')]: (summary.feed_stock || 0) + ' kg' },
      {},
      { [t('reports.designation')]: '--- ' + t('lots.statsSante') + ' ---', [t('reports.value')]: '' },
      { [t('reports.designation')]: t('lots.poulesMortes'), [t('reports.value')]: summary.dead_birds || 0 },
      { [t('reports.designation')]: t('lots.poulesMalades'), [t('reports.value')]: summary.sick_birds || 0 },
      { [t('reports.designation')]: t('lots.traitementsEffectues'), [t('reports.value')]: summary.health_treatments || 0 },
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, t('reports.summary'));

    // Feuille 2: Métriques détaillées
    const metricsData = [
      { [t('reports.metric')]: t('reports.value'), [t('reports.unit')]: t('reports.description') },
      { [t('reports.metric')]: t('farms.title'), [t('reports.value')]: summary.farms_count || 0, [t('reports.unit')]: t('reports.farmsCount') },
      { [t('reports.metric')]: t('farms.batches'), [t('reports.value')]: summary.lots_count || 0, [t('reports.unit')]: t('reports.lotsCount') },
      { [t('reports.metric')]: t('lots.alive'), [t('reports.value')]: summary.current_birds || 0, [t('reports.unit')]: t('reports.birdsCount') },
      { [t('reports.metric')]: t('production.stats.produced'), [t('reports.value')]: summary.production_total || 0, [t('reports.unit')]: t('dashboard.units.trays') },
      { [t('reports.metric')]: t('production.stats.salable'), [t('reports.value')]: summary.production_salable || 0, [t('reports.unit')]: t('dashboard.units.trays') },
      { [t('reports.metric')]: t('lots.sold'), [t('reports.value')]: summary.production_sold || 0, [t('reports.unit')]: t('dashboard.units.trays') },
      { [t('reports.metric')]: t('lots.consommationAliment'), [t('reports.value')]: summary.feeding_consumed || 0, [t('reports.unit')]: t('common.kg') },
      { [t('reports.metric')]: t('lots.stockAliment'), [t('reports.value')]: summary.feed_stock || 0, [t('reports.unit')]: t('common.kg') },
      { [t('reports.metric')]: t('lots.poulesMortes'), [t('reports.value')]: summary.dead_birds || 0, [t('reports.unit')]: t('reports.count') },
      { [t('reports.metric')]: t('lots.poulesMalades'), [t('reports.value')]: summary.sick_birds || 0, [t('reports.unit')]: t('reports.count') },
      { [t('reports.metric')]: t('lots.traitementsEffectues'), [t('reports.value')]: summary.health_treatments || 0, [t('reports.unit')]: t('reports.count') },
    ];

    const wsMetrics = XLSX.utils.json_to_sheet(metricsData);
    wsMetrics['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsMetrics, t('reports.metrics'));

    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `SolFerme_Stats_${timestamp}`;
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    await triggerDownload(blob, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (error) {
    console.error('Production Excel Export Error:', error);
    Alert.alert(t('common.error'), t('lots.exportError') || 'Impossible de générer le fichier Excel');
  }
};


