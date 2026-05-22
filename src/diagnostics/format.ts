import type { Diagnostic, Diagnostics } from "./index";

function formatSpan(path: string): string {
  return `  at ${path}`;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const lines = [`${diagnostic.severity}[${diagnostic.code}]: ${diagnostic.title}`];

  if (diagnostic.message) {
    lines.push(`  ${diagnostic.message}`);
  }

  for (const label of diagnostic.labels) {
    lines.push(formatSpan(label.path));
    lines.push(`   = ${label.message}`);
  }

  for (const note of diagnostic.notes ?? []) {
    lines.push(`note: ${note}`);
  }

  for (const help of diagnostic.help ?? []) {
    lines.push(`help: ${help}`);
  }

  return lines.join("\n");
}

export function formatDiagnostics(diagnostics: Diagnostics): string {
  return diagnostics.items.map((item) => formatDiagnostic(item)).join("\n\n");
}
