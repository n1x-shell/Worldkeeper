#!/usr/bin/env node
/**
 * The update manifest for a release (v0.9.18): `latest.json`, which the desktop app reads when the GM chooses
 * "Update and restart". It names, for each system, the file to download from this release and that file's signature
 * (made at build time with this project's update key; the app refuses a file whose signature doesn't match).
 *
 *   node scripts/updater-manifest.mjs <folder with the installers and their .sig files> <tag> > latest.json
 *
 * Exits 2 without printing when there are no signatures (a build made without the update key): the release is then
 * published as before, and the app offers a link instead of the button.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'https://github.com/n1x-shell/Worldkeeper';
/** Which signed file is each system's update. Tauri's updater replaces an AppImage, runs the NSIS setup, or unpacks the .app. */
const PLATFORMS = [
  [/_amd64\.AppImage$/, ['linux-x86_64']],
  [/_aarch64\.AppImage$/, ['linux-aarch64']],
  [/_x64-setup\.exe$/, ['windows-x86_64']],
  [/_arm64-setup\.exe$/, ['windows-aarch64']],
  // One .app.tar.gz per release so far (Apple silicon); an Intel build would be named for its own architecture.
  [/_x64\.app\.tar\.gz$/, ['darwin-x86_64']],
  [/\.app\.tar\.gz$/, ['darwin-aarch64']],
];

/** GitHub stores a release file's name with its spaces as dots. */
export const assetName = (file) => path.basename(file).replace(/ /g, '.');

export function buildManifest(dir, tag) {
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(tag)) throw new Error(`"${tag}" is not a release tag like v1.2.3`);
  const all = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else all.push(full);
    }
  };
  walk(dir);
  const platforms = {};
  for (const sig of all.filter((f) => f.endsWith('.sig')).sort((a, b) => a.localeCompare(b))) {
    const file = sig.slice(0, -4);
    if (!fs.existsSync(file)) throw new Error(`${path.basename(sig)} has no file beside it`);
    const hit = PLATFORMS.find(([re]) => re.test(file));
    if (!hit) continue; // an .msi's or .deb's signature: not what the updater installs
    for (const key of hit[1]) {
      if (platforms[key]) throw new Error(`Two update files for ${key}: ${path.basename(file)} and another`);
      platforms[key] = { signature: fs.readFileSync(sig, 'utf8').trim(), url: `${REPO}/releases/download/${tag}/${encodeURIComponent(assetName(file))}` };
    }
  }
  if (!Object.keys(platforms).length) return null;
  return { version: tag.replace(/^v/, ''), notes: `See ${REPO}/releases/tag/${tag}`, pub_date: new Date().toISOString(), platforms };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [dir, tag] = process.argv.slice(2);
  if (!dir || !tag) {
    console.error('usage: updater-manifest.mjs <folder> <tag>');
    process.exit(1);
  }
  const manifest = buildManifest(dir, tag);
  if (!manifest) {
    console.error('No signed update files in this build: no manifest.');
    process.exit(2);
  }
  console.error(`Update manifest for ${tag}: ${Object.keys(manifest.platforms).join(', ')}`);
  process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}
