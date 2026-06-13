import type {
  AuthorElementNode,
  AuthorElementProps,
  AuthorElementPropValue,
  AuthorImageElementNode,
  AuthorShapeElementNode,
  AuthorSlideElementNode,
  AuthorTableCellElementNode,
  AuthorTableElementNode,
  AuthorTableRowElementNode,
  AuthorTableSectionElementNode,
  AuthorTextLeaf,
  AuthorTreeNode,
  AuthorVideoElementNode,
  JsxKey,
} from "../authoring/tree";
import type { ImageNodeProps, VideoNodeProps } from "../authoring/props";
import type { ComposedAuthorRoot, SourceSlotOrigin } from "../composition/types";
import { createDiagnostics, diagnostic, type Diagnostic, type Diagnostics } from "../diagnostics";
import {
  IMAGE_STYLE_KEYS,
  SHAPE_STYLE_KEYS,
  SLIDE_STYLE_KEYS,
  TABLE_CELL_STYLE_KEYS,
  TABLE_ROW_STYLE_KEYS,
  TABLE_SECTION_STYLE_KEYS,
  TABLE_STYLE_KEYS,
  TEXT_RUN_STYLE_KEYS,
  TEXT_STYLE_KEYS,
  VIDEO_STYLE_KEYS,
  VIEW_STYLE_KEYS,
  type StyleDeclaration,
} from "../style/types";
import { isTemplateAreaRef, templateRefValue, type SlideTemplateSet } from "../templates";
import { assetEntityId, graphNodeId, styleEntityId } from "./identity";
import { semanticKindForTag, semanticRoleForTag } from "./roles";
import type {
  AssetEntity,
  AssetEntityId,
  GraphNodeId,
  SemanticAuthorGraph,
  SemanticNode,
  SemanticNodeKind,
  SemanticOrigin,
  SemanticRole,
  TableSectionKind,
  SemanticTemplateAreaRef,
  SourceOrigin,
  StyleClassRef,
  StyleEntity,
  StyleEntityId,
} from "./types";

type BuildState = {
  nodes: Map<GraphNodeId, SemanticNode>;
  styles: Map<StyleEntityId, StyleEntity>;
  assets: Map<AssetEntityId, AssetEntity>;
  templates: Map<string, SlideTemplateSet>;
  diagnostics: Diagnostic[];
};

type BuildContext = {
  parentId: GraphNodeId;
  parentMaterial: readonly string[];
  path: string;
  inline: boolean;
  source: SourceOrigin;
  slotOrigins: WeakMap<AuthorTreeNode, SourceSlotOrigin>;
  activeSlot?: SourceSlotOrigin;
  activeSlideTemplate?: string;
  activeSlideTemplates?: SlideTemplateSet;
  directSlideChild?: boolean;
  usedTemplateAreas?: Map<string, string>;
};

type BuildChild = {
  id: GraphNodeId;
  kind: SemanticNodeKind;
};

function isRecord(
  value: AuthorElementPropValue,
): value is Readonly<Record<string, AuthorElementPropValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnProp(props: AuthorElementProps, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, key);
}

function keySegment(key: JsxKey | undefined, index: number): string {
  return key === undefined ? `index:${index}` : `key:${String(key)}`;
}

function sourceName(node: AuthorElementNode): string {
  return node.source.kind === "tag" ? node.source.tag : "slide";
}

function nodeSemanticKind(node: AuthorElementNode): SemanticNodeKind {
  return node.source.kind === "tag" ? semanticKindForTag(node.source.tag) : "slide";
}

function nodeRole(node: AuthorElementNode): SemanticRole | undefined {
  return node.source.kind === "tag" ? semanticRoleForTag(node.source.tag) : { kind: "slide" };
}

function isSlideElement(node: AuthorElementNode): node is AuthorSlideElementNode {
  return node.source.kind === "slide";
}

function isImageElement(node: AuthorElementNode): node is AuthorImageElementNode {
  return node.source.kind === "tag" && node.source.tag === "img";
}

function isVideoElement(node: AuthorElementNode): node is AuthorVideoElementNode {
  return node.source.kind === "tag" && node.source.tag === "video";
}

function isShapeElement(node: AuthorElementNode): node is AuthorShapeElementNode {
  return node.source.kind === "tag" && node.source.tag === "shape";
}

function isTableElement(node: AuthorElementNode): node is AuthorTableElementNode {
  return node.source.kind === "tag" && node.source.tag === "table";
}

function isTableSectionElement(node: AuthorElementNode): node is AuthorTableSectionElementNode {
  return (
    node.source.kind === "tag" &&
    (node.source.tag === "thead" || node.source.tag === "tbody" || node.source.tag === "tfoot")
  );
}

function isTableRowElement(node: AuthorElementNode): node is AuthorTableRowElementNode {
  return node.source.kind === "tag" && node.source.tag === "tr";
}

function isTableCellElement(node: AuthorElementNode): node is AuthorTableCellElementNode {
  return node.source.kind === "tag" && (node.source.tag === "th" || node.source.tag === "td");
}

function templateAreaValueFor(node: AuthorElementNode): AuthorElementPropValue | undefined {
  return "area" in node.props ? node.props.area : undefined;
}

function supportedPropNamesFor(node: AuthorElementNode): ReadonlySet<string> {
  if (node.source.kind === "slide") {
    return new Set(["name", "template", "className", "style"]);
  }

  switch (node.source.tag) {
    case "span":
      return new Set(["className", "style"]);
    case "table":
      return new Set(["className", "style", "area"]);
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
      return new Set(["className", "style"]);
    case "th":
    case "td":
      return new Set(["className", "style", "colspan", "rowspan"]);
    case "img":
      return new Set(["className", "style", "area", "src", "data"]);
    case "video":
      return new Set(["className", "style", "area", "src", "data", "poster", "posterData"]);
    case "shape":
      return new Set(["className", "style", "area", "shape"]);
    default:
      return new Set(["className", "style", "area"]);
  }
}

function supportedStyleNamesFor(node: AuthorElementNode): ReadonlySet<string> {
  if (node.source.kind === "slide") {
    return new Set(SLIDE_STYLE_KEYS);
  }

  switch (node.source.tag) {
    case "span":
      return new Set(TEXT_RUN_STYLE_KEYS);
    case "table":
      return new Set(TABLE_STYLE_KEYS);
    case "thead":
    case "tbody":
    case "tfoot":
      return new Set(TABLE_SECTION_STYLE_KEYS);
    case "tr":
      return new Set(TABLE_ROW_STYLE_KEYS);
    case "th":
    case "td":
      return new Set(TABLE_CELL_STYLE_KEYS);
    case "img":
      return new Set(IMAGE_STYLE_KEYS);
    case "video":
      return new Set(VIDEO_STYLE_KEYS);
    case "shape":
      return new Set(SHAPE_STYLE_KEYS);
    case "p":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return new Set(TEXT_STYLE_KEYS);
    default:
      return new Set(VIEW_STYLE_KEYS);
  }
}

function sourceFor(context: BuildContext): SourceOrigin {
  return context.activeSlot?.source ?? context.source;
}

function contextForNode(node: AuthorTreeNode, context: BuildContext): BuildContext {
  const slot = context.slotOrigins.get(node);
  if (!slot) {
    return context;
  }

  return {
    ...context,
    activeSlot: slot,
    parentMaterial: [...context.parentMaterial, ...slot.identityMaterial],
    path: `${context.path} > slot[${slot.field}]`,
  };
}

function originFor(node: AuthorElementNode, path: string, context: BuildContext): SemanticOrigin {
  return {
    kind: "authored",
    path,
    source: sourceFor(context),
    ...(node.sourceSpan ? { sourceSpan: node.sourceSpan } : {}),
  };
}

function textOriginFor(node: AuthorTextLeaf, path: string, context: BuildContext): SemanticOrigin {
  return {
    kind: "authored",
    path,
    source: sourceFor(context),
    ...(node.sourceSpan ? { sourceSpan: node.sourceSpan } : {}),
  };
}

function collectClassNames(value: AuthorElementPropValue, names: string[]): void {
  if (value === false || value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    names.push(...value.trim().split(/\s+/).filter(Boolean));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectClassNames(item, names));
    return;
  }

  if (isRecord(value)) {
    Object.entries(value).forEach(([name, enabled]) => {
      if (enabled === true) {
        collectClassNames(name, names);
      }
    });
  }
}

function classRefsFor(value: AuthorElementPropValue): readonly StyleClassRef[] | undefined {
  const names: string[] = [];
  collectClassNames(value, names);
  return names.length === 0 ? undefined : names.map((name, index) => ({ name, index }));
}

function sourceKeyFor(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

function mergedAuthoredStyle(props: AuthorElementProps): StyleDeclaration | undefined {
  const inlineStyle = props.style;

  return isRecord(inlineStyle) ? Object.fromEntries(Object.entries(inlineStyle)) : undefined;
}

function styleRefFor(
  state: BuildState,
  idMaterial: readonly string[],
  target: SemanticNodeKind,
  props: AuthorElementProps,
): StyleEntityId | undefined {
  const style = mergedAuthoredStyle(props);
  const classRefs = classRefsFor(props.className);

  if (style === undefined && classRefs === undefined) {
    return undefined;
  }

  const id = styleEntityId(idMaterial);
  state.styles.set(id, {
    id,
    target,
    authored: {
      ...(style !== undefined ? { style } : {}),
      ...(classRefs !== undefined ? { classRefs } : {}),
    },
  });
  return id;
}

function addDiagnostic(state: BuildState, item: Diagnostic): void {
  state.diagnostics.push(item);
}

function invalidStructure(
  path: string,
  title: string,
  message: string,
  help?: readonly string[],
): Diagnostic {
  return diagnostic({
    severity: "error",
    code: "E_SEMANTIC_STRUCTURE",
    title,
    labels: [{ path, message }],
    ...(message ? { message } : {}),
    ...(help ? { help } : {}),
  });
}

function authoringPropDiagnostic(input: {
  code: string;
  title: string;
  path: string;
  message: string;
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: input.code,
    title: input.title,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    ...(input.help ? { help: input.help } : {}),
  });
}

function videoPosterMissingDiagnostic(input: { path: string }): Diagnostic {
  return diagnostic({
    severity: "warning",
    code: "W_COMPILE_VIDEO_POSTER_MISSING",
    title: "video poster is missing",
    message:
      "Video nodes without poster or posterData may render with a black placeholder until the playback renderer loads the media.",
    labels: [
      {
        path: `${input.path}.props`,
        message: "Add poster or posterData when the first visual frame matters.",
      },
    ],
    help: [
      "The video is still included as playable media; this warning only covers the static placeholder.",
    ],
  });
}

function unsupportedStylePropDiagnostic(input: {
  path: string;
  property: string;
  tag: string;
}): Diagnostic {
  return diagnostic({
    severity: "warning",
    code: "W_COMPILE_UNSUPPORTED_STYLE_PROP",
    title: "unsupported style property",
    message: `Style property "${input.property}" is not supported by the deckjsx CSS-like style subset for ${input.tag}.`,
    labels: [
      {
        path: input.path,
        message: `${input.property} is outside the supported deckjsx style property subset.`,
      },
    ],
    help: [
      "Use a supported deckjsx style key, or keep this value in your own data layer until deckjsx adds that CSS property.",
    ],
  });
}

function validateAuthoringProps(state: BuildState, node: AuthorElementNode, path: string): void {
  const supported = supportedPropNamesFor(node);
  const propPath = node.source.kind === "slide" ? `${path}.options` : `${path}.props`;
  for (const key of Object.keys(node.props)) {
    if (!supported.has(key)) {
      const target = node.source.kind === "slide" ? "slide declaration option" : "authoring prop";
      addDiagnostic(
        state,
        authoringPropDiagnostic({
          code: "E_COMPILE_UNSUPPORTED_AUTHORING_PROP",
          title: `unsupported ${target}`,
          path: `${propPath}.${key}`,
          message: `${key} is not supported in the current deckjsx authoring interface.`,
        }),
      );
    }
  }

  if (hasOwnProp(node.props, "style")) {
    const style = node.props.style;
    if (style !== undefined && !isRecord(style)) {
      addDiagnostic(
        state,
        authoringPropDiagnostic({
          code: "E_COMPILE_INVALID_STYLE_PROP",
          title: "style prop is invalid",
          path: `${propPath}.style`,
          message: "The style prop must be an object when it is provided.",
        }),
      );
    }

    if (isRecord(style)) {
      const supportedStyleNames = supportedStyleNamesFor(node);
      const tag = sourceName(node);
      Object.keys(style).forEach((key) => {
        if (supportedStyleNames.has(key)) {
          return;
        }

        addDiagnostic(
          state,
          unsupportedStylePropDiagnostic({
            path: `${propPath}.style.${key}`,
            property: key,
            tag,
          }),
        );
      });
    }
  }

  if (isShapeElement(node) && node.props.shape !== undefined) {
    if (
      node.props.shape !== "rect" &&
      node.props.shape !== "ellipse" &&
      node.props.shape !== "line"
    ) {
      addDiagnostic(
        state,
        authoringPropDiagnostic({
          code: "E_COMPILE_INVALID_SHAPE_PROP",
          title: "shape prop is invalid",
          path: `${propPath}.shape`,
          message: "The shape prop must be rect, ellipse, or line.",
        }),
      );
    }
  }

  if (isSlideElement(node)) {
    if (node.props.name !== undefined && typeof node.props.name !== "string") {
      addDiagnostic(
        state,
        authoringPropDiagnostic({
          code: "E_COMPILE_INVALID_SLIDE_NAME_OPTION",
          title: "slide name option is invalid",
          path: `${propPath}.name`,
          message: "The slide declaration name option must be a string when it is provided.",
        }),
      );
    }

    if (node.props.template !== undefined && typeof node.props.template !== "string") {
      addDiagnostic(
        state,
        authoringPropDiagnostic({
          code: "E_COMPILE_INVALID_SLIDE_TEMPLATE_OPTION",
          title: "slide template option is invalid",
          path: `${propPath}.template`,
          message: "The slide declaration template option must be a template name string.",
        }),
      );
    }
  }

  if (isTableCellElement(node)) {
    for (const key of ["colspan", "rowspan"] as const) {
      const value = node.props[key];
      if (value === undefined) {
        continue;
      }

      if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        addDiagnostic(
          state,
          authoringPropDiagnostic({
            code: "E_COMPILE_INVALID_TABLE_SPAN_PROP",
            title: "table cell span prop is invalid",
            path: `${propPath}.${key}`,
            message: `${key} must be a positive integer when it is provided.`,
          }),
        );
      }
    }
  }
}

function assetForImage(
  state: BuildState,
  idMaterial: readonly string[],
  props: ImageNodeProps,
  path: string,
): AssetEntityId | undefined {
  const hasSrc = props.src !== undefined;
  const hasData = props.data !== undefined;

  if (hasSrc && typeof props.src !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        title: "image src prop is invalid",
        path: `${path}.props.src`,
        message: "The img src prop must be a string when it is provided.",
      }),
    );
    return undefined;
  }

  if (hasData && typeof props.data !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
        title: "image data prop is invalid",
        path: `${path}.props.data`,
        message: "The img data prop must be a string when it is provided.",
      }),
    );
    return undefined;
  }

  if (typeof props.src === "string" && typeof props.data === "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_AMBIGUOUS_IMAGE_SOURCE_PROP",
        title: "image source props are ambiguous",
        path: `${path}.props`,
        message: "Use either img src or img data, not both.",
      }),
    );
    return undefined;
  }

  if (typeof props.src !== "string" && typeof props.data !== "string") {
    addDiagnostic(
      state,
      invalidStructure(path, "image source is missing", "Image nodes require either src or data.", [
        "Add a src path or data URL to the image.",
      ]),
    );
    return undefined;
  }

  let source: AssetEntity["source"];
  if (typeof props.src === "string" && /^https?:\/\//i.test(props.src)) {
    source = { kind: "url", url: props.src };
  } else if (typeof props.src === "string") {
    source = { kind: "path", path: props.src };
  } else if (typeof props.data === "string") {
    source = { kind: "data", data: props.data };
  } else {
    return undefined;
  }
  const id = assetEntityId(idMaterial);
  const entity: AssetEntity = {
    id,
    kind: "image",
    source,
    metadata:
      typeof props.data === "string" && props.data.startsWith("data:")
        ? { mediaType: props.data.slice(5, props.data.indexOf(";")) || undefined }
        : {},
    resolution: "unresolved",
  };
  state.assets.set(id, entity);
  return id;
}

function mediaSourceFromString(value: string): AssetEntity["source"] {
  if (/^https?:\/\//i.test(value)) {
    return { kind: "url", url: value };
  }

  return { kind: "path", path: value };
}

function dataMediaType(value: string): string | undefined {
  const commaIndex = value.indexOf(",");
  if (!value.startsWith("data:") || commaIndex === -1) {
    return undefined;
  }

  const metadata = value.slice(5, commaIndex);
  return metadata ? metadata.replace(/;base64$/, "") : undefined;
}

function assetForVideoSource(input: {
  state: BuildState;
  idMaterial: readonly string[];
  props: Pick<VideoNodeProps, "data" | "src">;
  path: string;
}): AssetEntityId | undefined {
  const { state, props, path } = input;
  const hasSrc = props.src !== undefined;
  const hasData = props.data !== undefined;

  if (hasSrc && typeof props.src !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_SOURCE_INVALID",
        title: "video src prop is invalid",
        path: `${path}.props.src`,
        message: "The video src prop must be a string when it is provided.",
      }),
    );
    return undefined;
  }

  if (hasData && typeof props.data !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_SOURCE_INVALID",
        title: "video data prop is invalid",
        path: `${path}.props.data`,
        message: "The video data prop must be a string when it is provided.",
      }),
    );
    return undefined;
  }

  if (typeof props.src === "string" && typeof props.data === "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_SOURCE_INVALID",
        title: "video source props are ambiguous",
        path: `${path}.props`,
        message: "Use either video src or video data, not both.",
      }),
    );
    return undefined;
  }

  if (typeof props.src !== "string" && typeof props.data !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_SOURCE_INVALID",
        title: "video source is missing",
        path: `${path}.props`,
        message: "Video nodes require either src or data.",
        help: ["Add a src path or data URI to the video."],
      }),
    );
    return undefined;
  }

  let source: AssetEntity["source"];
  if (typeof props.src === "string") {
    source = mediaSourceFromString(props.src);
  } else {
    const data = props.data;
    if (typeof data !== "string") {
      return undefined;
    }
    source = { kind: "data", data };
  }
  const id = assetEntityId(input.idMaterial);
  state.assets.set(id, {
    id,
    kind: "video",
    source,
    metadata: source.kind === "data" ? { mediaType: dataMediaType(source.data) } : {},
    resolution: "unresolved",
  });
  return id;
}

function assetForVideoPoster(
  state: BuildState,
  idMaterial: readonly string[],
  props: VideoNodeProps,
  path: string,
): AssetEntityId | undefined {
  const hasPoster = props.poster !== undefined;
  const hasPosterData = props.posterData !== undefined;

  if (!hasPoster && !hasPosterData) {
    return undefined;
  }

  if (hasPoster && typeof props.poster !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_POSTER_INVALID",
        title: "video poster prop is invalid",
        path: `${path}.props.poster`,
        message: "The video poster prop must be a string when it is provided.",
      }),
    );
    return undefined;
  }

  if (hasPosterData && typeof props.posterData !== "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_POSTER_INVALID",
        title: "video posterData prop is invalid",
        path: `${path}.props.posterData`,
        message: "The video posterData prop must be a string when it is provided.",
      }),
    );
    return undefined;
  }

  if (typeof props.poster === "string" && typeof props.posterData === "string") {
    addDiagnostic(
      state,
      authoringPropDiagnostic({
        code: "E_COMPILE_VIDEO_POSTER_INVALID",
        title: "video poster props are ambiguous",
        path: `${path}.props`,
        message: "Use either video poster or video posterData, not both.",
      }),
    );
    return undefined;
  }

  let source: AssetEntity["source"];
  if (typeof props.poster === "string") {
    source = mediaSourceFromString(props.poster);
  } else {
    const data = props.posterData;
    if (typeof data !== "string") {
      return undefined;
    }
    source = { kind: "data", data };
  }
  const id = assetEntityId(idMaterial);
  state.assets.set(id, {
    id,
    kind: "image",
    source,
    metadata: source.kind === "data" ? { mediaType: dataMediaType(source.data) } : {},
    resolution: "unresolved",
  });
  return id;
}

function semanticBase(
  state: BuildState,
  node: AuthorElementNode,
  id: GraphNodeId,
  kind: SemanticNodeKind,
  path: string,
  material: readonly string[],
  context: BuildContext,
) {
  const styleRef = styleRefFor(state, material, kind, node.props);
  const templateAreaRef = templateAreaRefFor(state, templateAreaValueFor(node), path, context);
  return {
    id,
    kind,
    origin: originFor(node, path, context),
    ...(node.source.kind === "tag" ? { authoredTag: node.source.tag } : {}),
    ...(node.key !== undefined ? { key: node.key } : {}),
    ...(nodeRole(node) ? { role: nodeRole(node) } : {}),
    ...(styleRef ? { styleRef } : {}),
    ...(templateAreaRef ? { templateAreaRef } : {}),
  };
}

function templateAreaDiagnostic(input: {
  code: string;
  title: string;
  path: string;
  message: string;
  help?: readonly string[];
}): Diagnostic {
  return diagnostic({
    severity: "error",
    code: input.code,
    title: input.title,
    message: input.message,
    labels: [{ path: input.path, message: input.message }],
    ...(input.help ? { help: input.help } : {}),
  });
}

function templateAreaRefFor(
  state: BuildState,
  value: AuthorElementPropValue,
  path: string,
  context: BuildContext,
): SemanticTemplateAreaRef | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isTemplateAreaRef(value)) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_AREA_REF_INVALID",
        title: "template area reference is invalid",
        path,
        message: "The area prop must receive a Template Area Reference from the slide factory.",
        help: ["Use area={template.areaName} inside deck.slide({ template }, ...)."],
      }),
    );
    return undefined;
  }

  const ref = templateRefValue(value);
  if (!context.activeSlideTemplate) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_AREA_WITHOUT_TEMPLATE",
        title: "template area used without active template",
        path,
        message: `Template area "${ref.area}" was used on a slide without an active Slide Template.`,
      }),
    );
    return undefined;
  }

  if (ref.template !== context.activeSlideTemplate) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_AREA_REF_MISMATCH",
        title: "template area belongs to another template",
        path,
        message: `Template area "${ref.area}" belongs to Slide Template "${ref.template}", but the active Slide Template is "${context.activeSlideTemplate}".`,
        help: ["Use the template handle passed to this slide factory."],
      }),
    );
    return undefined;
  }

  if (!context.directSlideChild) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_AREA_NESTED",
        title: "template area is nested",
        path,
        message: `Template area "${ref.area}" must be attached to a direct slide child.`,
        help: [
          "Place the area prop on a slide direct child, or wrap nested content in a container.",
        ],
      }),
    );
    return undefined;
  }

  const template = context.activeSlideTemplates?.[ref.template];
  if (!template?.areas?.[ref.area]) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_AREA_NOT_FOUND",
        title: "template area was not found",
        path,
        message: `Template area "${ref.area}" does not exist in Slide Template "${ref.template}".`,
      }),
    );
    return undefined;
  }

  const existing = context.usedTemplateAreas?.get(ref.area);
  if (existing) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_AREA_DUPLICATE",
        title: "template area is used more than once",
        path,
        message: `Template area "${ref.area}" is already used by ${existing}.`,
        help: ["Wrap multiple elements in a single container that carries the area prop."],
      }),
    );
    return undefined;
  }

  context.usedTemplateAreas?.set(ref.area, path);
  return ref;
}

function buildTextRunFromLeaf(
  state: BuildState,
  leaf: AuthorTextLeaf,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  const text = typeof leaf.value === "string" ? leaf.value : String(leaf.value);
  if (text.trim().length === 0) {
    return undefined;
  }

  const segment = `text:${index}`;
  const material = [...context.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${context.path} > text[${index}]`;
  state.nodes.set(id, {
    id,
    kind: "textRun",
    origin: textOriginFor(leaf, path, context),
    text,
  });
  return { id, kind: "textRun" };
}

function buildImplicitTextNode(
  state: BuildState,
  leaf: AuthorTextLeaf,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  const run = buildTextRunFromLeaf(
    state,
    leaf,
    {
      ...context,
      parentMaterial: [...context.parentMaterial, `implicit-text:${index}`],
      path: `${context.path} > implicitText[${index}]`,
    },
    0,
  );

  if (!run) {
    return undefined;
  }

  const material = [...context.parentMaterial, `implicit-text:${index}`];
  const id = graphNodeId(material);
  state.nodes.set(id, {
    id,
    kind: "text",
    origin: {
      kind: "implicit",
      path: `${context.path} > implicitText[${index}]`,
      source: sourceFor(context),
      ...(leaf.sourceSpan ? { sourceSpan: leaf.sourceSpan } : {}),
      reason: "primitive-text-in-container",
    },
    implicit: true,
    inlineChildren: [run.id],
  });
  return { id, kind: "text" };
}

function buildChildren(
  state: BuildState,
  children: readonly AuthorTreeNode[],
  context: BuildContext,
): GraphNodeId[] {
  const ids: GraphNodeId[] = [];

  children.forEach((child, index) => {
    if (child.kind === "fragment") {
      const childContext = contextForNode(child, context);
      const segment = `fragment:${keySegment(child.key, index)}`;
      ids.push(
        ...buildChildren(state, child.children, {
          ...childContext,
          parentMaterial: [...childContext.parentMaterial, segment],
          path: `${childContext.path} > fragment[${keySegment(child.key, index)}]`,
        }),
      );
      return;
    }

    const built = buildNode(state, child, context, index);
    if (built) {
      ids.push(built.id);
    }
  });

  return ids;
}

function buildTextLikeNode(
  state: BuildState,
  node: AuthorElementNode,
  id: GraphNodeId,
  path: string,
  material: readonly string[],
  context: BuildContext,
): BuildChild {
  const inlineChildren: GraphNodeId[] = [];

  node.children.forEach((child, index) => {
    if (child.kind === "text") {
      const run = buildTextRunFromLeaf(
        state,
        child,
        {
          ...context,
          parentId: id,
          parentMaterial: material,
          path,
          inline: true,
          directSlideChild: false,
        },
        index,
      );
      if (run) {
        inlineChildren.push(run.id);
      }
      return;
    }

    if (child.kind === "fragment") {
      const childContext = contextForNode(child, {
        ...context,
        parentId: id,
        parentMaterial: material,
        path,
        inline: true,
        directSlideChild: false,
      });
      const segment = `fragment:${keySegment(child.key, index)}`;
      inlineChildren.push(
        ...buildChildren(state, child.children, {
          ...childContext,
          parentMaterial: [...childContext.parentMaterial, segment],
          path: `${childContext.path} > fragment[${keySegment(child.key, index)}]`,
        }),
      );
      return;
    }

    if (child.source.kind === "tag" && child.source.tag === "span") {
      const built = buildNode(
        state,
        child,
        {
          ...context,
          parentId: id,
          parentMaterial: material,
          path,
          inline: true,
          directSlideChild: false,
        },
        index,
      );
      if (built) {
        inlineChildren.push(built.id);
      }
      return;
    }

    addDiagnostic(
      state,
      invalidStructure(
        `${path} > ${sourceName(child)}[${index}]`,
        "block content cannot appear inside text",
        "Text-like elements accept primitive text and inline spans only.",
      ),
    );
  });

  state.nodes.set(id, {
    ...semanticBase(state, node, id, "text", path, material, context),
    kind: "text",
    inlineChildren,
  });
  return { id, kind: "text" };
}

function collectInlineText(
  state: BuildState,
  children: readonly AuthorTreeNode[],
  path: string,
): string {
  let text = "";

  children.forEach((child, index) => {
    if (child.kind === "text") {
      text += typeof child.value === "string" ? child.value : String(child.value);
      return;
    }

    if (child.kind === "fragment") {
      text += collectInlineText(
        state,
        child.children,
        `${path} > fragment[${keySegment(child.key, index)}]`,
      );
      return;
    }

    if (child.source.kind === "tag" && child.source.tag === "span") {
      text += collectInlineText(
        state,
        child.children,
        `${path} > span[${keySegment(child.key, index)}]`,
      );
      return;
    }

    addDiagnostic(
      state,
      invalidStructure(
        `${path} > ${sourceName(child)}[${index}]`,
        "block content cannot appear inside span",
        "span accepts primitive text or nested inline spans only.",
      ),
    );
  });

  return text;
}

type TableRowBuildInput = {
  node: AuthorTableRowElementNode;
  index: number;
};

function tableSectionKindFor(node: AuthorTableSectionElementNode): TableSectionKind {
  switch (node.source.tag) {
    case "thead":
      return "head";
    case "tfoot":
      return "foot";
    case "tbody":
      return "body";
  }
}

function positiveIntegerProp(value: AuthorElementPropValue): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function buildTableCellNode(
  state: BuildState,
  node: AuthorTableCellElementNode,
  context: BuildContext,
  index: number,
): BuildChild {
  const nodeContext = contextForNode(node, context);
  const segment = `${sourceName(node)}:${keySegment(node.key, index)}`;
  const material = [...nodeContext.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${nodeContext.path} > ${sourceName(node)}[${keySegment(node.key, index)}]`;

  validateAuthoringProps(state, node, path);
  const childIds = buildChildren(state, node.children, {
    parentId: id,
    parentMaterial: material,
    path,
    inline: false,
    source: sourceFor(nodeContext),
    slotOrigins: nodeContext.slotOrigins,
    activeSlot: nodeContext.activeSlot,
    activeSlideTemplate: nodeContext.activeSlideTemplate,
    activeSlideTemplates: nodeContext.activeSlideTemplates,
    directSlideChild: false,
    usedTemplateAreas: nodeContext.usedTemplateAreas,
  });

  state.nodes.set(id, {
    ...semanticBase(state, node, id, "tableCell", path, material, nodeContext),
    kind: "tableCell",
    cellKind: node.source.tag === "th" ? "header" : "data",
    colSpan: positiveIntegerProp(node.props.colspan) ?? 1,
    rowSpan: positiveIntegerProp(node.props.rowspan) ?? 1,
    children: childIds,
  });
  return { id, kind: "tableCell" };
}

function buildTableRowCellChildren(
  state: BuildState,
  children: readonly AuthorTreeNode[],
  context: BuildContext,
): GraphNodeId[] {
  const ids: GraphNodeId[] = [];

  children.forEach((child, index) => {
    if (child.kind === "text") {
      if (String(child.value).trim().length > 0) {
        addDiagnostic(
          state,
          invalidStructure(
            `${context.path} > text[${index}]`,
            "invalid table row child",
            "tr accepts th and td cells only.",
          ),
        );
      }
      return;
    }

    if (child.kind === "fragment") {
      const childContext = contextForNode(child, context);
      const segment = `fragment:${keySegment(child.key, index)}`;
      ids.push(
        ...buildTableRowCellChildren(state, child.children, {
          ...childContext,
          parentMaterial: [...childContext.parentMaterial, segment],
          path: `${childContext.path} > fragment[${keySegment(child.key, index)}]`,
        }),
      );
      return;
    }

    if (!isTableCellElement(child)) {
      addDiagnostic(
        state,
        invalidStructure(
          `${context.path} > ${sourceName(child)}[${index}]`,
          "invalid table row child",
          "tr accepts th and td cells only.",
        ),
      );
      return;
    }

    ids.push(buildTableCellNode(state, child, context, index).id);
  });

  return ids;
}

function buildTableRowNode(
  state: BuildState,
  node: AuthorTableRowElementNode,
  context: BuildContext,
  index: number,
): BuildChild {
  const nodeContext = contextForNode(node, context);
  const segment = `${sourceName(node)}:${keySegment(node.key, index)}`;
  const material = [...nodeContext.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${nodeContext.path} > ${sourceName(node)}[${keySegment(node.key, index)}]`;

  validateAuthoringProps(state, node, path);
  const childIds = buildTableRowCellChildren(state, node.children, {
    ...nodeContext,
    parentId: id,
    parentMaterial: material,
    path,
    inline: false,
    source: sourceFor(nodeContext),
    directSlideChild: false,
  });

  state.nodes.set(id, {
    ...semanticBase(state, node, id, "tableRow", path, material, nodeContext),
    kind: "tableRow",
    children: childIds,
  });
  return { id, kind: "tableRow" };
}

function buildAuthoredTableSectionNode(
  state: BuildState,
  node: AuthorTableSectionElementNode,
  context: BuildContext,
  index: number,
): BuildChild {
  const nodeContext = contextForNode(node, context);
  const segment = `${sourceName(node)}:${keySegment(node.key, index)}`;
  const material = [...nodeContext.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${nodeContext.path} > ${sourceName(node)}[${keySegment(node.key, index)}]`;

  validateAuthoringProps(state, node, path);
  const rowIds: GraphNodeId[] = [];
  node.children.forEach((child, childIndex) => {
    if (child.kind === "text") {
      if (String(child.value).trim().length > 0) {
        addDiagnostic(
          state,
          invalidStructure(
            `${path} > text[${childIndex}]`,
            "invalid table section child",
            "Table sections accept tr children only.",
          ),
        );
      }
      return;
    }

    if (child.kind === "fragment") {
      const childContext = contextForNode(child, {
        ...nodeContext,
        parentId: id,
        parentMaterial: material,
        path,
        inline: false,
        source: sourceFor(nodeContext),
      });
      const fragmentSegment = `fragment:${keySegment(child.key, childIndex)}`;
      rowIds.push(
        ...buildTableSectionRows(state, child.children, {
          ...childContext,
          parentMaterial: [...childContext.parentMaterial, fragmentSegment],
          path: `${childContext.path} > fragment[${keySegment(child.key, childIndex)}]`,
        }),
      );
      return;
    }

    if (!isTableRowElement(child)) {
      addDiagnostic(
        state,
        invalidStructure(
          `${path} > ${sourceName(child)}[${childIndex}]`,
          "invalid table section child",
          "Table sections accept tr children only.",
        ),
      );
      return;
    }

    rowIds.push(
      buildTableRowNode(
        state,
        child,
        {
          ...nodeContext,
          parentId: id,
          parentMaterial: material,
          path,
          inline: false,
          source: sourceFor(nodeContext),
          directSlideChild: false,
        },
        childIndex,
      ).id,
    );
  });

  state.nodes.set(id, {
    ...semanticBase(state, node, id, "tableSection", path, material, nodeContext),
    kind: "tableSection",
    sectionKind: tableSectionKindFor(node),
    children: rowIds,
  });
  return { id, kind: "tableSection" };
}

function buildTableSectionRows(
  state: BuildState,
  children: readonly AuthorTreeNode[],
  context: BuildContext,
): GraphNodeId[] {
  const ids: GraphNodeId[] = [];
  children.forEach((child, index) => {
    if (child.kind === "text") {
      if (String(child.value).trim().length > 0) {
        addDiagnostic(
          state,
          invalidStructure(
            `${context.path} > text[${index}]`,
            "invalid table section child",
            "Table sections accept tr children only.",
          ),
        );
      }
      return;
    }

    if (child.kind === "fragment") {
      const childContext = contextForNode(child, context);
      const segment = `fragment:${keySegment(child.key, index)}`;
      ids.push(
        ...buildTableSectionRows(state, child.children, {
          ...childContext,
          parentMaterial: [...childContext.parentMaterial, segment],
          path: `${childContext.path} > fragment[${keySegment(child.key, index)}]`,
        }),
      );
      return;
    }

    if (!isTableRowElement(child)) {
      addDiagnostic(
        state,
        invalidStructure(
          `${context.path} > ${sourceName(child)}[${index}]`,
          "invalid table section child",
          "Table sections accept tr children only.",
        ),
      );
      return;
    }

    ids.push(buildTableRowNode(state, child, context, index).id);
  });
  return ids;
}

function buildImplicitTableBodySection(input: {
  state: BuildState;
  rows: readonly TableRowBuildInput[];
  context: BuildContext;
  index: number;
}): BuildChild {
  const { state, rows, context, index } = input;
  const segment = `tbody:implicit:${index}`;
  const material = [...context.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${context.path} > tbody[implicit:${index}]`;
  const rowIds = rows.map(
    (row) =>
      buildTableRowNode(
        state,
        row.node,
        {
          ...context,
          parentId: id,
          parentMaterial: material,
          path,
          inline: false,
          directSlideChild: false,
        },
        row.index,
      ).id,
  );

  state.nodes.set(id, {
    id,
    kind: "tableSection",
    origin: {
      kind: "implicit",
      path,
      source: sourceFor(context),
      reason: "table-row-shorthand",
    },
    role: { kind: "tableSection", sectionKind: "body" },
    sectionKind: "body",
    children: rowIds,
  });
  return { id, kind: "tableSection" };
}

function buildTableNode(
  state: BuildState,
  node: AuthorTableElementNode,
  id: GraphNodeId,
  path: string,
  material: readonly string[],
  context: BuildContext,
): BuildChild {
  const sectionIds: GraphNodeId[] = [];
  const implicitRows: TableRowBuildInput[] = [];
  let implicitSectionIndex = 0;
  let seenHead = false;
  let seenFoot = false;
  let phase: TableSectionKind | undefined;

  const reportOrder = (sectionKind: TableSectionKind, sectionPath: string): void => {
    const invalid =
      (sectionKind === "head" && (seenHead || phase !== undefined)) ||
      (sectionKind === "body" && seenFoot) ||
      (sectionKind === "foot" && seenFoot);

    if (invalid) {
      addDiagnostic(
        state,
        invalidStructure(
          sectionPath,
          "invalid table section order",
          "Table sections must be ordered as thead, zero or more tbody sections, then tfoot.",
        ),
      );
    }

    if (sectionKind === "head") {
      seenHead = true;
      phase = "head";
      return;
    }

    if (sectionKind === "body") {
      phase = "body";
      return;
    }

    seenFoot = true;
    phase = "foot";
  };

  const flushImplicitRows = (): void => {
    if (implicitRows.length === 0) {
      return;
    }

    reportOrder("body", `${path} > tbody[implicit:${implicitSectionIndex}]`);
    sectionIds.push(
      buildImplicitTableBodySection({
        state,
        rows: implicitRows.splice(0, implicitRows.length),
        context: {
          ...context,
          parentId: id,
          parentMaterial: material,
          path,
          inline: false,
          directSlideChild: false,
        },
        index: implicitSectionIndex,
      }).id,
    );
    implicitSectionIndex += 1;
  };

  node.children.forEach((child, index) => {
    if (child.kind === "text") {
      if (String(child.value).trim().length > 0) {
        addDiagnostic(
          state,
          invalidStructure(
            `${path} > text[${index}]`,
            "invalid table child",
            "table accepts thead, tbody, tfoot, or tr children only.",
          ),
        );
      }
      return;
    }

    if (child.kind === "fragment") {
      flushImplicitRows();
      addDiagnostic(
        state,
        invalidStructure(
          `${path} > fragment[${keySegment(child.key, index)}]`,
          "invalid table child",
          "table accepts thead, tbody, tfoot, or tr children only.",
        ),
      );
      return;
    }

    if (isTableRowElement(child)) {
      implicitRows.push({ node: child, index });
      return;
    }

    flushImplicitRows();
    if (!isTableSectionElement(child)) {
      addDiagnostic(
        state,
        invalidStructure(
          `${path} > ${sourceName(child)}[${index}]`,
          "invalid table child",
          "table accepts thead, tbody, tfoot, or tr children only.",
        ),
      );
      return;
    }

    const sectionKind = tableSectionKindFor(child);
    reportOrder(sectionKind, `${path} > ${sourceName(child)}[${keySegment(child.key, index)}]`);
    sectionIds.push(
      buildAuthoredTableSectionNode(
        state,
        child,
        {
          ...context,
          parentId: id,
          parentMaterial: material,
          path,
          inline: false,
          source: sourceFor(context),
          directSlideChild: false,
        },
        index,
      ).id,
    );
  });

  flushImplicitRows();
  state.nodes.set(id, {
    ...semanticBase(state, node, id, "table", path, material, context),
    kind: "table",
    children: sectionIds,
  });
  return { id, kind: "table" };
}

function buildNode(
  state: BuildState,
  node: AuthorTreeNode,
  context: BuildContext,
  index: number,
): BuildChild | undefined {
  const nodeContext = contextForNode(node, context);

  if (node.kind === "fragment") {
    return undefined;
  }

  if (node.kind === "text") {
    return nodeContext.inline
      ? buildTextRunFromLeaf(state, node, nodeContext, index)
      : buildImplicitTextNode(state, node, nodeContext, index);
  }

  const kind = nodeSemanticKind(node);
  const segment = `${sourceName(node)}:${keySegment(node.key, index)}`;
  const material = [...nodeContext.parentMaterial, segment];
  const id = graphNodeId(material);
  const path = `${nodeContext.path} > ${sourceName(node)}[${keySegment(node.key, index)}]`;
  validateAuthoringProps(state, node, path);

  if (kind === "textRun") {
    if (!context.inline) {
      addDiagnostic(
        state,
        invalidStructure(
          path,
          "span cannot appear here",
          "span must be inside a text-like element.",
          ["Wrap the span in <p>...</p> or move it inside an existing text element."],
        ),
      );
      return undefined;
    }

    const text = collectInlineText(state, node.children, path);
    state.nodes.set(id, {
      ...semanticBase(state, node, id, "textRun", path, material, nodeContext),
      kind: "textRun",
      text,
    });
    return { id, kind: "textRun" };
  }

  if (kind === "text") {
    return buildTextLikeNode(state, node, id, path, material, nodeContext);
  }

  if (isTableElement(node)) {
    return buildTableNode(state, node, id, path, material, nodeContext);
  }

  if (isTableSectionElement(node) || isTableRowElement(node) || isTableCellElement(node)) {
    addDiagnostic(
      state,
      invalidStructure(
        path,
        "table part cannot appear here",
        "thead, tbody, tfoot, tr, th, and td must appear inside a table hierarchy.",
      ),
    );
    return undefined;
  }

  if (isImageElement(node)) {
    if (node.children.length > 0) {
      addDiagnostic(
        state,
        invalidStructure(path, "image cannot have children", "Image nodes are leaf nodes."),
      );
    }

    const assetRef = assetForImage(state, material, node.props, path);
    state.nodes.set(id, {
      ...semanticBase(state, node, id, "image", path, material, nodeContext),
      kind: "image",
      ...(assetRef ? { assetRef } : {}),
    });
    return { id, kind: "image" };
  }

  if (isVideoElement(node)) {
    if (node.children.length > 0) {
      addDiagnostic(
        state,
        invalidStructure(path, "video cannot have children", "Video nodes are leaf nodes."),
      );
    }

    const assetRef = assetForVideoSource({
      state,
      idMaterial: material,
      props: node.props,
      path,
    });
    const posterAssetRef = assetForVideoPoster(state, [...material, "poster"], node.props, path);
    if (node.props.poster === undefined && node.props.posterData === undefined) {
      addDiagnostic(state, videoPosterMissingDiagnostic({ path }));
    }
    state.nodes.set(id, {
      ...semanticBase(state, node, id, "video", path, material, nodeContext),
      kind: "video",
      ...(assetRef ? { assetRef } : {}),
      ...(posterAssetRef ? { posterAssetRef } : {}),
    });
    return { id, kind: "video" };
  }

  if (isShapeElement(node)) {
    state.nodes.set(id, {
      ...semanticBase(state, node, id, "shape", path, material, nodeContext),
      kind: "shape",
      shape:
        node.props.shape === "ellipse" || node.props.shape === "line" ? node.props.shape : "rect",
    });
    return { id, kind: "shape" };
  }

  const slideTemplateName =
    isSlideElement(node) && typeof node.props.template === "string"
      ? node.props.template
      : undefined;
  const slideTemplates = isSlideElement(node)
    ? state.templates.get(sourceKeyFor(sourceFor(nodeContext)))
    : undefined;
  if (isSlideElement(node) && slideTemplateName && !slideTemplates?.[slideTemplateName]) {
    addDiagnostic(
      state,
      templateAreaDiagnostic({
        code: "E_TEMPLATE_NOT_FOUND",
        title: "slide template was not found",
        path,
        message: `Slide Template "${slideTemplateName}" is not defined for this Deck source.`,
      }),
    );
  }

  const childIds = buildChildren(state, node.children, {
    parentId: id,
    parentMaterial: material,
    path,
    inline: false,
    source: sourceFor(nodeContext),
    slotOrigins: nodeContext.slotOrigins,
    activeSlot: nodeContext.activeSlot,
    activeSlideTemplate: slideTemplateName ?? nodeContext.activeSlideTemplate,
    activeSlideTemplates: isSlideElement(node) ? slideTemplates : nodeContext.activeSlideTemplates,
    directSlideChild: isSlideElement(node),
    usedTemplateAreas: isSlideElement(node) ? new Map() : nodeContext.usedTemplateAreas,
  });
  state.nodes.set(id, {
    ...semanticBase(state, node, id, kind, path, material, nodeContext),
    kind,
    ...(isSlideElement(node) && typeof node.props.name === "string"
      ? { name: node.props.name }
      : {}),
    ...(isSlideElement(node) && slideTemplateName
      ? { templateRef: { name: slideTemplateName } }
      : {}),
    children: childIds,
  } as SemanticNode);
  return { id, kind };
}

function rootSource(): SourceOrigin {
  return { kind: "root" };
}

function asComposedRoot(root: AuthorTreeNode, index: number): ComposedAuthorRoot {
  if (root.kind !== "element") {
    throw new Error("Semantic graph roots must be element nodes.");
  }

  return {
    root,
    source: rootSource(),
    sourceIdentityMaterial: ["source", "root"],
    stylesheets: [],
    path: `document > slideFactory[${index}]`,
    composition: {
      slideIndex: index,
      totalSlides: 0,
      deckSlideIndex: index,
      deckTotalSlides: 0,
    },
    slotOrigins: new WeakMap(),
  };
}

export function buildSemanticAuthorGraph(roots: readonly (AuthorTreeNode | ComposedAuthorRoot)[]): {
  graph?: SemanticAuthorGraph;
  diagnostics: Diagnostics;
} {
  const documentId = graphNodeId(["document", "root"]);
  const state: BuildState = {
    nodes: new Map(),
    styles: new Map(),
    assets: new Map(),
    templates: new Map(),
    diagnostics: [],
  };

  const slideIds: GraphNodeId[] = [];
  roots.forEach((root, index) => {
    const composed = "root" in root ? root : asComposedRoot(root, index);
    if (composed.templates) {
      state.templates.set(sourceKeyFor(composed.source), composed.templates);
    }
    const built = buildNode(
      state,
      composed.root,
      {
        parentId: documentId,
        parentMaterial: ["document", "root", ...composed.sourceIdentityMaterial],
        path: composed.path,
        inline: false,
        source: composed.source,
        slotOrigins: composed.slotOrigins,
        activeSlideTemplate: undefined,
        activeSlideTemplates: undefined,
        directSlideChild: false,
      },
      composed.composition.slideIndex,
    );

    if (built) {
      slideIds.push(built.id);
    }
  });

  const documentNode: SemanticNode = {
    id: documentId,
    kind: "document",
    origin: { kind: "implicit", path: "document", source: rootSource() },
    role: { kind: "document" },
    children: slideIds,
  };
  state.nodes.set(documentId, documentNode);

  const diagnostics = createDiagnostics(state.diagnostics);
  return {
    graph: {
      documentId,
      nodes: state.nodes,
      styles: state.styles,
      assets: state.assets,
      templates: state.templates,
    },
    diagnostics,
  };
}
