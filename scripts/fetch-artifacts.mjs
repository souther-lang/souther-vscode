// Puts the two build outputs this extension ships around into place: the language server jar and
// the TextMate grammar. Both are produced by the compiler repository, so they are not committed
// here — they are downloaded from the release named by `southerVersion` in package.json.
//
// Set SOUTHER_LOCAL to a checkout of the compiler repository to copy from its build outputs
// instead, which is what you want while changing the language and the extension together:
//
//   cd ../souther && mvn -pl souther-lsp -am package
//   cd ../souther-vscode && SOUTHER_LOCAL=../souther npm run fetch

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const repository = process.env.SOUTHER_REPO ?? 'souther-lang/souther';
const { southerVersion } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

/**
 * Each artifact: where the release puts it, where a local checkout is expected to put it, and where
 * it goes here. The local path is a hint, not a requirement — see `locate`.
 */
const ARTIFACTS = [
  {
    asset: 'souther-lsp.jar',
    local: 'souther-lsp/target/souther-lsp.jar',
    into: 'server/souther-lsp.jar',
  },
  {
    asset: 'souther.tmLanguage.json',
    local: 'souther-compiler/src/main/resources/souther/compiler/highlight/souther.tmLanguage.json',
    into: 'syntaxes/souther.tmLanguage.json',
  },
];

/** Directories a search never descends into. */
const SKIPPED = new Set(['.git', '.github', 'node_modules']);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Every path under `dir` whose file name is `name`. */
async function walk(dir, name, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) await walk(path, name, found);
    } else if (entry.name === name) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Where `artifact` actually is in `checkout`. The hinted path is tried first, and the checkout is
 * searched for the asset's name only when it is not there. Which package a resource sits in is the
 * compiler repository's business, so a move over there is not a reason for this to stop working.
 */
async function locate(checkout, artifact) {
  const hinted = resolve(checkout, artifact.local);
  if (await exists(hinted)) return hinted;

  // A build copies resources into target/, so prefer a hit that is the source rather than a copy of
  // it, which may be older than what is on disk now.
  const found = await walk(checkout, artifact.asset);
  const source = found.find((path) => !path.includes(`${sep}target${sep}`)) ?? found[0];
  if (!source) {
    throw new Error(`no ${artifact.asset} anywhere under ${checkout} (nor at ${artifact.local})`);
  }
  return source;
}

async function fromLocal(checkout) {
  for (const artifact of ARTIFACTS) {
    const source = await locate(checkout, artifact);
    const target = join(root, artifact.into);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    console.log(`${artifact.into} <- ${source}`);
  }
}

async function fromRelease() {
  if (!southerVersion) {
    throw new Error('package.json has no southerVersion to fetch');
  }
  const base = `https://github.com/${repository}/releases/download/v${southerVersion}`;
  for (const artifact of ARTIFACTS) {
    const url = `${base}/${artifact.asset}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    const target = join(root, artifact.into);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log(`${artifact.into} <- ${url}`);
  }
}

const checkout = process.env.SOUTHER_LOCAL;
if (checkout) {
  await fromLocal(checkout);
} else {
  await fromRelease();
}
