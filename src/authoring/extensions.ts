/**
 * Runtime-neutral marker for an authoring value whose meaning is supplied by a Deck Plugin.
 *
 * Core carries this value through authoring composition but does not interpret `kind` or `payload`.
 * The active plugin that owns `pluginId` is responsible for lowering it into core AuthorTree
 * children before graph construction.
 */
export const AUTHORING_EXTENSION_VALUE_KIND = "deckjsx.authoring-extension" as const;

export type AuthoringExtensionValue<TKind extends string = string, TPayload = unknown> = {
  readonly $$typeof: typeof AUTHORING_EXTENSION_VALUE_KIND;
  readonly pluginId: string;
  readonly kind: TKind;
  readonly payload: TPayload;
};

export function createAuthoringExtensionValue<const TKind extends string, TPayload>(input: {
  readonly pluginId: string;
  readonly kind: TKind;
  readonly payload: TPayload;
}): AuthoringExtensionValue<TKind, TPayload> {
  if (typeof input.pluginId !== "string" || input.pluginId.trim().length === 0) {
    throw new TypeError("Authoring Extension Value pluginId must be a non-empty string.");
  }
  if (typeof input.kind !== "string" || input.kind.trim().length === 0) {
    throw new TypeError("Authoring Extension Value kind must be a non-empty string.");
  }

  return Object.freeze({
    $$typeof: AUTHORING_EXTENSION_VALUE_KIND,
    pluginId: input.pluginId,
    kind: input.kind,
    payload: input.payload,
  });
}

export function isAuthoringExtensionValue(value: unknown): value is AuthoringExtensionValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.$$typeof === AUTHORING_EXTENSION_VALUE_KIND &&
    typeof candidate.pluginId === "string" &&
    candidate.pluginId.trim().length > 0 &&
    typeof candidate.kind === "string" &&
    candidate.kind.trim().length > 0 &&
    "payload" in candidate
  );
}
