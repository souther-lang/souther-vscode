// Puts the two build outputs this extension ships around into place: the language server jar and
// the TextMate grammar. Both are produced by the compiler repository, so they are not committed
// here — they are downloaded from the release named by `southerVersion` in package.json.
//
// Set SOUTHER_LOCAL to a checkout of the compiler repository to copy from its build outputs
// instead, which is what you want while changing the language and the extension together:
//
//   cd ../souther && mvn -pl souther-lsp -am package
//   cd ../souther-vscode && SOUTHER_LOCAL=../souther npm run fetch

import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const repository = process.env.SOUTHER_REPO ?? 'souther-lang/souther';
const { southerVersion } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

/** Each artifact: where the release puts it, where a local checkout puts it, and where it goes. */
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

async function fromLocal(checkout) {
  for (const artifact of ARTIFACTS) {
    const source = resolve(checkout, artifact.local);
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
