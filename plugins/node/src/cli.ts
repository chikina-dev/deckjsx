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
import { createDevConsoleCoordinator } from "./dev-console/coordinator";
import {
  formatDeckjsxDevConsoleEvent,
  formatDeckjsxDevHelp,
  formatDeckjsxInteractiveHelp,
  formatDeckjsxNodeDiagnostics,
  renderInteractiveResponse,
} from "./dev-console/render";
import { normalizeDevConsoleEvent } from "./dev-console/events";
import { createNodeDevInspectionStore, type NodeDevInspectionStore } from "./dev-inspection-store";
import { createInteractiveDevSession, type InteractiveDevSession } from "./interactive/session";
import {
  createInteractiveDiagnosticSnapshot,
  type InteractiveDiagnosticSnapshot,
} from "./interactive/diagnostic-snapshot";
import {
  completeInteractiveInputLine,
  interactivePromptLinesFromKeys,
  runInteractiveDevCommandLoop,
  type InteractiveCompletionContext,
} from "./interactive/repl";
import { createTtyPromptKeySource } from "./interactive/tty-key-source";
import {
  classifyDevWrites,
  devOutputIgnoreFiles,
  type DeckjsxDevDiagnostic,
} from "./tracked-output-coordinator";

export type DeckjsxNodeCliDiagnostic = DeckjsxDevDiagnostic;

export {
  formatDeckjsxDevConsoleEvent,
  formatDeckjsxDevHelp,
  formatDeckjsxInteractiveHelp,
  formatDeckjsxNodeDiagnostics,
  renderInteractiveResponse,
};

export type DeckjsxNodeCliParseResult =
  | {
      readonly ok: true;
      readonly command: "dev";
      readonly entry: string;
      readonly out: string;
      readonly outputs: readonly string[];
      readonly interactive: boolean;
    }
  | {
      readonly ok: true;
      readonly command: "dev.help" | "dev.interactiveHelp";
    }
  | {
      readonly ok: false;
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
  readonly interactive?: boolean;
};

export type DeckjsxCliOutputStream = {
  readonly isTTY?: boolean;
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
  once(event: "drain" | "error", listener: (...args: readonly unknown[]) => void): unknown;
  off(event: "drain" | "error", listener: (...args: readonly unknown[]) => void): unknown;
};

export function parseDeckjsxNodeCliArgs(args: readonly string[]): DeckjsxNodeCliParseResult {
  const [command, ...commandArgs] = args;
  if (command !== "dev") {
    return {
      ok: false,
      diagnostics: [
        cliUsageDiagnostic({
          code: "deckjsx.node.cli.unknownCommand",
          title: "Usage: deckjsx dev <entry> --out <path> [output paths...]",
        }),
      ],
    };
  }

  const unknownOption = commandArgs.find((arg) => arg.startsWith("-") && !isKnownDevOption(arg));
  if (unknownOption) {
    return {
      ok: false,
      diagnostics: [unknownDevOptionDiagnostic(unknownOption)],
    };
  }

  if (commandArgs.includes("--help")) {
    return { ok: true, command: "dev.help" };
  }
  if (commandArgs.includes("--interactive-help")) {
    return { ok: true, command: "dev.interactiveHelp" };
  }

  const interactive = commandArgs.includes("--interactive");
  const rest = commandArgs.filter((arg) => arg !== "--interactive");
  const [entry] = rest;
  if (!entry) {
    return {
      ok: false,
      diagnostics: [
        cliUsageDiagnostic({
          code: "deckjsx.node.cli.missingEntry",
          title: "deckjsx dev requires an entry module.",
        }),
      ],
    };
  }

  const optionTokens = rest.slice(1);
  let out: string | undefined;
  const extraOutputs: string[] = [];
  for (let index = 0; index < optionTokens.length; index += 1) {
    const token = optionTokens[index]!;
    if (token !== "--out") {
      extraOutputs.push(token);
      continue;
    }
    if (out !== undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: "error",
            code: "deckjsx.node.cli.duplicateOut",
            title: "deckjsx dev accepts --out only once.",
            message: "--out",
          },
        ],
      };
    }
    const value = optionTokens[index + 1];
    if (!value || value.startsWith("-")) {
      break;
    }
    out = value;
    index += 1;
  }
  if (!out) {
    return {
      ok: false,
      diagnostics: [
        cliUsageDiagnostic({
          code: "deckjsx.node.cli.missingOut",
          title: "deckjsx dev requires --out <path>.",
        }),
      ],
    };
  }

  const outputs = [...new Set([out, ...extraOutputs])];
  return {
    ok: true,
    command: "dev",
    entry,
    out,
    outputs,
    interactive,
  };
}

function isKnownDevOption(arg: string): boolean {
  return (
    arg === "--out" || arg === "--interactive" || arg === "--help" || arg === "--interactive-help"
  );
}

function unknownDevOptionDiagnostic(option: string): DeckjsxNodeCliDiagnostic {
  const suggestion = closestDevOptionSuggestion(option);
  return {
    severity: "error",
    code: "deckjsx.node.cli.unknownOption",
    title: "Unknown deckjsx dev option.",
    message: option,
    ...(suggestion ? { help: [`Did you mean ${suggestion}?`] } : {}),
  };
}

const KNOWN_DEV_OPTIONS = ["--out", "--interactive", "--help", "--interactive-help"] as const;

function closestDevOptionSuggestion(option: string): string | undefined {
  const candidates = KNOWN_DEV_OPTIONS.map((candidate) => ({
    candidate,
    distance: editDistance(option, candidate),
  })).sort(
    (left, right) =>
      left.distance - right.distance || left.candidate.localeCompare(right.candidate),
  );
  const best = candidates[0];
  return best && best.distance <= Math.max(2, Math.floor(option.length / 3))
    ? best.candidate
    : undefined;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

export function devWriteRecords(input: {
  readonly cwd: string;
  readonly out: string;
  readonly writes: readonly IncrementalArtifactWriteRecord[];
}): readonly DeckjsxDevWriteRecord[] {
  return classifyDevWrites(input).records;
}

export async function runDeckjsxDev(input: DeckjsxDevOptions): Promise<void> {
  const cwd = input.cwd ? path.resolve(input.cwd) : process.cwd();
  const { createDeckjsxDevCompiler } = await import("./dev-compiler");
  const artifactSession = createIncrementalArtifactSession();
  const inspectionStore = createNodeDevInspectionStore();
  await runDeckjsxDevCompilerHost({
    compiler: createDeckjsxDevCompiler({
      entry: input.entry,
      cwd,
      out: input.out,
      outputs: input.outputs,
      session: artifactSession,
      inspectionStore,
    }),
    interactive: input.interactive,
    entry: input.entry,
    cwd,
    artifactSession,
    inspectionStore,
  });
}

export async function runDeckjsxDevCompilerHost(input: {
  readonly compiler: DeckjsxDevCompiler;
  readonly cwd?: string;
  readonly entry?: string;
  readonly interactive?: boolean;
  readonly maxCompilations?: number;
  readonly writeLine?: (line: string) => void;
  readonly createInteractiveSession?: (input: {
    readonly compiler: DeckjsxDevCompiler;
    readonly artifactSession?: IncrementalArtifactSession;
    readonly inspectionStore?: NodeDevInspectionStore;
    readonly diagnostics?: InteractiveDiagnosticSnapshot;
  }) => InteractiveDevSession;
  readonly artifactSession?: IncrementalArtifactSession;
  readonly inspectionStore?: NodeDevInspectionStore;
  readonly interactiveLines?: AsyncIterable<string>;
  readonly interactiveWriteLine?: (line: string) => void;
  readonly outputStream?: DeckjsxCliOutputStream;
}): Promise<void> {
  const customOutputLine = input.writeLine;
  const outputStream = input.outputStream ?? process.stderr;
  const outputQueue = customOutputLine ? undefined : createCliOutputQueue(outputStream);
  const outputLine = customOutputLine ?? outputQueue!.writeLine;
  const colorDevConsole = customOutputLine ? false : Boolean(outputStream.isTTY);
  const formatOptions = { color: colorDevConsole, ...(input.cwd ? { cwd: input.cwd } : {}) };
  const consoleCoordinator = createDevConsoleCoordinator({
    writeLine: outputLine,
    ...(customOutputLine || !outputStream.isTTY ? {} : { writeRaw: outputQueue!.writeRaw }),
  });
  const writeConsoleLines = (lines: readonly string[]) => {
    consoleCoordinator.writeConsole(lines);
  };
  const customInteractiveWriteLine = input.interactiveWriteLine;
  const writeInspectorLine =
    customInteractiveWriteLine ?? ((line: string) => consoleCoordinator.writeInspector([line]));
  const inspectionStore = input.inspectionStore ?? createNodeDevInspectionStore();
  const diagnostics = createInteractiveDiagnosticSnapshot();
  const unsubscribe = input.compiler.on((event) => {
    diagnostics.applyCompilerEvent(event);
    if (event.type === "diagnostic") {
      const consoleEvent = normalizeDevConsoleEvent(event);
      if (consoleEvent) {
        writeConsoleLines(formatDeckjsxDevConsoleEvent(consoleEvent, formatOptions));
      }
    }
  });
  const interactiveSession = input.interactive
    ? (input.createInteractiveSession ?? createInteractiveDevSession)({
        compiler: input.compiler,
        artifactSession: input.artifactSession,
        inspectionStore,
        diagnostics,
      })
    : undefined;
  const stdinLines =
    interactiveSession && !input.interactiveLines
      ? createStdinLines(
          () =>
            completionContextFromInspectionState(
              inspectionStore,
              input.artifactSession,
              diagnostics.current().diagnostics,
            ),
          {
            writeLine: writeInspectorLine,
            writeRender: customInteractiveWriteLine
              ? (lines) => lines.forEach(customInteractiveWriteLine)
              : (lines) => consoleCoordinator.writePromptRender(lines),
            onCommandLine: customInteractiveWriteLine
              ? undefined
              : () => consoleCoordinator.clearPrompt(),
          },
        )
      : undefined;
  const startInteractiveLoop = () =>
    interactiveSession
      ? runInteractiveDevCommandLoop({
          session: interactiveSession,
          lines: input.interactiveLines ?? stdinLines?.lines ?? emptyInteractiveLines(),
          writeLine: writeInspectorLine,
        })
      : undefined;
  input.compiler.start();
  const startedEvent = normalizeDevConsoleEvent({ type: "devStarted", entry: input.entry });
  if (startedEvent) {
    writeConsoleLines(formatDeckjsxDevConsoleEvent(startedEvent, formatOptions));
  }
  let completed = 0;
  let shuttingDown = false;
  try {
    const compilationLoop = async () => {
      while (
        !shuttingDown &&
        (input.maxCompilations === undefined || completed < input.maxCompilations)
      ) {
        const result = await input.compiler.runNextCompilation();
        if (shuttingDown) {
          break;
        }
        diagnostics.applyCompilerEvent({ type: "compilationFinished", result });
        const consoleEvent = normalizeDevConsoleEvent({ type: "compilationFinished", result });
        if (consoleEvent) {
          writeConsoleLines(formatDeckjsxDevConsoleEvent(consoleEvent, formatOptions));
        }
        completed += 1;
      }
    };
    if (interactiveSession && input.maxCompilations === undefined) {
      const compilationTask = compilationLoop().catch((error: unknown) => {
        if (shuttingDown) {
          return;
        }
        throw error;
      });
      await Promise.race([compilationTask, startInteractiveLoop()]);
    } else {
      await compilationLoop();
      if (input.interactiveLines) {
        await startInteractiveLoop();
      }
    }
  } finally {
    shuttingDown = true;
    unsubscribe();
    interactiveSession?.close();
    stdinLines?.close();
    try {
      await input.compiler.close();
    } finally {
      await outputQueue?.flush();
    }
  }
}

function createCliOutputQueue(stream: DeckjsxCliOutputStream): {
  readonly writeLine: (line: string) => void;
  readonly writeRaw: (text: string) => void;
  flush(): Promise<void>;
} {
  let tail = Promise.resolve();
  let failure: unknown;
  const enqueue = (text: string) => {
    tail = tail.then(async () => {
      if (failure !== undefined) {
        return;
      }
      try {
        await writeCliOutputChunk(stream, text);
      } catch (error) {
        failure = error;
      }
    });
  };
  return {
    writeLine(line) {
      enqueue(`${line}\n`);
    },
    writeRaw(text) {
      enqueue(text);
    },
    async flush() {
      await tail;
      if (failure !== undefined) {
        throw failure;
      }
    },
  };
}

function writeCliOutputChunk(stream: DeckjsxCliOutputStream, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let callbackComplete = false;
    let drainComplete = false;
    let settled = false;
    const cleanup = () => {
      stream.off("drain", onDrain);
      stream.off("error", onError);
    };
    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }
      if (error !== undefined) {
        settled = true;
        cleanup();
        reject(error);
        return;
      }
      if (callbackComplete && drainComplete) {
        settled = true;
        cleanup();
        resolve();
      }
    };
    const onDrain = () => {
      drainComplete = true;
      finish();
    };
    const onError = (error: unknown) => finish(error);
    stream.once("drain", onDrain);
    stream.once("error", onError);
    try {
      const accepted = stream.write(chunk, (error) => {
        if (error) {
          finish(error);
          return;
        }
        callbackComplete = true;
        finish();
      });
      if (accepted) {
        drainComplete = true;
        stream.off("drain", onDrain);
        finish();
      }
    } catch (error) {
      finish(error);
    }
  });
}

function createStdinLines(
  completionContext: () => InteractiveCompletionContext,
  writer: {
    readonly writeLine: (line: string) => void;
    readonly writeRender?: (lines: readonly string[]) => void;
    readonly onCommandLine?: (line: string) => void;
  },
): {
  readonly lines: AsyncIterable<string>;
  close(): void;
} {
  if (process.stdin.isTTY) {
    return createTtyStdinLines(completionContext, writer);
  }
  const terminal = createInterface({
    input: process.stdin,
    terminal: process.stdin.isTTY,
    completer(line: string) {
      return [completeInteractiveInputLine(line, completionContext()), line];
    },
  });
  return {
    lines: terminal,
    close() {
      terminal.close();
    },
  };
}

function createTtyStdinLines(
  completionContext: () => InteractiveCompletionContext,
  writer: {
    readonly writeLine: (line: string) => void;
    readonly writeRender?: (lines: readonly string[]) => void;
    readonly onCommandLine?: (line: string) => void;
  },
): {
  readonly lines: AsyncIterable<string>;
  close(): void;
} {
  const keySource = createTtyPromptKeySource(process.stdin);
  return {
    lines: interactivePromptLinesFromKeys({
      keys: keySource.keys,
      writeLine: writer.writeLine,
      writeRender: writer.writeRender,
      onCommandLine: writer.onCommandLine,
      completionContext,
    }),
    close() {
      keySource.close();
    },
  };
}

export function completionContextFromInspectionState(
  inspectionStore: NodeDevInspectionStore | undefined,
  artifactSession: IncrementalArtifactSession | undefined,
  diagnostics: readonly DeckjsxNodeCliDiagnostic[] = [],
): InteractiveCompletionContext {
  const componentItems = inspectionStore?.componentTree().items ?? [];
  return {
    componentTargets: componentItems.flatMap((component) => [
      {
        label: component.name,
        detail: component.id,
        propsKeys: Object.keys(component.propsSummary),
      },
      { label: component.id, propsKeys: Object.keys(component.propsSummary) },
    ]),
    styleTargets: componentItems.flatMap((component) => {
      const firstGraphNodeId = component.graphNodeIds[0];
      return [
        ...(firstGraphNodeId
          ? [
              {
                label: component.name,
                detail: firstGraphNodeId,
                propertyKeys: stylePropertyKeysForGraphNode(artifactSession, firstGraphNodeId),
              },
            ]
          : []),
        ...component.graphNodeIds.map((graphNodeId) => ({
          label: graphNodeId,
          detail: component.name,
          propertyKeys: stylePropertyKeysForGraphNode(artifactSession, graphNodeId),
        })),
      ];
    }),
    projectionTargets: projectionCompletionTargets(artifactSession),
    diagnosticTargets: diagnostics.map((diagnostic, index) => ({
      index,
      code: diagnostic.code,
      title: diagnostic.title,
    })),
  };
}

function stylePropertyKeysForGraphNode(
  artifactSession: IncrementalArtifactSession | undefined,
  graphNodeId: string,
): readonly string[] {
  const resolvedStyle = artifactSession?.inspectArtifacts().graphNode(graphNodeId)?.resolvedStyle;
  if (typeof resolvedStyle !== "object" || resolvedStyle === null) {
    return [];
  }
  const propertyTraces = (resolvedStyle as { readonly propertyTraces?: unknown }).propertyTraces;
  return typeof propertyTraces === "object" && propertyTraces !== null
    ? Object.keys(propertyTraces)
    : [];
}

function projectionCompletionTargets(
  artifactSession: IncrementalArtifactSession | undefined,
): InteractiveCompletionContext["projectionTargets"] {
  const inspection = artifactSession?.inspectArtifacts();
  if (!inspection) {
    return [];
  }
  const targets: { insert: string; description: string }[] = [];
  for (const slot of inspection.retainedSlots()) {
    const projection = inspection.projectionForSlot(slot);
    targets.push({ insert: `@${slot}`, description: `Projection slot ${slot}` });
    const pages = projectionPages(projection);
    const pageLabel = projectionPageLabel(projection);
    pages.forEach((page, pageIndex) => {
      const pageName = projectionPageName(page);
      targets.push({
        insert: `@${slot} ${pageIndex}`,
        description: pageName
          ? `${pageLabel} ${pageIndex}: ${pageName}`
          : `${pageLabel} ${pageIndex}`,
      });
      projectionPageElements(page).forEach((element, elementIndex) => {
        targets.push({
          insert: `@${slot} ${pageIndex} ${elementIndex}`,
          description: projectionElementDescription(element, elementIndex),
        });
      });
    });
  }
  return targets.slice(0, 200);
}

function projectionPages(projection: unknown): readonly unknown[] {
  if (typeof projection !== "object" || projection === null) {
    return [];
  }
  const format = propertyValue(projection, "format");
  if (format === "pptx") {
    const slides = propertyValue(projection, "slides");
    return Array.isArray(slides) ? slides : [];
  }
  if (format === "pdf") {
    const pages = propertyValue(projection, "pages");
    return Array.isArray(pages) ? pages : [];
  }
  return [];
}

function projectionPageLabel(projection: unknown): "Page" | "Slide" {
  return propertyValue(projection, "format") === "pptx" ? "Slide" : "Page";
}

function projectionPageElements(page: unknown): readonly unknown[] {
  const visuals = propertyValue(page, "visuals");
  if (Array.isArray(visuals)) {
    return visuals;
  }
  const payload = propertyObject(page, "payload");
  const drawing = payload ? propertyObject(payload, "drawing") : propertyObject(page, "drawing");
  const children = drawing ? propertyValue(drawing, "children") : propertyValue(page, "children");
  return Array.isArray(children) ? children : [];
}

function projectionPageName(page: unknown): string | undefined {
  const payload = propertyObject(page, "payload");
  const name = payload ? propertyValue(payload, "name") : propertyValue(page, "name");
  return typeof name === "string" ? name : undefined;
}

function projectionElementDescription(element: unknown, index: number): string {
  const kind = propertyValue(element, "kind");
  const id = propertyValue(element, "id");
  return [
    `Element ${index}:`,
    typeof kind === "string" ? kind : "unknown",
    typeof id === "string" ? id : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}

function propertyObject(
  value: unknown,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const property = propertyValue(value, key);
  return typeof property === "object" && property !== null
    ? (property as Readonly<Record<string, unknown>>)
    : undefined;
}

function propertyValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
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

async function main(): Promise<void> {
  const parsed = parseDeckjsxNodeCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    await printDiagnostics(parsed.diagnostics);
    process.exitCode = 1;
    return;
  }
  if (parsed.command === "dev.help") {
    await writeCliLines(formatDeckjsxDevHelp());
    return;
  }
  if (parsed.command === "dev.interactiveHelp") {
    await writeCliLines(formatDeckjsxInteractiveHelp());
    return;
  }
  if (parsed.command !== "dev") {
    return;
  }

  await runDeckjsxDev(parsed);
}

async function printDiagnostics(diagnostics: readonly DeckjsxNodeCliDiagnostic[]): Promise<void> {
  await writeCliLines(formatDeckjsxNodeDiagnostics(diagnostics));
}

async function writeCliLines(lines: readonly string[]): Promise<void> {
  const output = createCliOutputQueue(process.stderr);
  lines.forEach(output.writeLine);
  await output.flush();
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
  void main()
    .catch(async (error: unknown) => {
      process.exitCode = 1;
      await writeCliLines([
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      ]);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}
