import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Alert } from 'react-native';
import { formatCurrency, formatNumber } from './formatters';

/**
 * Propose à l'utilisateur de choisir le format d'exportation
 */
export const requestExportFormat = (title: string, data: any[], htmlContent: string, filename: string) => {
  Alert.alert(
    "Format d'exportation",
    "Choisissez le format de fichier pour " + title,
    [
      { text: 'PDF', onPress: () => exportToPDF(htmlContent, filename) },
      { text: 'Excel (XLSX)', onPress: () => exportToExcel(data, filename) },
      { text: 'Word (DOC)', onPress: () => exportToWord(htmlContent, filename) },
      { text: 'Annuler', style: 'cancel' }
    ],
    { cancelable: true }
  );
};

// --- PDF ---
export const exportToPDF = async (html: string, filename: string) => {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const targetUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    Alert.alert('Erreur', "Impossible de générer le PDF");
  }
};

// --- EXCEL ---
export const exportToExcel = async (data: any[], filename: string) => {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Données");
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileUri = `${FileSystem.cacheDirectory}${filename}.xlsx`;
    await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      UTI: 'com.microsoft.excel.xlsx'
    });
  } catch (error) {
    Alert.alert('Erreur', "Impossible de générer le fichier Excel");
  }
};

// --- WORD ---
export const exportToWord = async (html: string, filename: string) => {
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
    Alert.alert('Erreur', "Impossible de générer le fichier Word");
  }
};

/**
 * Exporte l'intégralité de la base de données dans un seul fichier Excel multi-feuilles
 */
export const exportAllToExcel = async (allData: { [key: string]: any[] }, filename: string) => {
  try {
    const wb = XLSX.utils.book_new();
    let hasData = false;

    for (const [sheetName, data] of Object.entries(allData)) {
      if (data && data.length > 0) {
        hasData = true;
        // Transformation des objets complexes en chaînes pour ne pas perdre d'info
        const flattenedData = data.map(item => {
          const newItem: any = {};
          for (const [key, value] of Object.entries(item)) {
            if (value !== null && typeof value === 'object') {
              newItem[key] = JSON.stringify(value);
            } else {
              newItem[key] = value;
            }
          }
          return newItem;
        });
        const ws = XLSX.utils.json_to_sheet(flattenedData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    }

    if (!hasData) {
      Alert.alert("Info", "Aucune donnée à exporter.");
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
    Alert.alert('Erreur', "Échec de l'exportation Excel.");
  }
};

/**
 * Exporte toute la base en PDF (Tableaux successifs)
 */
export const exportAllToPDF = async (allData: { [key: string]: any[] }, filename: string) => {
  try {
    let htmlSections = `<h1 style="text-align: center; color: #4CAF50;">Rapport Global SolFerme</h1>`;
    htmlSections += `<p style="text-align: center;">Généré le ${new Date().toLocaleString()}</p>`;

    for (const [title, data] of Object.entries(allData)) {
      if (data && data.length > 0) {
        htmlSections += `<div style="border: 2px solid #000; padding: 10px; margin-bottom: 20px; background-color: #fff;">`;
        htmlSections += `<h2>${title}</h2>`;
        htmlSections += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; border: 1px solid #000;">`;

        // Headers
        const headers = Object.keys(data[0]);
        htmlSections += `<tr style="background-color: #f9d760; border-bottom: 2px solid #000;">${headers.map(h => `<th style="border: 1px solid #000; padding: 5px;">${h}</th>`).join('')}</tr>`;

        // Rows
        data.forEach(row => {
          htmlSections += `<tr>${headers.map(h => {
            const val = row[h];
            let displayVal = val;
            if (typeof val === 'number') {
              displayVal = formatNumber(val);
            } else if (typeof val === 'object' && val !== null) {
              displayVal = '...';
            } else {
              displayVal = val || '';
            }
            return `<td style="border: 1px solid #000; padding: 5px;">${displayVal}</td>`;
          }).join('')}</tr>`;
        });

        htmlSections += `</table></div>`;
      }
    }

    const { uri } = await Print.printToFileAsync({ html: `<html><body>${htmlSections}</body></html>` });
    const targetUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: targetUri });
    await Sharing.shareAsync(targetUri, { mimeType: 'application/pdf', UTI: '.pdf' });
  } catch (error) {
    Alert.alert('Erreur', "Impossible de générer le PDF global.");
  }
};

/**
 * Exporte toute la base en Word
 */
export const exportAllToWord = async (allData: { [key: string]: any[] }, filename: string) => {
  try {
    let htmlContent = `<h1>Rapport Global SolFerme</h1>`;
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
    Alert.alert('Erreur', "Impossible de générer le fichier Word global.");
  }
};

/**
 * Propose à l'utilisateur de choisir le format d'exportation GLOBAL
 */
export const requestGlobalExportFormat = (allData: { [key: string]: any[] }, filename: string) => {
  Alert.alert(
    "Format d'exportation",
    "Choisissez le format pour l'export global",
    [
      { text: 'PDF', onPress: () => exportAllToPDF(allData, filename) },
      { text: 'Excel (XLSX)', onPress: () => exportAllToExcel(allData, filename) },
      { text: 'Word (DOC)', onPress: () => exportAllToWord(allData, filename) },
      { text: 'Annuler', style: 'cancel' }
    ]
  );
};

export const generatePayrollPDF = async (payrollData: any) => {
  const { name, position, base_salary, bonus, deduction, amount_paid, month } = payrollData;
  const html = `
    <div style="border: 2px solid #000; padding: 20px; font-family: sans-serif; background-color: #fff;">
      <h1 style="text-align: center; color: #4CAF50;">Bulletin de Paie</h1>
      <p style="text-align: right;">Période : <b>${month}</b></p>

      <div style="margin-top: 30px; border: 1px solid #ccc; padding: 15px;">
        <p><b>Employé :</b> ${name}</p>
        <p><b>Poste :</b> ${position}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 30px;">
        <tr style="background-color: #f2f2f2;">
          <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">Désignation</th>
          <th style="border: 1px solid #ccc; padding: 10px; text-align: right;">Montant</th>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 10px;">Salaire de Base</td>
          <td style="border: 1px solid #ccc; padding: 10px; text-align: right;">${formatCurrency(base_salary)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 10px;">Primes / Bonus</td>
          <td style="border: 1px solid #ccc; padding: 10px; text-align: right;">${formatCurrency(bonus || 0)}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 10px;">Retenues</td>
          <td style="border: 1px solid #ccc; padding: 10px; text-align: right;">-${formatCurrency(deduction || 0)}</td>
        </tr>
        <tr style="font-weight: bold; background-color: #e8f5e9;">
          <td style="border: 1px solid #ccc; padding: 10px;">NET À PAYER</td>
          <td style="border: 1px solid #ccc; padding: 10px; text-align: right;">${formatCurrency(amount_paid)}</td>
        </tr>
      </table>

      <div style="margin-top: 50px; display: flex; justify-content: space-between;">
        <div style="text-align: center;">
          <p>Signature de l'Employeur</p>
          <div style="height: 60px;"></div>
        </div>
        <div style="text-align: center;">
          <p>Signature de l'Employé</p>
          <div style="height: 60px;"></div>
        </div>
      </div>
    </div>
  `;

  await exportToPDF(html, `Bulletin_${name.replace(/\s+/g, '_')}_${month.replace(/\s+/g, '_')}`);
};

export const generateGroupPayrollPDF = async (payrolls: any[], month: string) => {
  const rows = payrolls.map(p => {
    return `
      <tr>
        <td style="border: 1px solid #ccc; padding: 8px;">${p.employee}</td>
        <td style="border: 1px solid #ccc; padding: 8px;">${p.period}</td>
        <td style="border: 1px solid #ccc; padding: 8px; text-align: right;">${formatCurrency(p.salary)}</td>
        <td style="border: 1px solid #ccc; padding: 8px; color: ${p.status === 'Payé' ? '#2E7D32' : '#D32F2F'}; font-weight: bold;">${p.status}</td>
      </tr>
    `;
  }).join('');

  const total = payrolls.filter(p => p.status === 'Payé').reduce((sum, p) => sum + parseFloat(p.salary), 0);

  const html = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h1 style="text-align: center;">Bordereau de Paiement - ${month}</h1>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <thead>
          <tr style="background-color: #f9d760;">
            <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">Employé</th>
            <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">Période</th>
            <th style="border: 1px solid #ccc; padding: 10px; text-align: right;">Montant</th>
            <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="font-weight: bold; background-color: #e8f5e9;">
            <td colspan="2" style="border: 1px solid #ccc; padding: 10px; text-align: right;">TOTAL PAYÉ</td>
            <td style="border: 1px solid #ccc; padding: 10px; text-align: right;">${formatCurrency(total)}</td>
            <td style="border: 1px solid #ccc; padding: 10px;"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  await exportToPDF(html, `Paies_Groupees_${month.replace(/\s+/g, '_')}`);
};

// --- Fonctions existantes adaptées ---

export const generateReceiptPDF = async (sale: any, t: (key: string) => string) => {
  const html = `
    <div style="border: 2px solid #000; padding: 30px; font-family: sans-serif; background-color: #fff; max-width: 600px; margin: auto;">
      <h1 style="text-align: center; color: #4CAF50; margin-bottom: 0;">SolFerme</h1>
      <p style="text-align: center; margin-top: 5px; color: #666;">Production & Vente de Volailles</p>

      <div style="margin-top: 40px; border-bottom: 2px solid #eee; padding-bottom: 10px; display: flex; justify-content: space-between;">
        <h2 style="margin: 0;">REÇU DE VENTE</h2>
        <span style="color: #888;">#VT-${sale.id || 'TEMP'}</span>
      </div>

      <div style="margin-top: 20px;">
        <p><b>Date :</b> ${new Date(sale.date).toLocaleDateString()}</p>
        <p><b>Client :</b> ${sale.customer_name} ${sale.customer_phone ? `(${sale.customer_phone})` : ''}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 30px;">
        <thead>
          <tr style="background-color: #f9f9f9; border-bottom: 2px solid #4CAF50;">
            <th style="padding: 12px; text-align: left;">Désignation</th>
            <th style="padding: 12px; text-align: center;">Qté</th>
            <th style="padding: 12px; text-align: right;">P.U</th>
            <th style="padding: 12px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">${sale.product_type}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${sale.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(sale.unit_price)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrency(sale.total_amount)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 30px; margin-left: auto; width: 60%;">
        <div style="display: flex; justify-content: space-between; padding: 5px 0;">
          <span>Total :</span>
          <b>${formatCurrency(sale.total_amount)}</b>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 5px 0;">
          <span>Versé :</span>
          <b>${formatCurrency(sale.amount_paid)}</b>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #4CAF50; margin-top: 5px; font-size: 1.2em;">
          <b>Reste :</b>
          <b style="color: ${sale.total_amount - sale.amount_paid > 0 ? '#D32F2F' : '#2E7D32'};">
            ${formatCurrency(Math.max(0, sale.total_amount - sale.amount_paid))}
          </b>
        </div>
      </div>

      <div style="margin-top: 60px; text-align: center; font-style: italic; color: #888;">
        <p>Merci pour votre confiance !</p>
      </div>
    </div>
  `;
  const data = [{
    ID: sale.id || 'N/A',
    Client: sale.customer_name,
    Produit: sale.product_type,
    Quantite: sale.quantity,
    'Prix Unitaire': sale.unit_price,
    Total: sale.total_amount,
    'Montant Paye': sale.amount_paid,
    Date: sale.date
  }];
  requestExportFormat(t('sales.receipt') || "Reçu de vente", data, html, `Recu_${sale.id || 'nouveau'}`);
};

export const exportProductionData = async (productions: any[], title: string = "Production") => {
  const data = productions.map(p => ({
    'Date': new Date(p.date).toLocaleDateString(),
    'Lot': p.lot_name || p.lot,
    'Casiers Produits': (p.casiers_vendables || 0) + ((p.oeufs_casses || 0) / 30),
    'Casiers Vendables': p.casiers_vendables || 0,
    'Casiers Anomalies': 0, // Cette colonne devient redondante ou doit être recalculée différemment
    'Œufs Cassés (Unités)': p.oeufs_casses || 0,
    'Casiers Cassés': (p.oeufs_casses || 0) / 30
  }));

  const rows = data.map(d => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${d.Date}</td>
      <td style="border: 1px solid #000; padding: 8px;">${d.Lot}</td>
      <td style="border: 1px solid #000; padding: 8px;">${formatNumber(d['Casiers Produits'])}</td>
      <td style="border: 1px solid #000; padding: 8px;">${formatNumber(d['Casiers Vendables'])}</td>
      <td style="border: 1px solid #000; padding: 8px;">${formatNumber(d['Casiers Cassés'])}</td>
    </tr>
  `).join('');

  const html = `
    <div style="border: 2px solid #000; padding: 20px; background-color: #fff;">
      <h1 style="text-align: center; color: #000; margin-top: 0;">Rapport de Production - ${title}</h1>
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
        <thead style="background-color: #f9d760;">
          <tr>
            <th style="border: 1px solid #000; padding: 10px;">Date</th>
            <th style="border: 1px solid #000; padding: 10px;">Lot</th>
            <th style="border: 1px solid #000; padding: 10px;">Total (Casiers)</th>
            <th style="border: 1px solid #000; padding: 10px;">Vendables</th>
            <th style="border: 1px solid #000; padding: 10px;">Cassés</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  requestExportFormat(title, data, html, `Production_${title.replace(/\s+/g, '_')}`);
};

export const generateConsolidatedFinancePDF = async (financeData: any) => {
  const { revenues, expenses, sales, expenses_list, period } = financeData;

  const data = [
    { Categorie: 'Revenus Totaux', Montant: formatCurrency(revenues) },
    { Categorie: 'Dépenses Totales', Montant: formatCurrency(expenses) },
    { Categorie: 'Bénéfice Net', Montant: formatCurrency(revenues - expenses) }
  ];

  const salesRows = sales.map((s: any) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${new Date(s.date).toLocaleDateString()}</td>
      <td style="border: 1px solid #000; padding: 8px;">Vente: ${s.customer_name || 'Client'}</td>
      <td style="border: 1px solid #000; padding: 8px; color: green; font-weight: bold;">+${formatNumber(s.amount_paid)}</td>
    </tr>
  `).join('');

  const expenseRows = expenses_list.map((e: any) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${new Date(e.date || e.created_at).toLocaleDateString()}</td>
      <td style="border: 1px solid #000; padding: 8px;">Dépense: ${e.description || e.category}</td>
      <td style="border: 1px solid #000; padding: 8px; color: red; font-weight: bold;">-${formatNumber(e.amount)}</td>
    </tr>
  `).join('');

  const html = `
    <div style="border: 2px solid #000; padding: 20px; background-color: #fff;">
      <h1 style="text-align: center; color: #000; margin-top: 0;">Rapport Financier - ${period}</h1>

      <div style="margin-bottom: 20px; padding: 15px; border: 2px solid #000; background-color: #f9d760;">
        <p style="margin: 5px 0;"><b>Revenus:</b> ${formatCurrency(revenues)}</p>
        <p style="margin: 5px 0;"><b>Dépenses:</b> ${formatCurrency(expenses)}</p>
        <div style="border-top: 2px solid #000; margin: 10px 0;"></div>
        <p style="margin: 5px 0; font-size: 1.2em;"><b>Bénéfice Net:</b> <span style="color: ${revenues - expenses >= 0 ? '#2E7D32' : '#D32F2F'}; font-weight: bold;">${formatCurrency(revenues - expenses)}</span></p>
      </div>

      <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px;">Détails des Transactions</h3>
      <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
        <thead>
          <tr style="background-color: #000; color: #fff;">
            <th style="border: 1px solid #fff; padding: 10px;">Date</th>
            <th style="border: 1px solid #fff; padding: 10px;">Description</th>
            <th style="border: 1px solid #fff; padding: 10px;">Montant (GNF)</th>
          </tr>
        </thead>
        <tbody>
          ${salesRows}
          ${expenseRows}
        </tbody>
      </table>
    </div>
  `;

  requestExportFormat(`Rapport Financier ${period}`, data, html, `Finance_${period}`);
};
