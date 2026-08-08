import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSpecificationVersion, resolveJava } from '../src/java.js';

// `java -XshowSettings:properties -version` prints the properties indented, on stderr.
const settings = (version) => `Property settings:
    java.class.version = 69.0
    java.specification.version = ${version}
    java.vendor = Eclipse Adoptium

openjdk version "${version}" 2026-03-17
`;

describe('parseSpecificationVersion', () => {
  it('reads the major of a modern runtime', () => {
    assert.equal(parseSpecificationVersion(settings('25')), 25);
  });

  it('reads the major out of the old 1.x form', () => {
    assert.equal(parseSpecificationVersion(settings('1.8')), 8);
  });

  it('is null when the property is absent', () => {
    assert.equal(parseSpecificationVersion('command not found'), null);
    assert.equal(parseSpecificationVersion(''), null);
    assert.equal(parseSpecificationVersion(undefined), null);
  });
});

/** A probe that answers from a table of paths, and null for anything else. */
const probing = (versions) => async (path) => versions[path] ?? null;

describe('resolveJava', () => {
  it('takes the first candidate that is new enough', async () => {
    const answer = await resolveJava(
      { managed: '/managed/java', javaHome: '/home/java', pathJava: 'java' },
      probing({ '/managed/java': 25 }));
    assert.deepEqual(answer, { kind: 'ok', path: '/managed/java', origin: 'managed', major: 25 });
  });

  it('passes over candidates that are too old', async () => {
    const answer = await resolveJava(
      { javaHome: '/home/java', pathJava: 'java' },
      probing({ '/home/java': 21, java: 25 }));
    assert.deepEqual(answer, { kind: 'ok', path: 'java', origin: 'path', major: 25 });
  });

  it('reports every candidate it tried when none fits', async () => {
    const answer = await resolveJava(
      { javaHome: '/home/java', pathJava: 'java' },
      probing({ '/home/java': 17 }));
    assert.equal(answer.kind, 'not-found');
    assert.deepEqual(answer.tried, [
      { origin: 'java-home', path: '/home/java', major: 17 },
      { origin: 'path', path: 'java', major: null },
    ]);
  });

  it('uses an explicit setting even when other runtimes are present', async () => {
    const answer = await resolveJava(
      { configured: '/opt/java', managed: '/managed/java' },
      probing({ '/opt/java': 25, '/managed/java': 25 }));
    assert.deepEqual(answer, { kind: 'ok', path: '/opt/java', origin: 'setting', major: 25 });
  });

  it('refuses an explicit setting that is too old rather than falling through', async () => {
    const answer = await resolveJava(
      { configured: '/opt/java', managed: '/managed/java' },
      probing({ '/opt/java': 21, '/managed/java': 25 }));
    assert.deepEqual(answer, { kind: 'configured-too-old', path: '/opt/java', major: 21 });
  });

  it('refuses an explicit setting that does not run', async () => {
    const answer = await resolveJava({ configured: '/opt/java' }, probing({}));
    assert.deepEqual(answer, { kind: 'configured-unusable', path: '/opt/java' });
  });

  it('defaults to the PATH when no candidates are given', async () => {
    const answer = await resolveJava({}, probing({ java: 25 }));
    assert.equal(answer.path, 'java');
    assert.equal(answer.origin, 'path');
  });
});
