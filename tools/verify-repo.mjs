#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const required = [
  'app/config.xml',
  'app/index.html',
  'app/icon.png',
  'app/assets/tidalizen-logo.png',
  'app/css/app.css',
  'app/js/platform.js',
  'app/js/tidal-api.js',
  'app/js/player.js',
  'app/js/app.js',
  'package.exp',
  '.github/workflows/build-wgt.yml'
];
let ok = true;
for (const file of required) {
  if (!existsSync(file)) { console.error(`missing: ${file}`); ok = false; }
}
const config = readFileSync('app/config.xml', 'utf8');
for (const needle of ['Tidalizen01.Tidalizen', '<name>Tidalizen</name>', 'http://tizen.org/privilege/internet']) {
  if (!config.includes(needle)) { console.error(`config.xml missing ${needle}`); ok = false; }
}
if (!ok) process.exit(1);
console.log('Tidalizen repo verification OK');
