'use strict';
/* Fabrique toutes les icônes (web et Android) à partir de icons/logo.svg.
   Usage : node tools/make-icons.js   (Playwright et Chromium doivent être installés)
   À relancer après avoir remplacé le logo provisoire par les fichiers définitifs. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CREAM = '#FBF6EF';
const svg = fs.readFileSync(path.join(ROOT, 'icons/logo.svg'), 'utf8');
const RES = path.join(ROOT, 'android/app/src/main/res');

// [fichier, taille en px, part du carré occupée par le logo, fond]
const targets = [
  ['icons/icon-192.png', 192, 0.8, CREAM],
  ['icons/icon-512.png', 512, 0.8, CREAM],
  ['icons/icon-maskable-512.png', 512, 0.6, CREAM],
  ...[['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]].flatMap(([d, k]) => [
    [`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, Math.round(48 * k), 0.8, CREAM],
    // Icône adaptative : le logo doit rester dans la zone sûre (66 % du centre).
    [`android/app/src/main/res/mipmap-${d}/ic_launcher_fg.png`, Math.round(108 * k), 0.58, 'transparent'],
  ]),
  // Écran de démarrage d'Android 8 à 11 (144 dp en xxhdpi).
  ['android/app/src/main/res/drawable-xxhdpi/splash_logo.png', 432, 1, 'transparent'],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, part, bg] of targets) {
    const logo = Math.round(size * part);
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center">
      <div style="width:${logo}px;height:${logo}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body></html>`);
    const out = path.join(ROOT, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: bg === 'transparent' });
    console.log('✓', file);
  }
  await browser.close();
  if (!fs.existsSync(RES)) console.warn('Dossier Android introuvable');
})();
