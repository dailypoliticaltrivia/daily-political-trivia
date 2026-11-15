#!/usr/bin/env node
/* Checks site/games/caucus-sort/data/puzzles.json: structure, uniqueness, every photo exists and is 225x275 (JPEG header read), size limit.
 *   node site/tools/verify-caucus-sort.js     (exit code 1 on any problem) */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '..');
const PH = path.join(SITE, 'games', 'congressional-grid', 'photos');
const file = path.join(SITE, 'games', 'caucus-sort', 'data', 'puzzles.json');
const raw = fs.readFileSync(file, 'utf8'), d = JSON.parse(raw);
const bad = [];
function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let o = 2;
  while (o < buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const m = buf[o + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)];
    o += 2 + buf.readUInt16BE(o + 2);
  }
  return null;
}
const sizeCache = new Map();
const ids = new Set(); const faceUse = new Map();
d.puzzles.forEach(p => {
  if (ids.has(p.id)) bad.push('duplicate puzzle id ' + p.id); ids.add(p.id);
  if (p.g.length !== 4) bad.push(p.id + ': not 4 groups');
  const names = new Set(), photos = new Set();
  p.g.forEach(g => {
    if (g.p.length !== 4) bad.push(p.id + ': group not 4 people');
    g.p.forEach(([n, f]) => {
      if (names.has(n)) bad.push(p.id + ': repeated name ' + n); names.add(n);
      if (photos.has(f)) bad.push(p.id + ': repeated photo ' + f); photos.add(f);
      faceUse.set(f, (faceUse.get(f) || 0) + 1);
      if (!sizeCache.has(f)) {
        const fp = path.join(PH, f);
        if (!fs.existsSync(fp)) sizeCache.set(f, 'missing');
        else { const s = jpegSize(fs.readFileSync(fp)); sizeCache.set(f, s ? s.join('x') : 'unreadable'); }
      }
      if (sizeCache.get(f) !== '225x275') bad.push(p.id + ': ' + f + ' is ' + sizeCache.get(f));
    });
  });
});
const maxUse = Math.max(...faceUse.values());
const target = Math.ceil(d.puzzles.length / 25), over = [...faceUse.values()].filter(v => v > target).length;
if (maxUse > d.puzzles.length / 10) bad.push('a face is used ' + maxUse + ' times (hard limit 1 in 10 puzzles)');
console.log('face reuse: target 1 in 25 = ' + target + ' uses; faces above target: ' + over + ' of ' + faceUse.size + '; most used ' + maxUse + ' (mean ' + (d.puzzles.length * 16 / faceUse.size).toFixed(1) + ')');
if (raw.length > 1000000) bad.push('puzzles.json is ' + raw.length + ' bytes (limit about 1 MB)');
if (fs.existsSync(path.join(SITE, 'games', 'caucus-sort', 'data', 'people.json'))) bad.push('people.json must not be published in the game folder');
console.log('puzzles ' + d.puzzles.length + ', distinct faces ' + faceUse.size + ', max face reuse ' + maxUse + ', json ' + raw.length + ' bytes, photos checked ' + sizeCache.size + ' (all 225x275: ' + ([...sizeCache.values()].every(v => v === '225x275')) + ')');
if (bad.length) { console.log('PROBLEMS (' + bad.length + '):'); bad.slice(0, 30).forEach(b => console.log('  ' + b)); process.exit(1); }
console.log('OK');
