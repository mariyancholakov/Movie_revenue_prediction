// Fails when a text size is set off the type scale (globals.css --text-*).
// Use text-label … text-hero; add a deliberate exception to ALLOWED with a reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = {
  // the masthead nameplate is drawn to fit, not set on the scale
  'components/Header.tsx': ['text-[3.1rem]', 'sm:text-[6rem]', 'lg:text-[7rem]', '2xl:text-[8rem]'],
};

// fixed sizes (rem/px) and Tailwind's own scale; em and clamp() stay allowed
const OFF_SCALE = /(?<![\w-])((?:[\w[\]-]+:)*text-(?:\[[0-9.]+(?:rem|px)\]|xs|sm|base|lg|xl|[2-9]xl))(?![\w\]-])/g;

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
});

const problems = [];
for (const file of [...files('app'), ...files('components')]) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const [, cls] of line.matchAll(OFF_SCALE)) {
      if (!ALLOWED[file]?.includes(cls)) problems.push(`${file}:${i + 1}  ${cls}`);
    }
  });
}

if (problems.length) {
  console.error(`Off the type scale (use text-label … text-hero from globals.css):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('Type scale: all text sizes on the scale.');
