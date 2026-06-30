import type { DeckPluginInput } from "deckjsx";

// @ts-expect-error grid shorthand helper types are internal runtime-diagnostic support, not root public authoring API.
type PublicCssGridShorthand = import("deckjsx").CssGridShorthand; // eslint-disable-line no-unused-vars

// @ts-expect-error grid template shorthand helper types are internal runtime-diagnostic support, not root public authoring API.
type PublicCssGridTemplateShorthand = import("deckjsx").CssGridTemplateShorthand; // eslint-disable-line no-unused-vars

// @ts-expect-error plugin hooks and detailed projection lifecycle types live in deckjsx/integration, not root authoring API.
type PublicRootDeckPlugin = import("deckjsx").DeckPlugin; // eslint-disable-line no-unused-vars

// @ts-expect-error compile graph node details are reached through CompileResult or deckjsx/inspect, not root named authoring exports.
type PublicRootCompiledAuthorNode = import("deckjsx").CompiledAuthorNode; // eslint-disable-line no-unused-vars

// @ts-expect-error compile graph style details are reached through CompileResult or deckjsx/inspect, not root named authoring exports.
type PublicRootCompiledStyleEntity = import("deckjsx").CompiledStyleEntity; // eslint-disable-line no-unused-vars

// @ts-expect-error projected document details are reached through ProjectResult or deckjsx/inspect, not root named authoring exports.
type PublicRootProjectedDocumentModel = import("deckjsx").ProjectedDocumentModel; // eslint-disable-line no-unused-vars

// @ts-expect-error render assembly details are reached through RenderResult summaries, not root named authoring exports.
type PublicRootRenderAssemblyBuildSummary = import("deckjsx").RenderAssemblyBuildSummary; // eslint-disable-line no-unused-vars

// @ts-expect-error render patch plans are integration metadata or RenderResult fields, not root named authoring exports.
type PublicRootRenderPatchPlan = import("deckjsx").RenderPatchPlan; // eslint-disable-line no-unused-vars

// @ts-expect-error grid shorthand helper types are internal runtime-diagnostic support, not style public API.
type NoStyleSubpathGridShorthand = import("deckjsx/style").CssGridShorthand; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleSheet runtime branding symbol is not part of the public style authoring API.
type NoStyleSubpathStyleSheetMarker = typeof import("deckjsx/style").STYLE_SHEET_VALUE; // eslint-disable-line no-unused-vars

// @ts-expect-error Theme runtime branding symbol is not part of the public style authoring API.
type NoStyleSubpathThemeMarker = typeof import("deckjsx/style").THEME_VALUE; // eslint-disable-line no-unused-vars

// @ts-expect-error RegisteredStyleSheetValue is an internal brand carried by StyleSheet instances, not a named public authoring type.
type NoPublicRegisteredStyleSheetValue = import("deckjsx").RegisteredStyleSheetValue; // eslint-disable-line no-unused-vars

// @ts-expect-error RegisteredThemeValue is an internal brand carried by Theme instances, not a named public authoring type.
type NoPublicRegisteredThemeValue = import("deckjsx").RegisteredThemeValue; // eslint-disable-line no-unused-vars

// @ts-expect-error RegisteredStyleSheetValue is not exported from the style authoring subpath.
type NoStyleSubpathRegisteredStyleSheetValue = import("deckjsx/style").RegisteredStyleSheetValue; // eslint-disable-line no-unused-vars

// @ts-expect-error RegisteredThemeValue is not exported from the style authoring subpath.
type NoStyleSubpathRegisteredThemeValue = import("deckjsx/style").RegisteredThemeValue; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleSheetClasses is constructor inference machinery, not a named public authoring type.
type NoStyleSubpathStyleSheetClasses = import("deckjsx/style").StyleSheetClasses; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleSheetClasses is constructor inference machinery, not a root public authoring type.
type NoPublicStyleSheetClasses = import("deckjsx").StyleSheetClasses; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleClassDefinition is internal StyleSheet validator vocabulary, not public authoring API.
type NoStyleSubpathStyleClassDefinition = import("deckjsx/style").StyleClassDefinition; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleClassDefinition is internal StyleSheet validator vocabulary, not root public authoring API.
type NoPublicStyleClassDefinition = import("deckjsx").StyleClassDefinition; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleForStyleTarget is internal StyleSheet validator vocabulary, not public authoring API.
type NoStyleSubpathStyleForStyleTarget = import("deckjsx/style").StyleForStyleTarget<"p.title">; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleForStyleTarget is internal StyleSheet validator vocabulary, not root public authoring API.
type NoPublicStyleForStyleTarget = import("deckjsx").StyleForStyleTarget<"p.title">; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleTargetSelector is internal selector validator vocabulary, not public authoring API.
type NoStyleSubpathStyleTargetSelector = import("deckjsx/style").StyleTargetSelector; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleTargetSelector is internal selector validator vocabulary, not root public authoring API.
type NoPublicStyleTargetSelector = import("deckjsx").StyleTargetSelector; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleTargetInput is internal selector validator vocabulary, not public authoring API.
type NoStyleSubpathStyleTargetInput = import("deckjsx/style").StyleTargetInput; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleTargetInput is internal selector validator vocabulary, not root public authoring API.
type NoPublicStyleTargetInput = import("deckjsx").StyleTargetInput; // eslint-disable-line no-unused-vars

// @ts-expect-error NonEmptyStyleTargetSelectorList is internal selector validator vocabulary, not public authoring API.
type NoStyleSubpathNonEmptyTargetList = import("deckjsx/style").NonEmptyStyleTargetSelectorList; // eslint-disable-line no-unused-vars

// @ts-expect-error NonEmptyStyleTargetSelectorList is internal selector validator vocabulary, not root public authoring API.
type NoPublicNonEmptyStyleTargetSelectorList = import("deckjsx").NonEmptyStyleTargetSelectorList; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleDeclaration is an internal resolved-style boundary, not a public authoring type.
type NoPublicStyleDeclaration = import("deckjsx").StyleDeclaration; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleDeclarationValue is internal and must not widen public authoring styles.
type NoPublicStyleDeclarationValue = import("deckjsx").StyleDeclarationValue; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleDeclaration is not exported from the style authoring subpath.
type NoStyleSubpathStyleDeclaration = import("deckjsx/style").StyleDeclaration; // eslint-disable-line no-unused-vars

// @ts-expect-error StyleDeclarationValue is not exported from the style authoring subpath.
type NoStyleSubpathStyleDeclarationValue = import("deckjsx/style").StyleDeclarationValue; // eslint-disable-line no-unused-vars

const rootPluginInput = {
  kind: "deckjsx.plugin",
  id: "root-plugin-input",
} satisfies DeckPluginInput;
void rootPluginInput;

const rootPluginInputRejectsUnknownHook = {
  kind: "deckjsx.plugin",
  id: "bad-hook",
  // @ts-expect-error DeckPluginInput is a root registration shape; hook authoring lives in deckjsx/integration.
  hooks: {
    afterEverything() {},
  },
} satisfies DeckPluginInput;
void rootPluginInputRejectsUnknownHook;

const rootPluginInputRejectsUnknownIntegrationField = {
  kind: "deckjsx.plugin",
  id: "bad-integration",
  // @ts-expect-error DeckPluginInput is a root registration shape; integration authoring lives in deckjsx/integration.
  integration: {
    id: "integration:id",
    arbitraryContext: true,
  },
} satisfies DeckPluginInput;
void rootPluginInputRejectsUnknownIntegrationField;
