import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Alert } from 'react-native';
import { formatCurrency, formatNumber } from './formatters';

/**
 * Propose à l'utilisateur de choisir le format d'exportation
 */
export const requestExportFormat = (title: string, data: any[], htmlContent: string, filename: string, t: (key: string) => string) => {
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
    const { uri } = await Print.printToFileAsync({ html });
    const targetUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('lots.exportError') : "Impossible de générer le PDF");
  }
};

// --- EXCEL ---
export const exportToExcel = async (data: any[], filename: string, t?: (key: string) => string) => {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t ? t('common.info') : "Données");
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileUri = `${FileSystem.cacheDirectory}${filename}.xlsx`;
    await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'com.microsoft.excel.xlsx'
    });
  } catch (error) {
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('lots.exportError') : "Impossible de générer le fichier Excel");
  }
};

// --- WORD ---
export const exportToWord = async (html: string, filename: string, t?: (key: string) => string) => {
  try {
    // Hack: Un fichier HTML avec une extension .doc est lu comme du Word
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>`;
    const footer = "</body></html>";
    const fullContent = header + html + footer;
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

    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileUri = `${FileSystem.cacheDirectory}${filename}.xlsx`;
    await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'com.microsoft.excel.xlsx'
    });
  } catch (error) {
    console.error("Export Excel Error:", error);
    Alert.alert(t ? t('common.error') : 'Erreur', t ? t('dbMgt.exportError') : "Échec de l'exportation Excel.");
  }
};

/**
 * Exporte toute la base en PDF (Tableaux successifs avec en-têtes traduits)
 */
export const exportAllToPDF = async (allData: { [key: string]: any[] }, filename: string, t: (key: string) => string) => {
  try {
    let htmlSections = `<h1 style="text-align: center; color: #000; font-weight: 900; text-transform: uppercase; margin-bottom: 5px;">${t('dbMgt.globalExport')}</h1>`;
    htmlSections += `<p style="text-align: center; font-weight: bold; margin-bottom: 30px;">${t('reports.generatedOn')} ${new Date().toLocaleString(t('common.dateLocale'))}</p>`;

    for (const [key, data] of Object.entries(allData)) {
      if (data && data.length > 0) {
        const sectionTitle = t(`actions.${key}`) || t(`${key}.title`) || key;

        htmlSections += `<div style="margin-bottom: 30px;">`;
        htmlSections += `<h2 style="font-weight: 900; border-bottom: 3px solid #000; padding-bottom: 5px; text-transform: uppercase; font-size: 16px;">${sectionTitle}</h2>`;
        htmlSections += `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9px; border: 1.5px solid #000;">`;

        // Headers (Traduits)
        const rawHeaders = Object.keys(data[0]);
        htmlSections += `<tr style="background-color: #f9d760; border-bottom: 2px solid #000;">`;
        rawHeaders.forEach(h => {
          const label = t(`common.${h}`) || t(`reports.${h}`) || t(`lots.${h}`) || h;
          htmlSections += `<th style="border: 1px solid #000; padding: 6px; font-weight: 900; text-align: left;">${label}</th>`;
        });
        htmlSections += `</tr>`;

        // Rows
        data.forEach((row, idx) => {
          const isCancelled = row.status === 'ANNULEE' || row.status === 'ANNULÉ';
          const rowStyle = isCancelled ? 'text-decoration: line-through; color: #999;' : '';

          htmlSections += `<tr style="background-color: ${idx % 2 === 0 ? '#fff' : '#f2f2f2'}; ${rowStyle}">`;
          rawHeaders.forEach(h => {
            const val = row[h];
            let displayVal = val;
            if (typeof val === 'number') {
              displayVal = formatNumber(val);
            } else if (typeof val === 'object' && val !== null) {
              displayVal = val.name || val.label || '...';
            } else if (h.includes('date') || h.includes('at')) {
              displayVal = val ? new Date(val).toLocaleDateString(t('common.dateLocale')) : '';
            } else if (h === 'status' && isCancelled) {
                displayVal = t('common.cancelled') || 'ANNULÉ';
            } else {
              displayVal = val || '';
            }
            htmlSections += `<td style="border: 1px solid #000; padding: 6px;">${displayVal}</td>`;
          });
          htmlSections += `</tr>`;
        });

        htmlSections += `</table></div>`;
      }
    }

    const { uri } = await Print.printToFileAsync({ html: `<html><body style="padding: 20px;">${htmlSections}</body></html>` });
    const targetUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    console.error("Export PDF Error:", error);
    Alert.alert(t('common.error'), t('dbMgt.exportError'));
  }
};

/**
 * Génère un rapport consolidé complet (Statistics Hub)
 */
export const generateConsolidatedReport = async (stats: any, period: string, t: (key: string) => string, userRole: string) => {
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
export const exportAllToWord = async (allData: { [key: string]: any[] }, filename: string, t: (key: string) => string) => {
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
export const requestGlobalExportFormat = (allData: { [key: string]: any[] }, filename: string, t: (key: string) => string) => {
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

export const generatePayrollPDF = async (payrollData: any, t: (key: string) => string) => {
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

export const generateGroupPayrollPDF = async (payrolls: any[], month: string, t: (key: string) => string) => {
  const filteredPayrolls = payrolls.filter(p => p.status !== 'ANNULEE' && p.status !== 'ANNULÉ');

  const rows = filteredPayrolls.map(p => {
    return `
      <tr>
        <td style="border: 1px solid #000; padding: 8px;">${p.employee}</td>
        <td style="border: 1px solid #000; padding: 8px;">${p.period}</td>
        <td style="border: 1px solid #000; padding: 8px; text-align: right;">${formatCurrency(p.salary, t('common.currency'))}</td>
        <td style="border: 1px solid #000; padding: 8px; font-weight: 900; color: ${p.status === 'Payé' || p.status === 'PAID' ? '#2E7D32' : '#D32F2F'};">${p.status}</td>
      </tr>
    `;
  }).join('');

  const total = filteredPayrolls.filter(p => p.status === 'Payé' || p.status === 'PAID').reduce((sum, p) => sum + parseFloat(p.salary), 0);

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

export const generateReceiptPDF = async (sale: any, t: (key: string) => string) => {
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

export const exportProductionData = async (productions: any[], title: string = "Production", t: (key: string) => string) => {
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

export const generateConsolidatedFinancePDF = async (financeData: any, t: (key: string) => string) => {
  const { revenues, expenses, sales, expenses_list, period } = financeData;

  const data = [
    { [t('reports.designation')]: t('finance.income'), [t('reports.totalAmount')]: formatCurrency(revenues, t('common.currency')) },
    { [t('reports.designation')]: t('finance.expenses'), [t('reports.totalAmount')]: formatCurrency(expenses, t('common.currency')) },
    { [t('reports.designation')]: t('finance.balance'), [t('reports.totalAmount')]: formatCurrency(revenues - expenses, t('common.currency')) }
  ];

  const salesRows = sales.filter((s: any) => s.status !== 'ANNULEE').map((s: any) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${new Date(s.date).toLocaleDateString(t('common.dateLocale'))}</td>
      <td style="border: 1px solid #000; padding: 8px;">${t('actions.sale')}: ${s.customer_name || t('reports.customer')}</td>
      <td style="border: 1px solid #000; padding: 8px; color: green; font-weight: 900;">+${formatNumber(s.amount_paid)}</td>
    </tr>
  `).join('');

  const expenseRows = expenses_list.filter((e: any) => e.status !== 'ANNULEE').map((e: any) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${new Date(e.date || e.created_at).toLocaleDateString(t('common.dateLocale'))}</td>
      <td style="border: 1px solid #000; padding: 8px;">${t('expense.category')}: ${e.description || e.category}</td>
      <td style="border: 1px solid #000; padding: 8px; color: red; font-weight: 900;">-${formatNumber(e.amount)}</td>
    </tr>
  `).join('');

  const html = `
    <div style="border: 2.5px solid #000; padding: 20px; background-color: #fff;">
      <h1 style="text-align: center; color: #000; margin-top: 0; font-weight: 900; text-transform: uppercase;">${t('reports.financeTitle')} - ${period}</h1>

      <div style="margin-bottom: 20px; padding: 15px; border: 2.5px solid #000; background-color: #f9d760;">
        <p style="margin: 5px 0;"><b>${t('finance.income')}:</b> ${formatCurrency(revenues, t('common.currency'))}</p>
        <p style="margin: 5px 0;"><b>${t('finance.expenses')}:</b> ${formatCurrency(expenses, t('common.currency'))}</p>
        <div style="border-top: 2px solid #000; margin: 10px 0;"></div>
        <p style="margin: 5px 0; font-size: 1.2em; font-weight: 900;"><b>${t('finance.balance')}:</b> <span style="color: ${revenues - expenses >= 0 ? '#2E7D32' : '#D32F2F'};">${formatCurrency(revenues - expenses, t('common.currency'))}</span></p>
      </div>

      <h3 style="border-bottom: 3px solid #000; padding-bottom: 5px; font-weight: 900; text-transform: uppercase;">${t('finance.recentTransactions')}</h3>
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
        <thead>
          <tr style="background-color: #000; color: #fff;">
            <th style="border: 1px solid #fff; padding: 10px; font-weight: 900;">${t('common.date')}</th>
            <th style="border: 1px solid #fff; padding: 10px; font-weight: 900;">${t('common.description')}</th>
            <th style="border: 1px solid #fff; padding: 10px; font-weight: 900;">${t('reports.totalAmount')} (${t('common.currency')})</th>
          </tr>
        </thead>
        <tbody>
          ${salesRows}
          ${expenseRows}
        </tbody>
      </table>
    </div>
  `;

  requestExportFormat(`${t('reports.financeTitle')} ${period}`, data, html, `Finance_${period}`, t);
};
