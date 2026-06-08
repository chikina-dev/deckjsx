export type XmlAttributeValue = boolean | number | string | undefined;
export type XmlTextValue = boolean | number | string | null | undefined;

const encoder = new TextEncoder();
const staticChunkCache = new Map<string, Uint8Array>();

function escapeXml(value: XmlTextValue): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function staticChunk(value: string): Uint8Array {
  const existing = staticChunkCache.get(value);
  if (existing) {
    return existing;
  }

  const encoded = encoder.encode(value);
  staticChunkCache.set(value, encoded);
  return encoded;
}

export class XmlChunkWriter {
  readonly #chunks: Uint8Array[] = [];

  declaration(): this {
    return this.pushStatic('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  }

  raw(value: string): this {
    if (value.length > 0) {
      this.#chunks.push(encoder.encode(value));
    }
    return this;
  }

  text(value: XmlTextValue): this {
    return this.raw(escapeXml(value));
  }

  open(name: string, attributes: Record<string, XmlAttributeValue> = {}): this {
    const attributeText = this.attributes(attributes);
    return attributeText.length > 0
      ? this.raw(`<${name}${attributeText}>`)
      : this.pushStatic(`<${name}>`);
  }

  close(name: string): this {
    return this.pushStatic(`</${name}>`);
  }

  empty(name: string, attributes: Record<string, XmlAttributeValue> = {}): this {
    const attributeText = this.attributes(attributes);
    return attributeText.length > 0
      ? this.raw(`<${name}${attributeText}/>`)
      : this.pushStatic(`<${name}/>`);
  }

  element(name: string, attributes: Record<string, XmlAttributeValue>, value: XmlTextValue): this {
    return this.open(name, attributes).text(value).close(name);
  }

  bytes(): Uint8Array {
    const byteLength = this.#chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of this.#chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private pushStatic(value: string): this {
    if (value.length > 0) {
      this.#chunks.push(staticChunk(value));
    }
    return this;
  }

  private attributes(attributes: Record<string, XmlAttributeValue>): string {
    let result = "";
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        result += ` ${key}="${escapeXml(value)}"`;
      }
    }
    return result;
  }
}
