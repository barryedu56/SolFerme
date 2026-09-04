#!/usr/bin/env node
/**
 * À lancer APRÈS `expo export -p web` (voir package.json : "deploy"/"preview").
 *
 * 1. Liste tous les fichiers produits dans dist/ et les écrit dans
 *    dist/precache-manifest.json — c'est cette liste que public/sw.js précharge
 *    intégralement au moment de son installation (voir le commentaire en tête
 *    de sw.js pour le pourquoi).
 * 2. Remplace le jeton __BUILD_ID__ de dist/sw.js par un hash dérivé du contenu
 *    du build : le fichier sw.js change donc à CHAQUE déploiement, ce qui
 *    déclenche la détection de mise à jour du service worker par le navigateur.
 *
 * Sans ce script, seule la page HTML serait mise en cache → écran blanc au
 * premier lancement hors-ligne (bug constaté en production le 2026-09-04).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST = path.join(__dirname, '..', 'dist');
const SW_PATH = path.join(DIST, 'sw.js');
const MANIFEST_PATH = path.join(DIST, 'precache-manifest.json');

// Fichiers à ne jamais précacher nommément : générés par cette étape elle-même,
// ou volumineux/non essentiels au démarrage (rien d'autre n'est exclu — mieux
// vaut sur-cacher un peu que revivre l'écran blanc).
const EXCLUDE = new Set(['/sw.js', '/precache-manifest.json', '/metadata.json']);

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else {
      const urlPath = '/' + path.relative(base, full).split(path.sep).join('/');
      if (!EXCLUDE.has(urlPath)) out.push(urlPath);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`[pwa] Dossier introuvable : ${DIST} (lance d'abord "npx expo export -p web")`);
    process.exit(1);
  }
  if (!fs.existsSync(SW_PATH)) {
    console.error(`[pwa] ${SW_PATH} introuvable — public/sw.js n'a pas été copié dans dist/ ?`);
    process.exit(1);
  }

  const files = walk(DIST, DIST, []).sort();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(files));

  const buildId = crypto.createHash('sha256').update(files.join('|')).digest('hex').slice(0, 16);
  const swSource = fs.readFileSync(SW_PATH, 'utf8');
  if (!swSource.includes('__BUILD_ID__')) {
    console.warn('[pwa] __BUILD_ID__ absent de sw.js — le SW ne changera pas d\'un déploiement à l\'autre.');
  }
  fs.writeFileSync(SW_PATH, swSource.replace(/__BUILD_ID__/g, buildId));

  const totalBytes = files.reduce((sum, f) => sum + fs.statSync(path.join(DIST, f.slice(1))).size, 0);
  console.log(
    `[pwa] precache-manifest.json : ${files.length} fichiers (${(totalBytes / 1024 / 1024).toFixed(1)} Mo) — sw.js build ${buildId}`
  );
}

main();
