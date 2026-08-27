# Souther for VS Code

Language support for [Souther](https://github.com/souther-lang/souther) (`.sou`): the language server,
syntax highlighting, and the Java runtime the server needs.

Install the extension and open a `.sou` file. Nothing else is required — if the machine has no Java
25, the extension offers to download one and uses it only for Souther. The status bar shows the
server starting and turns into a check when it is ready; clicking it opens the log.

## What you get

Diagnostics, the document outline, hover, go-to-definition, find-references, rename, name
completion, quick-fix code actions, formatting, and semantic tokens. The tokens read the concrete
syntax tree, so a type name and a value are coloured differently even though Souther identifiers are
not capitalised.

The TextMate grammar is generated from the compiler's lexer, so highlighting keeps up with the
language on its own.

### What the rows cover

Turn `souther.adequacy` on and each behavior carries a line saying how much of it the `example` rows
pin down — the same figures `souther examples` reports, where the behavior is being written rather
than in a terminal window. On a behavior the rows fall short of, a code action writes the ones
nothing covers: the block `souther examples --generate --boundaries` prints, put at the end of the
file, commented out, with each answer left as a hole for you to fill in.

It is off by default because of what it costs: the rows are run to find out where they go.

## Settings

| Setting | What it does |
| --- | --- |
| `souther.adequacy` | How much of what the `example` rows cover to measure: `off` (the default), `witness`, or `all`. Off, nothing is measured and neither the lens nor the offer below appears. `witness` reads what the compile already ran; `all` generates a second set of classes and runs every row again, on every change. The server reads this when it starts, so changing it restarts the server. |
| `souther.server.java` | The `java` to launch the server with. Leave empty to use a Java 25 from `JAVA_HOME` or the `PATH`, or one the extension downloaded. When this points at something too old, the extension says so instead of quietly using another runtime. |
| `souther.server.jar` | A different `souther-lsp.jar` — for running a build of the server you made yourself. Defaults to the bundled one. |

Two commands: `Souther: Restart Language Server` and `Souther: Show Output`.

### Where the downloaded runtime goes

Into the extension's global storage, as `jre-25`. It is a Temurin build from
[Adoptium](https://adoptium.net/), verified against the checksum the API reports, and nothing else
on the machine sees it. Deleting the directory makes the extension offer the download again.

If the download cannot go through — a proxy, say — the output channel prints the URL and how to
point `souther.server.java` at a runtime you install yourself.

## Building it

The language server jar and the TextMate grammar are build outputs of the
[compiler repository](https://github.com/souther-lang/souther), so they are not committed here. Fetch
them from the release named by `southerVersion` in `package.json`:

```sh
npm install
npm run fetch      # → server/souther-lsp.jar, syntaxes/souther.tmLanguage.json
npm test
```

Then open this folder in VS Code and press F5 for an Extension Development Host, or
`npx @vscode/vsce package` for a VSIX.

While changing the language and the extension together, build the server from a checkout and copy
from it instead of downloading:

```sh
cd ../souther && mvn -pl souther-lsp -am package
cd ../souther-vscode && SOUTHER_LOCAL=../souther npm run fetch
```

### Layout

- `src/extension.js` — activation, the client, and the wiring
- `src/java.js` — which `java` runs the server. No VS Code API, so the resolution order is testable
- `src/download.js` — the Adoptium query, the download, and unpacking
- `src/status.js` — the status bar item and the output channel
- `scripts/fetch-artifacts.mjs` — puts the jar and the grammar in place

## Releasing

Push a `v*` tag. The workflow fetches the artifacts, packages the VSIX, attaches it to the GitHub
Release, and publishes to Open VSX (with the `OVSX_PAT` secret).

Publishing to the Visual Studio Marketplace is manual: download the `.vsix` from the release and
upload it under the publisher at <https://marketplace.visualstudio.com/manage>. A manual upload
needs neither a Personal Access Token nor an Azure subscription — both are only required for the
`vsce publish` CLI.

## License

EPL-2.0, the same as the language. See [LICENSE](LICENSE).
