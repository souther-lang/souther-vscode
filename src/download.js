// Fetching a Java runtime from Adoptium when the machine has none new enough. Only the pieces that
// touch the network or the disk are async; the URL and path decisions are plain functions so they
// can be tested.

'use strict';

const { createHash } = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const API = 'https://api.adoptium.net/v3';

/** Adoptium's names for this machine, or null when it publishes nothing for it. */
function platformSelectors(nodePlatform, nodeArch) {
  const os = { darwin: 'mac', linux: 'linux', win32: 'windows' }[nodePlatform];
  const architecture = { x64: 'x64', arm64: 'aarch64', ppc64: 'ppc64le', s390x: 's390x' }[nodeArch];
  return os && architecture ? { os, architecture } : null;
}

/** The query for the newest GA build of one image type on one platform. */
function assetsUrl({ major, os, architecture, imageType }) {
  const query = new URLSearchParams({
    os,
    architecture,
    image_type: imageType,
    jvm_impl: 'hotspot',
    vendor: 'eclipse',
  });
  return `${API}/assets/latest/${major}/hotspot?${query}`;
}

/** The download link, checksum, and file name out of an assets response, or null when it is empty. */
function pickBinary(assets) {
  const pkg = assets?.[0]?.binary?.package;
  return pkg?.link ? { link: pkg.link, checksum: pkg.checksum, name: pkg.name } : null;
}

/** Where the `java` executable sits inside an unpacked image. */
function javaExecutable(home, os) {
  return path.join(home, 'bin', os === 'windows' ? 'java.exe' : 'java');
}

/**
 * The image root inside an unpacked archive. Temurin archives hold a single top-level directory,
 * and on macOS the runtime lives under `Contents/Home` of it.
 */
async function imageHome(unpackedDir, os) {
  const entries = await fsp.readdir(unpackedDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1) {
    throw new Error(`expected one directory in ${unpackedDir}, found ${directories.length}`);
  }
  const root = path.join(unpackedDir, directories[0].name);
  if (os !== 'mac') {
    return root;
  }
  const macHome = path.join(root, 'Contents', 'Home');
  return fs.existsSync(macHome) ? macHome : root;
}

function unpack(archive, into, os) {
  const [command, args] = os === 'windows'
    ? ['powershell', ['-NoProfile', '-Command',
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${into}' -Force`]]
    : ['tar', ['-xzf', archive, '-C', into]];
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(error) : resolve()));
  });
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/**
 * Downloads a runtime of `major` into `storageDir` and returns the path of its `java`. A JRE is
 * asked for first and a JDK taken when the platform has no JRE image; both can run the server.
 */
async function downloadJre({ major, storageDir, nodePlatform, nodeArch, report = () => {} }) {
  const selectors = platformSelectors(nodePlatform, nodeArch);
  if (!selectors) {
    throw new Error(`Adoptium publishes no build for ${nodePlatform}/${nodeArch}`);
  }

  let binary = null;
  for (const imageType of ['jre', 'jdk']) {
    const url = assetsUrl({ major, ...selectors, imageType });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    binary = pickBinary(await response.json());
    if (binary) {
      break;
    }
  }
  if (!binary) {
    throw new Error(`Adoptium has no Java ${major} build for ${selectors.os}/${selectors.architecture}`);
  }

  const work = path.join(storageDir, `jre-${major}-download`);
  await fsp.rm(work, { recursive: true, force: true });
  await fsp.mkdir(work, { recursive: true });
  const archive = path.join(work, binary.name);

  report(`Downloading ${binary.name}`);
  const download = await fetch(binary.link);
  if (!download.ok) {
    throw new Error(`${binary.link} returned ${download.status}`);
  }
  await fsp.writeFile(archive, Buffer.from(await download.arrayBuffer()));

  if (binary.checksum) {
    report('Verifying the download');
    const actual = await sha256(archive);
    if (actual !== binary.checksum) {
      throw new Error(`checksum mismatch for ${binary.name}: expected ${binary.checksum}, got ${actual}`);
    }
  }

  report('Unpacking');
  const unpacked = path.join(work, 'unpacked');
  await fsp.mkdir(unpacked, { recursive: true });
  await unpack(archive, unpacked, selectors.os);

  const home = await imageHome(unpacked, selectors.os);
  const destination = path.join(storageDir, `jre-${major}`);
  await fsp.rm(destination, { recursive: true, force: true });
  await fsp.rename(home, destination);
  await fsp.rm(work, { recursive: true, force: true });

  return javaExecutable(destination, selectors.os);
}

/** The `java` of a runtime downloaded earlier, or null when there is none. */
function managedJava(storageDir, major, nodePlatform) {
  const selectors = platformSelectors(nodePlatform, process.arch);
  const candidate = javaExecutable(path.join(storageDir, `jre-${major}`), selectors?.os);
  return fs.existsSync(candidate) ? candidate : null;
}

module.exports = {
  API,
  assetsUrl,
  downloadJre,
  imageHome,
  javaExecutable,
  managedJava,
  pickBinary,
  platformSelectors,
};
