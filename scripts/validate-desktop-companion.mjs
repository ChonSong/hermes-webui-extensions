import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('extensions/desktop-companion');

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
}

function assertFile(rel) {
  assert.ok(statSync(path.join(root, rel)).isFile(), `${rel} should exist`);
}

const entry = readJson('extension.json');
const manifest = readJson('manifest.json');
const runtime = manifest.extensions[0];

assert.equal(entry.id, 'desktop-companion');
assert.equal(runtime.id, entry.id);
assert.deepEqual(entry.capabilities, ['manifest-bundle', 'loopback-sidecar']);
assert.ok(!entry.capabilities.includes('sidecar-proxy'));
assert.deepEqual(entry.assets.stylesheets, []);
assert.deepEqual(runtime.stylesheets, []);
assert.equal(entry.permissions.webui_navigation, false);
assert.deepEqual(entry.permissions.dom, {
  owned: false,
  mutates_core_views: false
});

for (const rel of [...entry.assets.scripts, ...entry.assets.stylesheets]) {
  assertFile(rel);
}
for (const rel of [...runtime.scripts, ...runtime.stylesheets]) {
  assertFile(rel);
}

const adapterPath = path.join(root, 'assets/companion-adapter.js');
const check = spawnSync(process.execPath, ['--check', adapterPath], {
  encoding: 'utf8'
});
assert.equal(check.status, 0, check.stderr || check.stdout);

const adapter = readFileSync(adapterPath, 'utf8');
assert.match(adapter, /fetch\('\/api\/sessions'/);
assert.match(adapter, /\/api\/webui\/snapshot/);
assert.match(adapter, /inPagePet:\s*false/);
assert.doesNotMatch(adapter, /document\.createElement/);
assert.doesNotMatch(adapter, /hwc-/);
assert.doesNotMatch(adapter, /spritesheetUrl/);
assert.doesNotMatch(adapter, /\/extensions\/pets\//);

for (const id of ['keeper', 'shiba', 'courier']) {
  const pet = readJson(`pets/${id}/pet.json`);
  assert.equal(pet.id, id);
  assertFile(`pets/${id}/spritesheet.webp`);
  assert.ok(
    statSync(path.join(root, 'pets', id, 'spritesheet.webp')).size > 1024,
    `${id} spritesheet should be present`
  );
}

console.log('desktop-companion validation passed');
