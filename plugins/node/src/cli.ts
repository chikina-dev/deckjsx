#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createIncrementalArtifactSession,
  type IncrementalArtifactSession,
  type IncrementalArtifactWriteRecord,
} from "deckjsx/integration";
import type { DeckjsxDevCompiler } from "./dev-compiler";
import { createDevModuleGraphSnapshot } from "./dev-module-graph";
import { cliUsageDiagnostic } from "./dev-diagnostics";
import { createInteractiveDevSession, type InteractiveDevSession } from "./interactive/session";
import { runInteractiveDevCommandLoop } from "./interactive/repl";
import {
  classifyDevWrites,
  devOutputIgnoreFiles,
  type DeckjsxDevDiagnostic,
} from "./tracked-output-coordinator";

export type DeckjsxNodeCliDiagnostic = DeckjsxDevDiagnostic;

export type DeckjsxNodeCliDetail = "details" | "summary";

export type DeckjsxNodeCliParseResult =
  | {
      readonly ok: true;
      readonly command: "dev";
      readonly entry: string;
      readonly out: string;
      readonly outputs: readonly string[];
      readonly detail: DeckjsxNodeCliDetail;
      readonly interactive: boolean;
    }
  | {
      readonly ok: false;
      readonly detail: DeckjsxNodeCliDetail;
      readonly diagnostics: readonly DeckjsxNodeCliDiagnostic[];
    };

export type DeckjsxDevCycleResult = {
  readonly ok: boolean;
  readonly watchFiles: readonly string[];
  readonly writes: readonly {
    readonly path: string;
    readonly tracked: boolean;
    readonly result: object;
  }[];
  readonly diagnostics: readonly DeckjsxNodeCliDiagnostic[];
};

export type DeckjsxDevWriteRecord = {
  readonly path: string;
  readonly tracked: boolean;
  readonly result: object;
};

export type DeckjsxDevOptions = {
  readonly entry: string;
  readonly cwd?: string;
  readonly out: string;
  readonly outputs?: readonly string[];
  readonly detail: DeckjsxNodeCliDetail;
  readonly interactive?: boolean;
};

export function parseDeckjsxNodeCliArgs(args: readonly string[]): DeckjsxNodeCliParseResult {
  const detail: DeckjsxNodeCliDetail =
    args.includes("--short") || args.includes("-s") ? "summary" : "details";
  const interactive = args.includes("--interactive");
  const [command, entry, ...rest] = args.filter(
    (arg) => arg !== "--short" && arg !== "-s" && arg !== "--interactive",
  );
  if (command !== "dev") {
    return {
      ok: false,
      detail,
      diagnostics: [
        cliUsageDiagnostic({
          code: "deckjsx.node.cli.unknownCommand",
          title: "Usage: deckjsx dev <entry> --out <path> [output paths...]",
        }),
      ],
    };
  }
  if (!entry) {
    return {
      ok: false,
      detail,
      diagnostics: [
        cliUsageDiagnostic({
          code: "deckjsx.node.cli.missingEntry",
          title: "deckjsx dev requires an entry module.",
        }),
      ],
    };
  }

  const outIndex = rest.indexOf("--out");
  const out = outIndex >= 0 ? rest[outIndex + 1] : undefined;
  if (!out) {
    return {
      ok: false,
      detail,
      diagnostics: [
        cliUsageDiagnostic({
          code: "deckjsx.node.cli.missingOut",
          title: "deckjsx dev requires --out <path>.",
        }),
      ],
    };
  }

  const beforeOut = rest.slice(0, outIndex);
  const afterOut = rest.slice(outIndex + 2);
  const outputs = [...new Set([out, ...beforeOut, ...afterOut])];
  return {
    ok: true,
    command: "dev",
    entry,
    out,
    outputs,
    detail,
    interactive,
  };
}

export function devWriteRecords(input: {
  readonly cwd: string;
  readonly out: string;
  readonly writes: readonly IncrementalArtifactWriteRecord[];
}): readonly DeckjsxDevWriteRecord[] {
  return classifyDevWrites(input).records;
}

export async function runDeckjsxDev(input: DeckjsxDevOptions): Promise<never> {
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  const { createDeckjsxDevCompiler } = await import("./dev-compiler");
  const artifactSession = createIncrementalArtifactSession();
  await runDeckjsxDevCompilerHost({
    compiler: createDeckjsxDevCompiler({
      entry: input.entry,
      cwd,
      out: input.out,
      outputs: input.outputs,
      session: artifactSession,
    }),
    detail: input.detail,
    interactive: input.interactive,
    artifactSession,
  });
  return new Promise<never>(() => {
    // Resident dev process. The compiler wakes through Rolldown watch events.
  });
}

export async function runDeckjsxDevCompilerHost(input: {
  readonly compiler: DeckjsxDevCompiler;
  readonly detail: DeckjsxNodeCliDetail;
  readonly interactive?: boolean;
  readonly maxCompilations?: number;
  readonly writeLine?: (line: string) => void;
  readonly createInteractiveSession?: (input: {
    readonly compiler: DeckjsxDevCompiler;
    readonly artifactSession?: IncrementalArtifactSession;
  }) => InteractiveDevSession;
  readonly artifactSession?: IncrementalArtifactSession;
  readonly interactiveLines?: AsyncIterable<string>;
  readonly interactiveWriteLine?: (line: string) => void;
}): Promise<void> {
  const writeLine = input.writeLine ?? ((line: string) => console.error(line));
  const unsubscribe = input.compiler.on((event) => {
    if (event.type === "diagnostic") {
      formatDeckjsxNodeDiagnostics([event.diagnostic], input.detail).forEach(writeLine);
    }
  });
  const interactiveSession = input.interactive
    ? (input.createInteractiveSession ?? createInteractiveDevSession)({
        compiler: input.compiler,
        artifactSession: input.artifactSession,
      })
    : undefined;
  const stdinLines = interactiveSession && !input.interactiveLines ? createStdinLines() : undefined;
  const startInteractiveLoop = () =>
    interactiveSession
      ? runInteractiveDevCommandLoop({
          session: interactiveSession,
          lines: input.interactiveLines ?? stdinLines?.lines ?? emptyInteractiveLines(),
          writeLine: input.interactiveWriteLine ?? ((line) => console.log(line)),
        })
      : undefined;
  input.compiler.start();
  let completed = 0;
  try {
    const compilationLoop = async () => {
      while (input.maxCompilations === undefined || completed < input.maxCompilations) {
        await input.compiler.runNextCompilation();
        completed += 1;
      }
    };
    if (interactiveSession && input.maxCompilations === undefined) {
      await Promise.race([compilationLoop(), startInteractiveLoop()]);
    } else {
      await compilationLoop();
      if (input.interactiveLines) {
        await startInteractiveLoop();
      }
    }
  } finally {
    unsubscribe();
    interactiveSession?.close();
    stdinLines?.close();
    await input.compiler.close();
  }
}

function createStdinLines(): {
  readonly lines: AsyncIterable<string>;
  close(): void;
} {
  const terminal = createInterface({
    input: process.stdin,
    terminal: false,
  });
  return {
    lines: terminal,
    close() {
      terminal.close();
    },
  };
}

async function* emptyInteractiveLines(): AsyncIterable<string> {}

export function devWatchFiles(input: {
  readonly cwd: string;
  readonly files: readonly string[];
  readonly outputs: readonly string[];
}): readonly string[] {
  const cwd = path.resolve(input.cwd);
  return createDevModuleGraphSnapshot({
    cwd,
    moduleIds: [],
    watchFiles: input.files,
    observedAssetFiles: [],
    ignoredFiles: devOutputIgnoreFiles({
      cwd,
      out: input.outputs[0] ?? "",
      outputs: input.outputs,
    }),
  }).files;
}

export function formatDeckjsxNodeDiagnostics(
  diagnostics: readonly DeckjsxNodeCliDiagnostic[],
  detail: DeckjsxNodeCliDetail,
): readonly string[] {
  if (diagnostics.length === 0) {
    return [];
  }
  if (detail === "summary") {
    return [JSON.stringify(diagnostics.map((item) => item.code))];
  }

  return diagnostics.flatMap((diagnostic) => {
    const lines = [`${diagnostic.severity}[${diagnostic.code}]: ${diagnostic.title}`];
    if (diagnostic.message) {
      lines.push(`  ${diagnostic.message}`);
    }
    if (diagnostic.primary) {
      lines.push(
        `  --> ${diagnostic.primary.file}:${diagnostic.primary.line ?? 1}:${diagnostic.primary.column ?? 1}`,
      );
    }
    const sourceSnippet = formatDiagnosticSourceSnippet(diagnostic);
    if (sourceSnippet) {
      lines.push(...sourceSnippet.lines);
    }
    if (diagnostic.phase) {
      lines.push(`   = phase: ${diagnostic.phase}`);
    }
    if (diagnostic.compilation !== undefined) {
      lines.push(`   = compilation: ${diagnostic.compilation}`);
    }
    const labels = sourceSnippet?.consumedLabel
      ? (diagnostic.labels ?? []).slice(1)
      : (diagnostic.labels ?? []);
    for (const label of labels) {
      if (label.span) {
        lines.push(`  --> ${label.span.file}:${label.span.line ?? 1}:${label.span.column ?? 1}`);
      }
      lines.push(`   = label: ${label.message}`);
    }
    for (const note of diagnostic.notes ?? []) {
      lines.push(`   = note: ${note}`);
    }
    for (const help of diagnostic.help ?? []) {
      lines.push(`   = help: ${help}`);
    }
    return lines;
  });
}

function formatDiagnosticSourceSnippet(diagnostic: DeckjsxNodeCliDiagnostic):
  | {
      readonly lines: readonly string[];
      readonly consumedLabel: boolean;
    }
  | undefined {
  if (!diagnostic.primary?.sourceLine) {
    return undefined;
  }

  const line = diagnostic.primary.line ?? 1;
  const column = Math.max(1, diagnostic.primary.column ?? 1);
  const spanLength = Math.max(1, diagnostic.primary.spanLength ?? 1);
  const label = diagnostic.labels?.[0]?.message;
  const lineNumber = String(line);
  const gutter = " ".repeat(lineNumber.length);
  const caret = `${" ".repeat(column - 1)}${"^".repeat(spanLength)}${label ? ` ${label}` : ""}`;
  return {
    lines: [`${lineNumber} | ${diagnostic.primary.sourceLine}`, `${gutter} | ${caret}`],
    consumedLabel: label !== undefined,
  };
}

async function main(): Promise<void> {
  const parsed = parseDeckjsxNodeCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    printDiagnostics(parsed.diagnostics, parsed.detail);
    process.exitCode = 1;
    return;
  }

  await runDeckjsxDev(parsed);
}

function printDiagnostics(
  diagnostics: readonly DeckjsxNodeCliDiagnostic[],
  detail: DeckjsxNodeCliDetail,
): void {
  formatDeckjsxNodeDiagnostics(diagnostics, detail).forEach((line) => console.error(line));
}

function isDeckjsxNodeCliEntrypoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isDeckjsxNodeCliEntrypoint()) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
