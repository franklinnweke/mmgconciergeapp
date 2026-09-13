import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loaderPath = path.resolve(__dirname, '../../../node_modules/firebase-functions/lib/runtime/loader.js');
const manifestPath = path.resolve(__dirname, '../../../node_modules/firebase-functions/lib/runtime/manifest.js');

const { loadStack } = require(loaderPath);
const { stackToWire } = require(manifestPath);

const stack = await loadStack(path.resolve(__dirname, '..'));
const wire = stackToWire(stack);
fs.writeFileSync(path.resolve(__dirname, '../functions.yaml'), JSON.stringify(wire, null, 2));
console.log('Generated functions.yaml manifest successfully, endpoints:', Object.keys(wire.endpoints).length);
