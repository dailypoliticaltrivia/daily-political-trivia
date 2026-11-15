/* Shared guard for the Dark Horse bank generators (build-dh-*.js). The live banks in site/games/dark-horse/data/ have been corrected by hand
   since they were generated (answer audit 2026-11: answers added, wrong answers removed, aliases, weights and surname flags fixed; every change is in
   audit/answers-dark-horse-log.md and audit/answers-dark-horse-sources.csv). Regenerating a bank over the live file would silently undo that work,
   so a generator refuses unless it is run with --force, or writes somewhere else (--out <dir> where the generator supports it). */
'use strict';
const fs = require('fs'), path = require('path');
const LIVE = path.resolve(__dirname, '..', 'games', 'dark-horse', 'data');
module.exports = function guardBanks(outDir, fileRe, label) {
  if (process.argv.includes('--force')) return;
  if (path.resolve(outDir) !== LIVE || !fs.existsSync(outDir)) return;   // trial runs into a scratch folder are always fine
  const hit = fs.readdirSync(outDir).filter(f => fileRe.test(f));
  if (!hit.length) return;
  console.error('REFUSED: ' + label + ' would overwrite ' + hit.join(', ') + ' in site/games/dark-horse/data/.\n' +
    'These banks have been corrected by hand since they were generated (see audit/answers-dark-horse-log.md and audit/answers-dark-horse-sources.csv);\n' +
    'regenerating them would undo those fixes. Write to a scratch folder instead (--out <dir>, where supported) and diff with tools/dh-derived-diff.js,\n' +
    'or pass --force if you really mean to replace them (then re-apply the audit edit files in audit/answers-dh-edits-*.json).');
  process.exit(1);
};
