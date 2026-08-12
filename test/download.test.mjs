import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { assetsUrl, imageHome, javaExecutable, pickBinary, platformSelectors } from '../src/download.js';

describe('platformSelectors', () => {
  it('names the platforms Adoptium publishes for', () => {
    assert.deepEqual(platformSelectors('darwin', 'arm64'), { os: 'mac', architecture: 'aarch64' });
    assert.deepEqual(platformSelectors('linux', 'x64'), { os: 'linux', architecture: 'x64' });
    assert.deepEqual(platformSelectors('win32', 'x64'), { os: 'windows', architecture: 'x64' });
  });

  it('is null for a platform with no build', () => {
    assert.equal(platformSelectors('freebsd', 'x64'), null);
    assert.equal(platformSelectors('linux', 'mips'), null);
  });
});

describe('assetsUrl', () => {
  it('asks for one image type of one platform', () => {
    const url = new URL(assetsUrl({ major: 25, os: 'mac', architecture: 'aarch64', imageType: 'jre' }));
    assert.equal(url.pathname, '/v3/assets/latest/25/hotspot');
    assert.equal(url.searchParams.get('os'), 'mac');
    assert.equal(url.searchParams.get('architecture'), 'aarch64');
    assert.equal(url.searchParams.get('image_type'), 'jre');
    assert.equal(url.searchParams.get('vendor'), 'eclipse');
  });
});

describe('pickBinary', () => {
  it('takes the link, checksum, and name of the first asset', () => {
    const assets = [{ binary: { package: { link: 'https://x/y.tar.gz', checksum: 'abc', name: 'y.tar.gz' } } }];
    assert.deepEqual(pickBinary(assets), { link: 'https://x/y.tar.gz', checksum: 'abc', name: 'y.tar.gz' });
  });

  it('is null when the platform has no such image', () => {
    assert.equal(pickBinary([]), null);
    assert.equal(pickBinary(undefined), null);
    assert.equal(pickBinary([{ binary: {} }]), null);
  });
});

describe('javaExecutable', () => {
  it('is java.exe on Windows and java elsewhere', () => {
    assert.match(javaExecutable('/opt/jre', 'linux'), /jre[/\\]bin[/\\]java$/);
    assert.match(javaExecutable('C:\\jre', 'windows'), /bin[/\\]java\.exe$/);
  });
});

describe('imageHome', () => {
  it('finds the single directory an archive unpacks into', async () => {
    const unpacked = await mkdtemp(join(tmpdir(), 'souther-jre-'));
    await mkdir(join(unpacked, 'jdk-25.0.1+9-jre'));
    assert.equal(await imageHome(unpacked, 'linux'), join(unpacked, 'jdk-25.0.1+9-jre'));
  });

  it('descends into Contents/Home on macOS', async () => {
    const unpacked = await mkdtemp(join(tmpdir(), 'souther-jre-'));
    await mkdir(join(unpacked, 'jdk-25.0.1+9-jre', 'Contents', 'Home'), { recursive: true });
    assert.equal(await imageHome(unpacked, 'mac'),
      join(unpacked, 'jdk-25.0.1+9-jre', 'Contents', 'Home'));
  });

  it('refuses an archive that did not unpack into one directory', async () => {
    const unpacked = await mkdtemp(join(tmpdir(), 'souther-jre-'));
    await mkdir(join(unpacked, 'one'));
    await mkdir(join(unpacked, 'two'));
    await assert.rejects(() => imageHome(unpacked, 'linux'), /found 2/);
  });
});
