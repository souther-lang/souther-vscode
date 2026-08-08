// Deciding which `java` runs the language server. This module deliberately does not import the
// vscode API: it takes the candidate paths and a way to run a command, and returns a decision, so
// the resolution order is testable without an editor.

'use strict';

const { execFile } = require('child_process');

/** The server jar is built with `maven.compiler.release=25`, so an older runtime cannot load it. */
const REQUIRED_MAJOR = 25;

/**
 * The major version out of `java -XshowSettings:properties -version`. Reading the property is
 * steadier than parsing the `java version "..."` banner, whose shape has changed across releases.
 * Returns null when the output has no such property.
 */
function parseSpecificationVersion(output) {
  const match = /^\s*java\.specification\.version\s*=\s*(\S+)/m.exec(output ?? '');
  if (!match) {
    return null;
  }
  // Old runtimes report 1.8 rather than 8; everything from 9 on reports the major alone.
  const parts = match[1].split('.');
  const major = Number(parts[0] === '1' ? parts[1] : parts[0]);
  return Number.isInteger(major) ? major : null;
}

/** Runs a command and hands back stdout and stderr joined, whatever the exit status. */
function runCommand(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({ failed: Boolean(error), output: `${stdout ?? ''}${stderr ?? ''}` });
    });
  });
}

/** The major version of the runtime at `javaPath`, or null when it cannot be run or read. */
async function probeJava(javaPath, run = runCommand) {
  if (!javaPath) {
    return null;
  }
  const { failed, output } = await run(javaPath, ['-XshowSettings:properties', '-version']);
  // `-version` exits 0 on every supported runtime; a failure means the path is not a java at all.
  return failed ? null : parseSpecificationVersion(output);
}

/**
 * Picks the runtime to launch the server with.
 *
 * `configured` is the user's `souther.server.java`. It is never silently passed over: when it is set
 * but too old, the answer says so rather than falling through to another runtime, because quietly
 * running a different java than the one that was asked for is worse than stopping.
 *
 * The rest are tried in order — a runtime this extension downloaded earlier, JAVA_HOME, then the
 * PATH — and the first one new enough wins.
 */
async function resolveJava(sources, probe = probeJava) {
  const { configured, managed, javaHome, pathJava = 'java' } = sources;

  if (configured) {
    const major = await probe(configured);
    if (major === null) {
      return { kind: 'configured-unusable', path: configured };
    }
    if (major < REQUIRED_MAJOR) {
      return { kind: 'configured-too-old', path: configured, major };
    }
    return { kind: 'ok', path: configured, origin: 'setting', major };
  }

  const tried = [];
  for (const [origin, path] of [['managed', managed], ['java-home', javaHome], ['path', pathJava]]) {
    if (!path) {
      continue;
    }
    const major = await probe(path);
    if (major !== null && major >= REQUIRED_MAJOR) {
      return { kind: 'ok', path, origin, major };
    }
    tried.push({ origin, path, major });
  }
  return { kind: 'not-found', tried };
}

module.exports = { REQUIRED_MAJOR, parseSpecificationVersion, probeJava, resolveJava, runCommand };
