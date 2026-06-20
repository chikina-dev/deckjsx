import type { InteractiveCommand, InteractiveDevSession, InteractiveResponse } from "./session";
import { renderInteractiveResponse } from "../dev-console/render";

export type InteractiveCommandLoopInput = {
  readonly session: InteractiveDevSession;
  readonly lines: AsyncIterable<string>;
  readonly writeLine: (line: string) => void;
  readonly renderResponse?: (response: InteractiveResponse) => readonly string[];
};

export class InteractiveInputParseError extends Error {
  readonly input: string;
  readonly span: {
    readonly start: number;
    readonly length: number;
  };

  constructor(
    input: string,
    message: string,
    span: { readonly start: number; readonly length: number },
  ) {
    super(message);
    this.name = "InteractiveInputParseError";
    this.input = input;
    this.span = span;
  }
}

export type InteractiveCompletion = {
  readonly insertText: string;
  readonly description: string;
};

export type InteractiveCompletionContext = {
  readonly componentTargets?: readonly {
    readonly label: string;
    readonly detail?: string;
    readonly propsKeys?: readonly string[];
  }[];
  readonly styleTargets?: readonly {
    readonly label: string;
    readonly detail?: string;
    readonly propertyKeys?: readonly string[];
  }[];
  readonly projectionTargets?: readonly {
    readonly insert: string;
    readonly description: string;
  }[];
  readonly diagnosticTargets?: readonly {
    readonly index: number;
    readonly code: string;
    readonly title: string;
  }[];
};

export type InteractiveInputHighlightKind =
  | "command"
  | "subcommand"
  | "selection"
  | "target"
  | "path"
  | "property"
  | "filter"
  | "number"
  | "unknown"
  | "error";

export type InteractiveInputHighlightToken = {
  readonly kind: InteractiveInputHighlightKind;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export type InteractiveInputHighlightOptions = {
  readonly errorSpan?: {
    readonly start: number;
    readonly length: number;
  };
};

export type InteractivePromptState = {
  readonly line: string;
  readonly cursor: number;
  readonly history: readonly string[];
  readonly historyIndex?: number;
  readonly draftLine?: string;
};

export type InteractivePromptKey =
  | { readonly type: "insert"; readonly text: string }
  | { readonly type: "backspace" }
  | { readonly type: "enter" }
  | { readonly type: "tab" }
  | { readonly type: "left" }
  | { readonly type: "right" }
  | { readonly type: "up" }
  | { readonly type: "down" };

export type InteractivePromptOutput =
  | {
      readonly type: "render";
      readonly lines: readonly string[];
    }
  | {
      readonly type: "line";
      readonly line: string;
    };

export type InteractivePromptUpdateOptions = {
  readonly prompt?: string;
  readonly completionContext?: InteractiveCompletionContext;
};

export type InteractivePromptLineInput = {
  readonly keys: AsyncIterable<InteractivePromptKey>;
  readonly writeLine: (line: string) => void;
  readonly writeRender?: (lines: readonly string[]) => void;
  readonly onCommandLine?: (line: string) => void;
  readonly prompt?: string;
  readonly completionContext?: () => InteractiveCompletionContext;
};

const TOP_LEVEL_COMPLETIONS = [
  { insertText: "help", description: "Show short prompt guidance." },
  { insertText: "status", description: "Show compiler and latest compilation status." },
  { insertText: "timings", description: "Show compiler and command timings." },
  { insertText: "diagnostics", description: "List latest diagnostics." },
  { insertText: "diagnostic ", description: "Explain one diagnostic by index." },
  { insertText: "style ", description: "Explain resolved style for a node." },
  { insertText: "component ", description: "Inspect component state." },
  { insertText: "props ", description: "Inspect component props." },
  { insertText: "projection ", description: "Inspect retained projection output." },
  { insertText: "history changes", description: "Compare successful artifact updates." },
  { insertText: "selection", description: "Show selection handles." },
  { insertText: "$0", description: "Resolve latest selection." },
  { insertText: "$1", description: "Resolve previous selection." },
  { insertText: "$2", description: "Resolve older selection." },
  { insertText: "$$", description: "Resolve latest result list." },
  { insertText: "exit", description: "Leave the interactive prompt." },
  { insertText: "quit", description: "Leave the interactive prompt." },
  { insertText: ".exit", description: "Leave the interactive prompt." },
] as const satisfies readonly InteractiveCompletion[];

const COMPONENT_COMPLETIONS = [
  { insertText: "component tree", description: "Show component hierarchy." },
  { insertText: "component inspect ", description: "Inspect one component." },
  { insertText: "component search ", description: "Search latest components." },
  { insertText: "component filter ", description: "Filter the current component list." },
  { insertText: "component diff", description: "Compare component snapshots." },
  { insertText: "component impact ", description: "Show projected output impact." },
] as const satisfies readonly InteractiveCompletion[];

const PROPS_COMPLETIONS = [
  { insertText: "props inspect ", description: "Inspect component props." },
  { insertText: "props diff ", description: "Compare component props snapshots." },
] as const satisfies readonly InteractiveCompletion[];

const COMPONENT_QUERY_COMPLETIONS = [
  { insertText: "source:", description: "Filter by source/module path." },
  { insertText: "props.", description: "Filter by top-level prop path." },
  { insertText: "has:diagnostic", description: "Filter components with related diagnostics." },
  { insertText: "impact:slide", description: "Filter components with slide projection impact." },
] as const;

const SELECTION_TARGET_COMPLETIONS = [
  { insert: "$0", description: "Selection $0 (latest result)." },
  { insert: "$1", description: "Selection $1 (previous result)." },
  { insert: "$2", description: "Selection $2 (older result)." },
  { insert: "$$", description: "Selection $$ (latest result list)." },
] as const;

const TOP_LEVEL_COMMANDS = new Set([
  "help",
  "?",
  "status",
  "timings",
  "diagnostics",
  "diagnostic",
  "style",
  "component",
  "props",
  "projection",
  "history",
  "changes",
  "selection",
  "exit",
  "quit",
  ".exit",
]);

const COMPONENT_SUBCOMMANDS = new Set(["tree", "inspect", "search", "filter", "diff", "impact"]);
const PROPS_SUBCOMMANDS = new Set(["inspect", "diff"]);

export function createInteractivePromptState(): InteractivePromptState {
  return { line: "", cursor: 0, history: [] };
}

export function updateInteractivePromptState(
  state: InteractivePromptState,
  key: InteractivePromptKey,
  options: InteractivePromptUpdateOptions = {},
): {
  readonly state: InteractivePromptState;
  readonly outputs: readonly InteractivePromptOutput[];
} {
  switch (key.type) {
    case "insert":
      return renderPromptUpdate(insertPromptText(clearHistoryCursor(state), key.text), options);
    case "backspace":
      return renderPromptUpdate(backspacePromptText(clearHistoryCursor(state)), options);
    case "left":
      return renderPromptUpdate({ ...state, cursor: Math.max(0, state.cursor - 1) }, options);
    case "right":
      return renderPromptUpdate(
        { ...state, cursor: Math.min(state.line.length, state.cursor + 1) },
        options,
      );
    case "tab": {
      const completionPrefix = state.line.slice(0, promptCursor(state));
      const completions = completeInteractiveInput(completionPrefix, options.completionContext);
      if (completions.length === 1) {
        return renderPromptUpdate(applyPromptCompletion(state, completions[0].insertText), options);
      }
      return {
        state,
        outputs: [
          {
            type: "render",
            lines: [
              ...formatInteractiveCompletionMenu(
                completionPrefix,
                options.completionContext,
                completions,
              ),
              ...formatInteractivePromptLines(state, options),
            ],
          },
        ],
      };
    }
    case "up":
      return renderPromptUpdate(previousHistoryState(state), options);
    case "down":
      return renderPromptUpdate(nextHistoryState(state), options);
    case "enter": {
      const history = state.line.trim() ? [...state.history, state.line] : [...state.history];
      return {
        state: { line: "", cursor: 0, history },
        outputs: [{ type: "line", line: state.line }],
      };
    }
  }
}

export function formatInteractivePromptLines(
  state: InteractivePromptState,
  options: Pick<InteractivePromptUpdateOptions, "prompt"> = {},
): readonly string[] {
  return [`${options.prompt ?? "deckjsx> "}${formatHighlightedInteractiveInputLine(state.line)}`];
}

export async function* interactivePromptLinesFromKeys(
  input: InteractivePromptLineInput,
): AsyncIterable<string> {
  let state = createInteractivePromptState();
  for await (const key of input.keys) {
    const update = updateInteractivePromptState(state, key, {
      prompt: input.prompt,
      completionContext: input.completionContext?.(),
    });
    state = update.state;
    for (const output of update.outputs) {
      if (output.type === "render") {
        if (input.writeRender) {
          input.writeRender(output.lines);
        } else {
          output.lines.forEach(input.writeLine);
        }
      } else {
        input.onCommandLine?.(output.line);
        yield output.line;
      }
    }
  }
}

export function highlightInteractiveInputLine(
  line: string,
  options: InteractiveInputHighlightOptions = {},
): readonly InteractiveInputHighlightToken[] {
  const errorRange = highlightErrorRange(line, options.errorSpan);
  return inputTokens(line).map((token, index, tokens) => {
    if (errorRange && rangesOverlap(token.start, token.end, errorRange.start, errorRange.end)) {
      const start = Math.max(token.start, errorRange.start);
      const end = Math.min(token.end, errorRange.end);
      return { kind: "error", start, end, text: line.slice(start, end) };
    }
    return {
      ...token,
      kind: highlightKindForToken(tokens, index),
    };
  });
}

export function formatHighlightedInteractiveInputLine(
  line: string,
  options: InteractiveInputHighlightOptions = {},
): string {
  const tokens = highlightInteractiveInputLine(line, options);
  let output = "";
  let cursor = 0;
  for (const token of tokens) {
    output += line.slice(cursor, token.start);
    output += `${ansiForHighlightKind(token.kind)}${token.text}\x1b[39m`;
    cursor = token.end;
  }
  output += line.slice(cursor);
  return output;
}

export function completeInteractiveInputLine(
  line: string,
  context: InteractiveCompletionContext = {},
): readonly string[] {
  return completeInteractiveInput(line, context).map((completion) => completion.insertText);
}

export function completeInteractiveInput(
  line: string,
  context: InteractiveCompletionContext = {},
): readonly InteractiveCompletion[] {
  const diagnosticCompletions = diagnosticCompletionsFor(line, context);
  if (diagnosticCompletions) {
    return diagnosticCompletions;
  }
  const projectionCompletions = projectionCompletionsFor(line, context);
  if (projectionCompletions) {
    return projectionCompletions;
  }
  const stylePropertyCompletions = stylePropertyCompletionsFor(line, context);
  if (stylePropertyCompletions) {
    return stylePropertyCompletions;
  }
  const styleTargetCompletions = styleTargetCompletionsFor(line, context);
  if (styleTargetCompletions) {
    return styleTargetCompletions;
  }
  const propsPathCompletions = propsPathCompletionsFor(line, context);
  if (propsPathCompletions) {
    return propsPathCompletions;
  }
  const componentTargetCompletions = componentTargetCompletionsFor(line, context);
  if (componentTargetCompletions) {
    return componentTargetCompletions;
  }
  const componentQueryCompletions = componentQueryCompletionsFor(line, context);
  if (componentQueryCompletions) {
    return componentQueryCompletions;
  }
  if (line.startsWith("component ")) {
    return matchingCompletions(line, COMPONENT_COMPLETIONS);
  }
  if (line.startsWith("props ")) {
    return matchingCompletions(line, PROPS_COMPLETIONS);
  }
  return matchingCompletions(line, TOP_LEVEL_COMPLETIONS);
}

export function formatInteractiveCompletionMenu(
  line: string,
  context: InteractiveCompletionContext = {},
  completions: readonly InteractiveCompletion[] = completeInteractiveInput(line, context),
): readonly string[] {
  if (completions.length === 0) {
    return ["no completions"];
  }
  return [
    "completions",
    ...completions.map(
      (completion) =>
        `  ${completionDisplayText(line, completion.insertText).padEnd(11)}${completion.description}`,
    ),
  ];
}

function completionDisplayText(line: string, insertText: string): string {
  const prefix = completionReplacementPrefix(line);
  if (!insertText.startsWith(prefix)) {
    return insertText.trimEnd();
  }
  const display = insertText.slice(prefix.length).trimEnd();
  return display.length > 0 ? display : insertText.trimEnd();
}

function completionReplacementPrefix(line: string): string {
  if (line.length === 0 || /\s$/.test(line)) {
    return line;
  }
  const lastSpace = line.search(/\S+$/);
  return lastSpace >= 0 ? line.slice(0, lastSpace) : "";
}

function renderPromptUpdate(
  state: InteractivePromptState,
  options: InteractivePromptUpdateOptions,
): {
  readonly state: InteractivePromptState;
  readonly outputs: readonly InteractivePromptOutput[];
} {
  return {
    state,
    outputs: [{ type: "render", lines: formatInteractivePromptLines(state, options) }],
  };
}

function insertPromptText(state: InteractivePromptState, text: string): InteractivePromptState {
  const cursor = Math.max(0, Math.min(state.line.length, state.cursor));
  return {
    ...state,
    line: `${state.line.slice(0, cursor)}${text}${state.line.slice(cursor)}`,
    cursor: cursor + text.length,
  };
}

function backspacePromptText(state: InteractivePromptState): InteractivePromptState {
  const cursor = Math.max(0, Math.min(state.line.length, state.cursor));
  if (cursor === 0) {
    return state;
  }
  return {
    ...state,
    line: `${state.line.slice(0, cursor - 1)}${state.line.slice(cursor)}`,
    cursor: cursor - 1,
  };
}

function applyPromptCompletion(
  state: InteractivePromptState,
  insertText: string,
): InteractivePromptState {
  const cursor = promptCursor(state);
  const suffix = completionSuffix(insertText, state.line.slice(cursor));
  return {
    ...state,
    line: `${insertText}${suffix}`,
    cursor: insertText.length,
  };
}

function promptCursor(state: Pick<InteractivePromptState, "line" | "cursor">): number {
  return Math.max(0, Math.min(state.line.length, state.cursor));
}

function completionSuffix(insertText: string, suffix: string): string {
  if (insertText.endsWith(" ") && suffix.startsWith(" ")) {
    return suffix.slice(1);
  }
  return suffix;
}

function clearHistoryCursor(state: InteractivePromptState): InteractivePromptState {
  return {
    line: state.line,
    cursor: state.cursor,
    history: state.history,
  };
}

function previousHistoryState(state: InteractivePromptState): InteractivePromptState {
  if (state.history.length === 0) {
    return state;
  }
  const historyIndex =
    state.historyIndex === undefined
      ? state.history.length - 1
      : Math.max(0, state.historyIndex - 1);
  const line = state.history[historyIndex] ?? "";
  return {
    line,
    cursor: line.length,
    history: state.history,
    historyIndex,
    draftLine: state.historyIndex === undefined ? state.line : state.draftLine,
  };
}

function nextHistoryState(state: InteractivePromptState): InteractivePromptState {
  if (state.historyIndex === undefined) {
    return state;
  }
  if (state.historyIndex < state.history.length - 1) {
    const historyIndex = state.historyIndex + 1;
    const line = state.history[historyIndex] ?? "";
    return {
      ...state,
      line,
      cursor: line.length,
      historyIndex,
    };
  }
  const line = state.draftLine ?? "";
  return {
    line,
    cursor: line.length,
    history: state.history,
  };
}

function inputTokens(
  line: string,
): readonly { readonly start: number; readonly end: number; readonly text: string }[] {
  return [...line.matchAll(/\S+/g)].map((match) => {
    const start = match.index ?? 0;
    const text = match[0] ?? "";
    return { start, end: start + text.length, text };
  });
}

function highlightKindForToken(
  tokens: readonly { readonly text: string }[],
  index: number,
): InteractiveInputHighlightKind {
  const text = tokens[index]?.text ?? "";
  const command = tokens[0]?.text;
  const subcommand = tokens[1]?.text;
  if (index === 0) {
    if (isSelectionHandle(text)) {
      return "selection";
    }
    return TOP_LEVEL_COMMANDS.has(text) || text.startsWith("{") ? "command" : "unknown";
  }
  if (command === "component") {
    return componentHighlightKind(index, text, subcommand);
  }
  if (command === "props") {
    return propsHighlightKind(index, text, subcommand);
  }
  if (command === "style") {
    if (index === 1) {
      return isSelectionHandle(text) ? "selection" : "target";
    }
    return "property";
  }
  if (command === "projection" || command === "diagnostic") {
    return isNumericInputToken(text) ? "number" : "target";
  }
  if (command === "history" && index === 1 && text === "changes") {
    return "subcommand";
  }
  return isSelectionHandle(text) ? "selection" : "target";
}

function componentHighlightKind(
  index: number,
  text: string,
  subcommand: string | undefined,
): InteractiveInputHighlightKind {
  if (index === 1) {
    return COMPONENT_SUBCOMMANDS.has(text) ? "subcommand" : "unknown";
  }
  if (subcommand === "search" || subcommand === "filter") {
    return isFilterToken(text) ? "filter" : "target";
  }
  if (subcommand === "inspect" || subcommand === "impact" || subcommand === "diff") {
    return isSelectionHandle(text) ? "selection" : "target";
  }
  return "target";
}

function propsHighlightKind(
  index: number,
  text: string,
  subcommand: string | undefined,
): InteractiveInputHighlightKind {
  if (index === 1) {
    return PROPS_SUBCOMMANDS.has(text) ? "subcommand" : "unknown";
  }
  if (index === 2 && (subcommand === "inspect" || subcommand === "diff")) {
    return isSelectionHandle(text) ? "selection" : "target";
  }
  return "path";
}

function highlightErrorRange(
  line: string,
  span: InteractiveInputHighlightOptions["errorSpan"],
): { readonly start: number; readonly end: number } | undefined {
  if (!span) {
    return undefined;
  }
  const start = Math.max(0, Math.min(line.length, span.start));
  const end = Math.max(start + 1, Math.min(line.length, start + span.length));
  return { start, end };
}

function rangesOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

function isSelectionHandle(text: string): boolean {
  return text === "$$" || /^\$[0-2]$/.test(text);
}

function isNumericInputToken(text: string): boolean {
  return /^\d+$/.test(text) || /^@\d+$/.test(text);
}

function isFilterToken(text: string): boolean {
  return /^(source|props(?:\.[\w.]+)?|has|impact)[:~]/.test(text);
}

function ansiForHighlightKind(kind: InteractiveInputHighlightKind): string {
  switch (kind) {
    case "command":
    case "subcommand":
      return "\x1b[36m";
    case "selection":
      return "\x1b[33m";
    case "error":
    case "unknown":
      return "\x1b[31m";
    case "target":
    case "path":
    case "property":
    case "filter":
    case "number":
      return "\x1b[32m";
  }
}

export function parseInteractiveInputLine(line: string): InteractiveCommand | "exit" | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed === "exit" || trimmed === "quit" || trimmed === ".exit") {
    return "exit";
  }
  if (trimmed === "help" || trimmed === "?") {
    return { method: "session.help" };
  }
  if (trimmed === "status") {
    return { method: "session.status" };
  }
  if (trimmed === "timings") {
    return { method: "session.timings" };
  }
  if (trimmed === "history changes" || trimmed === "changes") {
    return { method: "history.changes" };
  }
  if (trimmed === "diagnostics") {
    return { method: "diagnostics.list" };
  }
  const tokens = trimmed.split(/\s+/);
  const [command, first, second] = tokens;
  if (command === "diagnostic" && first !== undefined && /^\d+$/.test(first)) {
    if (tokens.length > 2) {
      throw extraArgumentError(trimmed, tokens[2]!, "diagnostic accepts exactly one index.");
    }
    return { method: "diagnostics.explain", params: { index: Number(first) } };
  }
  if (command === "diagnostic") {
    throw new InteractiveInputParseError(
      trimmed,
      "diagnostic index must be a non-negative integer.",
      first
        ? { start: trimmed.indexOf(first), length: first.length }
        : { start: trimmed.length, length: 1 },
    );
  }
  if (command === "style" && first !== undefined) {
    if (tokens.length > 3) {
      throw extraArgumentError(
        trimmed,
        tokens[3]!,
        "style accepts a target and optional property.",
      );
    }
    return {
      method: "style.explain",
      params: { nodeId: first, ...(second !== undefined ? { property: second } : {}) },
    };
  }
  if (command === "style") {
    throw new InteractiveInputParseError(trimmed, "style requires a target.", {
      start: trimmed.length,
      length: 1,
    });
  }
  if (command === "component") {
    const componentCommand = componentCommandFromTokens(trimmed, tokens.slice(1));
    if (componentCommand) {
      return componentCommand;
    }
  }
  if (command === "props") {
    const propsCommand = propsCommandFromTokens(trimmed, tokens.slice(1));
    if (propsCommand) {
      return propsCommand;
    }
  }
  if (trimmed === "selection") {
    return { method: "selection.list" };
  }
  if (command === "component" && first !== undefined) {
    return { method: "component.stack", params: { nodeId: first } };
  }
  if (command === "projection") {
    const params = projectionParamsFromTokens(trimmed, tokens.slice(1));
    return {
      method: "projection.inspect",
      ...(params ? { params } : {}),
    };
  }
  if (trimmed === "$0" || trimmed === "$1" || trimmed === "$2" || trimmed === "$$") {
    return { method: "selection.resolve", params: { handle: trimmed } };
  }
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new InteractiveInputParseError(trimmed, "Invalid JSON command.", {
        start: 0,
        length: trimmed.length,
      });
    }
    if (isInteractiveCommand(parsed)) {
      return parsed;
    }
  }
  return {
    method: trimmed,
  };
}

function matchingCompletions(
  line: string,
  candidates: readonly InteractiveCompletion[],
): readonly InteractiveCompletion[] {
  return candidates.filter((candidate) => candidate.insertText.startsWith(line));
}

function componentTargetCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  const prefix = componentTargetPrefixFor(line);
  if (!prefix) {
    return undefined;
  }
  return componentTargetCandidates(context).flatMap((target) => {
    const insertText = `${prefix.commandPrefix}${target.insert}`;
    return insertText.startsWith(line) ? [{ insertText, description: target.description }] : [];
  });
}

function componentTargetPrefixFor(line: string): { readonly commandPrefix: string } | undefined {
  for (const commandPrefix of [
    "component inspect ",
    "component impact ",
    "props inspect ",
    "props diff ",
  ]) {
    if (line.startsWith(commandPrefix)) {
      return { commandPrefix };
    }
  }
  return undefined;
}

function componentTargetCandidates(context: InteractiveCompletionContext): readonly {
  readonly insert: string;
  readonly description: string;
}[] {
  const byInsert = new Map<string, { insert: string; description: string }>();
  for (const handle of SELECTION_TARGET_COMPLETIONS) {
    byInsert.set(handle.insert, handle);
  }
  for (const target of context.componentTargets ?? []) {
    const description = target.detail
      ? `Component ${target.label} (${target.detail})`
      : `Component ${target.label}`;
    if (!byInsert.has(target.label)) {
      byInsert.set(target.label, { insert: target.label, description });
    }
    if (target.detail) {
      if (!byInsert.has(target.detail)) {
        byInsert.set(target.detail, { insert: target.detail, description });
      }
    }
  }
  return [...byInsert.values()];
}

function styleTargetCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  if (!/^style \S*$/.test(line)) {
    return undefined;
  }
  return styleTargetCandidates(context).flatMap((target) => {
    const insertText = `style ${target.insert}`;
    return insertText.startsWith(line) ? [{ insertText, description: target.description }] : [];
  });
}

function styleTargetCandidates(context: InteractiveCompletionContext): readonly {
  readonly insert: string;
  readonly description: string;
}[] {
  const byInsert = new Map<string, { insert: string; description: string }>();
  for (const handle of SELECTION_TARGET_COMPLETIONS) {
    byInsert.set(handle.insert, handle);
  }
  for (const target of context.styleTargets ?? []) {
    const description = target.detail
      ? `Style target ${target.label} (${target.detail})`
      : `Style target ${target.label}`;
    if (!byInsert.has(target.label)) {
      byInsert.set(target.label, { insert: target.label, description });
    }
  }
  return [...byInsert.values()];
}

function stylePropertyCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  const match = /^style (\S+)\s+(\S*)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const [, targetToken, propertyPrefix] = match;
  const target = (context.styleTargets ?? []).find((candidate) => candidate.label === targetToken);
  if (!target?.propertyKeys?.length) {
    return [];
  }
  return target.propertyKeys.flatMap((key) => {
    const insertText = `style ${targetToken} ${key}`;
    return insertText.startsWith(line)
      ? [{ insertText, description: `Style property ${key} on ${target.label}` }]
      : propertyPrefix && key.startsWith(propertyPrefix)
        ? [{ insertText, description: `Style property ${key} on ${target.label}` }]
        : [];
  });
}

function projectionCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  if (!line.startsWith("projection ")) {
    return undefined;
  }
  const liveTargets = context.projectionTargets ?? [];
  if (liveTargets.length === 0 && line === "projection ") {
    return [
      { insertText: "projection @0", description: "Inspect a retained projection slot." },
      {
        insertText: "projection 0",
        description: "Inspect slide 0 in the first retained projection.",
      },
    ];
  }
  return liveTargets.flatMap((target) => {
    const insertText = `projection ${target.insert}`;
    return insertText.startsWith(line) ? [{ insertText, description: target.description }] : [];
  });
}

function diagnosticCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  if (!line.startsWith("diagnostic ")) {
    return undefined;
  }
  const targets = context.diagnosticTargets ?? [];
  if (targets.length === 0 && line === "diagnostic ") {
    return [
      {
        insertText: "diagnostic 0",
        description: "Explain diagnostic 0 when diagnostics are available.",
      },
    ];
  }
  return targets.flatMap((target) => {
    const insertText = `diagnostic ${target.index}`;
    return insertText.startsWith(line)
      ? [
          {
            insertText,
            description: `Diagnostic ${target.index} ${target.code} ${target.title}`,
          },
        ]
      : [];
  });
}

function componentQueryCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  const match = /^(component (?:search|filter) )(\S*)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const [, commandPrefix, queryPrefix] = match;
  const action = commandPrefix.includes("search") ? "Search" : "Filter";
  const staticCompletions = COMPONENT_QUERY_COMPLETIONS.flatMap((completion) => {
    const insertText = `${commandPrefix}${completion.insertText}`;
    return completion.insertText.startsWith(queryPrefix)
      ? [
          {
            insertText,
            description: completion.description.replace(/^Filter/, action),
          },
        ]
      : [];
  });
  const propCompletions =
    queryPrefix.startsWith("props.") && !queryPrefix.includes(":") && !queryPrefix.includes("~")
      ? componentQueryPropCompletions(commandPrefix, queryPrefix, action, context)
      : [];
  return dedupeCompletions([...staticCompletions, ...propCompletions]);
}

function componentQueryPropCompletions(
  commandPrefix: string,
  queryPrefix: string,
  action: "Search" | "Filter",
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] {
  return uniqueTopLevelPropsKeys(context).flatMap((key) =>
    ([":", "~"] as const).flatMap((operator) => {
      const query = `props.${key}${operator}`;
      const insertText = `${commandPrefix}${query}`;
      if (!query.startsWith(queryPrefix)) {
        return [];
      }
      return [
        {
          insertText,
          description: `${action} by top-level prop ${key} ${
            operator === ":" ? "exact value." : "contains value."
          }`,
        },
      ];
    }),
  );
}

function uniqueTopLevelPropsKeys(context: InteractiveCompletionContext): readonly string[] {
  return [
    ...new Set((context.componentTargets ?? []).flatMap((target) => target.propsKeys ?? [])),
  ].sort();
}

function dedupeCompletions(
  completions: readonly InteractiveCompletion[],
): readonly InteractiveCompletion[] {
  const byInsert = new Map<string, InteractiveCompletion>();
  for (const completion of completions) {
    if (!byInsert.has(completion.insertText)) {
      byInsert.set(completion.insertText, completion);
    }
  }
  return [...byInsert.values()];
}

function propsPathCompletionsFor(
  line: string,
  context: InteractiveCompletionContext,
): readonly InteractiveCompletion[] | undefined {
  const match = /^(props (?:inspect|diff) )(\S+)\s+(\S*)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const [, commandPrefix, targetToken, pathPrefix] = match;
  const target = (context.componentTargets ?? []).find(
    (candidate) => candidate.label === targetToken || candidate.detail === targetToken,
  );
  if (!target?.propsKeys?.length) {
    return [];
  }
  return target.propsKeys.flatMap((key) => {
    const insertText = `${commandPrefix}${targetToken} ${key}`;
    return insertText.startsWith(line)
      ? [{ insertText, description: `Prop ${key} on ${target.label}` }]
      : pathPrefix && key.startsWith(pathPrefix)
        ? [{ insertText, description: `Prop ${key} on ${target.label}` }]
        : [];
  });
}

function componentCommandFromTokens(
  input: string,
  tokens: readonly string[],
): InteractiveCommand | undefined {
  const [subcommand, first, ...rest] = tokens;
  if (subcommand === "tree") {
    if (first !== undefined) {
      throw extraArgumentError(input, first, "component tree does not accept extra arguments.");
    }
    return { method: "component.tree" };
  }
  if (subcommand === "inspect" && first === undefined) {
    throw missingComponentSubcommandArgument(input, "inspect", "target");
  }
  if (subcommand === "inspect" && first !== undefined) {
    if (rest.length > 0) {
      throw extraArgumentError(input, rest[0]!, "component inspect accepts exactly one target.");
    }
    return { method: "component.inspect", params: { target: first } };
  }
  if (subcommand === "search" && first === undefined) {
    throw missingComponentSubcommandArgument(input, "search", "query");
  }
  if (subcommand === "search") {
    const query = [first, ...rest]
      .filter((token): token is string => token !== undefined)
      .join(" ");
    return query ? { method: "component.search", params: { query } } : undefined;
  }
  if (subcommand === "filter" && first === undefined) {
    throw missingComponentSubcommandArgument(input, "filter", "query");
  }
  if (subcommand === "filter") {
    const query = [first, ...rest]
      .filter((token): token is string => token !== undefined)
      .join(" ");
    return query ? { method: "component.filter", params: { query } } : undefined;
  }
  if (subcommand === "diff") {
    if (rest.length > 0) {
      throw extraArgumentError(input, rest[0]!, "component diff accepts at most one target.");
    }
    return first === undefined
      ? { method: "component.diff" }
      : { method: "component.diff", params: { target: first } };
  }
  if (subcommand === "impact" && first === undefined) {
    throw missingComponentSubcommandArgument(input, "impact", "target");
  }
  if (subcommand === "impact" && first !== undefined) {
    if (rest.length > 0) {
      throw extraArgumentError(input, rest[0]!, "component impact accepts exactly one target.");
    }
    return { method: "component.impact", params: { target: first } };
  }
  return undefined;
}

function missingComponentSubcommandArgument(
  input: string,
  subcommand: string,
  argument: "target" | "query",
): InteractiveInputParseError {
  return new InteractiveInputParseError(input, `component ${subcommand} requires a ${argument}.`, {
    start: input.length,
    length: 1,
  });
}

function propsCommandFromTokens(
  input: string,
  tokens: readonly string[],
): InteractiveCommand | undefined {
  const [subcommand, target, path, extra] = tokens;
  if ((subcommand === "inspect" || subcommand === "diff") && target === undefined) {
    throw new InteractiveInputParseError(input, `props ${subcommand} requires a target.`, {
      start: input.length,
      length: 1,
    });
  }
  if ((subcommand === "inspect" || subcommand === "diff") && target !== undefined) {
    if (extra !== undefined) {
      throw extraArgumentError(
        input,
        extra,
        `props ${subcommand} accepts a target and optional path.`,
      );
    }
    return {
      method: `props.${subcommand}`,
      params: { target, ...(path !== undefined ? { path } : {}) },
    };
  }
  return undefined;
}

function extraArgumentError(
  input: string,
  token: string,
  message: string,
): InteractiveInputParseError {
  return new InteractiveInputParseError(input, message, {
    start: input.indexOf(token),
    length: token.length,
  });
}

function projectionParamsFromTokens(
  input: string,
  tokens: readonly string[],
): Record<string, unknown> | undefined {
  const params: Record<string, unknown> = {};
  let index = 0;
  const slotToken = tokens[index];
  if (slotToken?.startsWith("@")) {
    params.slot = numericToken(input, slotToken, slotToken.slice(1));
    index += 1;
  }
  const slideIndex = tokens[index];
  if (slideIndex !== undefined) {
    params.slideIndex = numericToken(input, slideIndex, slideIndex);
    index += 1;
  }
  const elementIndex = tokens[index];
  if (elementIndex !== undefined) {
    params.elementIndex = numericToken(input, elementIndex, elementIndex);
    index += 1;
  }
  const extraToken = tokens[index];
  if (extraToken !== undefined) {
    throw new InteractiveInputParseError(
      input,
      "projection accepts at most slot, slide index, and element index.",
      {
        start: input.indexOf(extraToken),
        length: extraToken.length,
      },
    );
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function numericToken(input: string, token: string, value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  throw new InteractiveInputParseError(
    input,
    "projection numeric arguments must be non-negative integers.",
    {
      start: input.indexOf(token),
      length: token.length,
    },
  );
}

export async function runInteractiveDevCommandLoop(
  input: InteractiveCommandLoopInput,
): Promise<void> {
  const renderResponse = input.renderResponse ?? renderInteractiveResponse;
  for await (const line of input.lines) {
    let command: InteractiveCommand | "exit" | undefined;
    try {
      command = parseInteractiveInputLine(line);
    } catch (error) {
      renderResponse(parseErrorResponse(error)).forEach(input.writeLine);
      continue;
    }

    if (!command) {
      continue;
    }
    if (command === "exit") {
      return;
    }

    renderResponse(await input.session.dispatch(command)).forEach(input.writeLine);
  }
}

function isInteractiveCommand(value: unknown): value is InteractiveCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    typeof value.method === "string"
  );
}

function parseErrorResponse(error: unknown): InteractiveResponse {
  if (error instanceof InteractiveInputParseError) {
    return {
      ok: false,
      error: {
        code: "deckjsx.node.interactive.invalidInput",
        message: error.message,
        input: error.input,
        span: error.span,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "deckjsx.node.interactive.invalidInput",
      message: error instanceof Error ? error.message : "Invalid interactive input.",
    },
  };
}
