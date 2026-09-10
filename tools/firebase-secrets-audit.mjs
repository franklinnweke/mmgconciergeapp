import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAYSTACK_SECRET_FUNCTIONS = Object.freeze([
  'initializeRentalRequestPayment',
  'initializeBookingPayment',
  'paystackWebhook',
  'processPaystackPaymentEvent',
  'reconcilePayment',
]);

function callableBlocks(source) {
  const blocks = new Map();
  const declaration = /export const (\w+) = on(?:Call|Request|DocumentCreated)\s*\(/g;
  const matches = [...source.matchAll(declaration)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    blocks.set(match[1], source.slice(match.index ?? 0, matches[index + 1]?.index ?? source.length));
  }
  return blocks;
}

/** Source-only audit. It never reads a project, secret, or Firebase credential. */
export function auditPaystackBindings(sourceByFile) {
  let definitionCount = 0;
  const bindings = [];
  for (const [file, source] of Object.entries(sourceByFile)) {
    if (/\.test\.[cm]?[jt]s$/.test(file)) continue;
    if (/process\.env\.PAYSTACK_SECRET_KEY/.test(source)) {
      throw new Error(`Ambient PAYSTACK_SECRET_KEY access is forbidden: ${file}`);
    }
    if (/defineSecret\(\s*['"]PAYSTACK_SECRET_KEY['"]\s*\)/.test(source)) {
      definitionCount += 1;
      if (!file.endsWith('apps/functions/src/booking/paystack-secret.ts')) {
        throw new Error(`PAYSTACK_SECRET_KEY must be defined in the shared secret module: ${file}`);
      }
    }
    for (const [name, block] of callableBlocks(source)) {
      if (block.includes('paystackSecret')) {
        if (!/secrets\s*:\s*\[\s*paystackSecret\s*\]/.test(block)) {
          throw new Error(`Missing explicit Paystack secret binding: ${file}:${name}`);
        }
        bindings.push(name);
      }
    }
    for (const match of source.matchAll(/new PaystackPaymentAdapter\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      if (!/\bsecretKey\s*:/.test(match[1])) {
        throw new Error(`Paystack adapter call must pass secretKey: ${file}`);
      }
    }
  }
  if (definitionCount !== 1) throw new Error(`Expected one PAYSTACK_SECRET_KEY definition; found ${definitionCount}.`);
  const actual = [...new Set(bindings)].sort();
  const expected = [...PAYSTACK_SECRET_FUNCTIONS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected Paystack secret bindings. Expected ${expected.join(', ')}, found ${actual.join(', ') || '(none)'}.`);
  }
  return actual;
}

async function collectSources(root) {
  const sources = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts')) sources[path] = await readFile(path, 'utf8');
    }
  }
  await visit(join(root, 'apps/functions/src'));
  return sources;
}

export async function runAudit(root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  return auditPaystackBindings(await collectSources(root));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAudit().then(() => console.log('Paystack source audit passed.')).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Paystack source audit failed.');
    process.exitCode = 1;
  });
}
