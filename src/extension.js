// The VS Code client for the Souther language server. It settles which java to run, downloading a
// runtime when the machine has none new enough, then launches the bundled jar over stdio; all
// language features come from the server.

'use strict';

const fs = require('fs');
const path = require('path');
const { ProgressLocation, commands, window, workspace } = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

const { initializationOptions } = require('./adequacy');
const { REQUIRED_MAJOR, resolveJava } = require('./java');
const { downloadJre, javaExecutable, managedJava, platformSelectors } = require('./download');
const { Status } = require('./status');

let client;
let status;

async function activate(context) {
  status = new Status();
  context.subscriptions.push(
    status,
    commands.registerCommand('souther.showOutput', () => status.show()),
    commands.registerCommand('souther.restartServer', () => restart(context)),
    // The measurement level is part of the handshake, so a running server cannot be told about a
    // new one. Restarting is what makes the setting take effect.
    workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration('souther.adequacy')) {
        restart(context);
      }
    }),
  );
  await start(context);
}

async function start(context) {
  status.starting();

  const jar = serverJar(context);
  if (!fs.existsSync(jar)) {
    fail(`the language server jar is missing (${jar})`);
    return;
  }

  const java = await settleJava(context);
  if (!java) {
    return;
  }

  const run = { command: java.path, args: ['-jar', jar], transport: TransportKind.stdio };
  client = new LanguageClient('souther', 'Souther Language Server', { run, debug: run }, {
    documentSelector: [{ scheme: 'file', language: 'souther' }],
    synchronize: { fileEvents: workspace.createFileSystemWatcher('**/*.sou') },
    initializationOptions: initializationOptions(
      workspace.getConfiguration('souther').get('adequacy')),
    outputChannel: status.channel,
  });

  try {
    await client.start();
    status.ready(`Java ${java.major ?? REQUIRED_MAJOR} at ${java.path}`);
  } catch (error) {
    client = undefined;
    fail(`the language server did not start: ${error.message}`);
  }
}

/** The jar to run: the user's `souther.server.jar` when set, otherwise the bundled one. */
function serverJar(context) {
  const configured = workspace.getConfiguration('souther').get('server.jar');
  return configured && configured.length > 0
    ? configured
    : context.asAbsolutePath(path.join('server', 'souther-lsp.jar'));
}

/**
 * The java to launch with. An explicit `souther.server.java` that cannot run the server is reported
 * rather than passed over — silently running some other runtime would hide the misconfiguration.
 * When nothing on the machine fits, the user is offered a download.
 */
async function settleJava(context) {
  const storage = context.globalStorageUri.fsPath;
  fs.mkdirSync(storage, { recursive: true });
  const os = platformSelectors(process.platform, process.arch)?.os;

  const configured = workspace.getConfiguration('souther').get('server.java');
  const resolution = await resolveJava({
    configured: configured && configured.length > 0 ? configured : undefined,
    managed: managedJava(storage, REQUIRED_MAJOR, process.platform),
    javaHome: process.env.JAVA_HOME ? javaExecutable(process.env.JAVA_HOME, os) : undefined,
  });

  switch (resolution.kind) {
    case 'ok':
      status.log(`Using the Java ${resolution.major} at ${resolution.path} (${resolution.origin})`);
      return resolution;
    case 'configured-unusable':
      fail(`souther.server.java points at ${resolution.path}, which does not run`);
      return null;
    case 'configured-too-old':
      fail(`souther.server.java points at Java ${resolution.major}; the server needs ${REQUIRED_MAJOR}`);
      return null;
    default:
      for (const candidate of resolution.tried) {
        status.log(candidate.major === null
          ? `No java at ${candidate.path} (${candidate.origin})`
          : `Java ${candidate.major} at ${candidate.path} (${candidate.origin}) is too old`);
      }
      return offerDownload(storage);
  }
}

async function offerDownload(storage) {
  const answer = await window.showInformationMessage(
    `Souther needs Java ${REQUIRED_MAJOR} to run its language server. Download one now?`,
    'Download', 'Not now');
  if (answer !== 'Download') {
    fail(`no Java ${REQUIRED_MAJOR} was found`);
    explainManualSetup();
    return null;
  }

  return window.withProgress(
    { location: ProgressLocation.Notification, title: `Souther: downloading Java ${REQUIRED_MAJOR}` },
    async (progress) => {
      try {
        const javaPath = await downloadJre({
          major: REQUIRED_MAJOR,
          storageDir: storage,
          nodePlatform: process.platform,
          nodeArch: process.arch,
          report: (message) => progress.report({ message }),
        });
        status.log(`Downloaded a Java ${REQUIRED_MAJOR} to ${javaPath}`);
        return { path: javaPath, major: REQUIRED_MAJOR, origin: 'downloaded' };
      } catch (error) {
        fail(`the Java download failed: ${error.message}`);
        explainManualSetup();
        return null;
      }
    });
}

function explainManualSetup() {
  status.log('');
  status.log(`Install a Java ${REQUIRED_MAJOR} runtime yourself and the extension will find it:`);
  status.log(`  https://adoptium.net/temurin/releases/?version=${REQUIRED_MAJOR}`);
  status.log('Put it on the PATH or in JAVA_HOME, or point souther.server.java at its java');
  status.log('executable. Then run "Souther: Restart Language Server".');
}

function fail(reason) {
  status.failed(reason);
  window.showErrorMessage(`Souther: ${reason}`, 'Show output').then((answer) => {
    if (answer) {
      status.show();
    }
  });
}

async function restart(context) {
  if (client) {
    await client.stop();
    client = undefined;
  }
  await start(context);
}

async function deactivate() {
  if (client) {
    await client.stop();
    client = undefined;
  }
}

module.exports = { activate, deactivate };
