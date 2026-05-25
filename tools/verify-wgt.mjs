#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [, , wgtPath, modeArg = 'debug'] = process.argv;
if (!wgtPath) {
  console.error('Usage: node tools/verify-wgt.mjs <path-to.wgt> [production|debug]');
  process.exit(2);
}

const mode = String(modeArg).toLowerCase();
const production = mode === 'production';
if (!fs.existsSync(wgtPath)) throw new Error(`WGT not found: ${wgtPath}`);
const stat = fs.statSync(wgtPath);
if (stat.size <= 0) throw new Error('WGT size must be > 0');

const listingRaw = execFileSync('unzip', ['-Z1', wgtPath], { encoding: 'utf8' });
const entries = listingRaw.split('\n').map((x) => x.trim()).filter(Boolean);
const rootOnly = (name) => entries.some((x) => x === name);
const fileExistsInZip = (name) => entries.some((x) => x === name || x.endsWith('/' + name));

['config.xml', 'index.html', 'icon.png'].forEach((f) => {
  if (!rootOnly(f)) throw new Error(`Missing required root file: ${f}`);
});

const signatureFiles = entries.filter((x) => /(^|\/)author-signature\.xml$|(^|\/)signature\d+\.xml$/i.test(x));
if (production && !signatureFiles.some((x) => /author-signature\.xml$/i.test(x))) throw new Error('Missing author-signature.xml');
if (production && !signatureFiles.some((x) => /signature\d+\.xml$/i.test(x))) throw new Error('Production WGT missing distributor signature file');

const forbidden = ['node_modules/', '.git/', '.github/', '.env', 'package-lock.json', '__tests__/', 'test-fixtures/'];
for (const bad of forbidden) {
  if (entries.some((x) => x === bad || x.startsWith(bad) || x.indexOf('/' + bad) >= 0)) throw new Error(`Forbidden file in WGT: ${bad}`);
}
const hasSourceMaps = entries.some((x) => x.endsWith('.map'));

const cfg = execFileSync('unzip', ['-p', wgtPath, 'config.xml'], { encoding: 'utf8' });
if (!/<tizen:application\s+[^>]*id="[A-Za-z0-9_.-]+"[^>]*package="[A-Za-z0-9_.-]+"/m.test(cfg)) throw new Error('config.xml missing valid tizen:application id/package');
if (!/<tizen:profile\s+name="tv"\s*\/>/i.test(cfg)) throw new Error('config.xml missing tv profile');

const appId = (cfg.match(/<tizen:application\s+[^>]*id="([^"]+)"/) || [])[1] || 'unknown';
const pkgId = (cfg.match(/<tizen:application\s+[^>]*package="([^"]+)"/) || [])[1] || 'unknown';
const version = (cfg.match(/<widget\s+[^>]*version="([^"]+)"/) || [])[1] || 'unknown';
const contentSrc = (cfg.match(/<content\s+src="([^"]+)"/) || [])[1] || '';
const iconSrc = (cfg.match(/<icon\s+src="([^"]+)"/) || [])[1] || '';
if (!contentSrc || !fileExistsInZip(contentSrc)) throw new Error('content src missing from WGT: ' + contentSrc);
if (!iconSrc || !fileExistsInZip(iconSrc)) throw new Error('icon src missing from WGT: ' + iconSrc);

console.log(JSON.stringify({
  wgtPath: path.resolve(wgtPath),
  size: stat.size,
  signed: signatureFiles.length > 1,
  production,
  productionRelease: production,
  signatureFiles,
  appId,
  packageId: pkgId,
  version,
  profile: 'tv',
  contentSrc,
  iconSrc,
  hasSourceMaps
}, null, 2));
