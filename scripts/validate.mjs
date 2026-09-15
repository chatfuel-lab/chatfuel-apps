// Validates every apps/*/app.json against app.schema.json plus the semantic
// rules ajv cannot express: id/dirname agreement, referenced files existing,
// overlay hygiene (the same deny list the wizard enforces at scaffold time),
// and size caps. CI runs this on every push; a violation is an exit code, not
// a warning.
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const appsDir = join(root, 'apps');

// Wizard-owned files an overlay may never replace. Must match OVERLAY_DENY and
// OVERLAY_DENY_PREFIXES in
// https://github.com/chatfuel-lab/wizard/blob/main/packages/wizard/src/scaffold/appOverlay.ts
// — the wizard enforces the same list at scaffold time; this copy fails the PR earlier.
// The reasoning behind each entry lives next to the wizard's copy.
const OVERLAY_DENY = [
  // What the scaffold's own transforms write.
  'package.json',
  '.gitignore',
  '_gitignore',
  'index.html',
  // Every config file vite resolves, not just the one the template ships.
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.server.config.ts',
  'tsconfig.json',
  'server/entry.ts',
  'api/chatfuel.ts',
  'src/index.css',
  'src/modules/index.ts',
  'src/modules/navGroups.tsx',
  // Package manager instructions: the install runs right after the overlay lands.
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.pnpmfile.cjs',
  'pnpm-workspace.yaml',
  '.node-version',
  '.nvmrc',
  // Lockfiles decide which bytes the install resolves to; the scaffold ships none.
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  // Scripts the wizard and the playbook run with the token already in .env.
  'scripts/deploy-vercel.mjs',
  'scripts/connect-git.mjs',
  'scripts/codegen.mjs',
];
const OVERLAY_DENY_PREFIXES = ['.env', 'node_modules/', '.git/', 'patches/', 'scripts/deploy/'];

// Case-insensitive, like the wizard: on macOS and Windows `.NPMRC` lands on `.npmrc`.
const DENIED = new Set(OVERLAY_DENY.map((name) => name.toLowerCase()));
const overlayDenies = (rel) => {
  const name = rel.toLowerCase();
  if (DENIED.has(name)) return true;
  return OVERLAY_DENY_PREFIXES.some(
    (prefix) => name === prefix.replace(/\/$/, '') || name.startsWith(prefix.toLowerCase()),
  );
};

const SCREENSHOT_MAX_BYTES = 1024 * 1024;
const OVERLAY_MAX_BYTES = 2 * 1024 * 1024;

const schema = JSON.parse(readFileSync(join(root, 'app.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(schema);

const errors = [];
const fail = (app, message) => errors.push(`apps/${app}: ${message}`);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const slugs = readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const seenIds = new Set();

for (const slug of slugs) {
  const appDir = join(appsDir, slug);
  const manifestPath = join(appDir, 'app.json');
  if (!existsSync(manifestPath)) {
    fail(slug, 'app.json is missing');
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(slug, `app.json is not valid JSON: ${err.message}`);
    continue;
  }

  if (!validateSchema(manifest)) {
    for (const e of validateSchema.errors) fail(slug, `app.json${e.instancePath} ${e.message}`);
    continue;
  }

  if (manifest.id !== slug) fail(slug, `id "${manifest.id}" must equal the directory name`);
  if (seenIds.has(manifest.id)) fail(slug, `duplicate id "${manifest.id}"`);
  seenIds.add(manifest.id);

  // Every referenced file resolves to a real file inside the app directory.
  const inAppFile = (rel, label) => {
    const abs = resolve(appDir, rel);
    if (!abs.startsWith(appDir + sep)) {
      fail(slug, `${label} "${rel}" escapes the app directory`);
      return null;
    }
    if (!existsSync(abs) || !lstatSync(abs).isFile()) {
      fail(slug, `${label} "${rel}" does not exist`);
      return null;
    }
    return abs;
  };

  inAppFile(manifest.playbook ?? 'playbook.md', 'playbook');
  inAppFile('listing.md', 'listing.md');
  if (manifest.brand.logo) inAppFile(manifest.brand.logo, 'brand.logo');

  const icon = inAppFile(manifest.listing.icon, 'listing.icon');
  if (icon && extname(icon) !== '.png') fail(slug, `listing.icon must be a PNG`);

  for (const shot of manifest.listing.screenshots) {
    const abs = inAppFile(shot.file, 'screenshot');
    if (!abs) continue;
    if (extname(abs) !== '.png') fail(slug, `screenshot "${shot.file}" must be a PNG`);
    const size = lstatSync(abs).size;
    if (size > SCREENSHOT_MAX_BYTES)
      fail(slug, `screenshot "${shot.file}" is ${size} bytes (max ${SCREENSHOT_MAX_BYTES})`);
  }

  // Overlay hygiene: no symlinks, no wizard-owned paths, bounded total size.
  const overlayDir = join(appDir, 'overlay');
  if (existsSync(overlayDir)) {
    let total = 0;
    for (const path of walk(overlayDir)) {
      const rel = relative(overlayDir, path).split(sep).join('/');
      if (lstatSync(path).isSymbolicLink()) {
        fail(slug, `overlay/${rel} is a symlink; overlays must contain regular files only`);
        continue;
      }
      if (overlayDenies(rel)) {
        fail(slug, `overlay/${rel} replaces a wizard-owned file; change it via the playbook instead`);
      }
      total += lstatSync(path).size;
    }
    if (total > OVERLAY_MAX_BYTES)
      fail(slug, `overlay totals ${total} bytes (max ${OVERLAY_MAX_BYTES}); a preset is an overlay, not a fork`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} problem(s) across ${slugs.length} app(s).`);
  process.exit(1);
}
console.log(`✓ ${slugs.length} app(s) valid: ${slugs.join(', ')}`);
