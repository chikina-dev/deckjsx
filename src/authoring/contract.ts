import {
  authorElementPropsFromEntries,
  isAuthorElementPropValue,
  type AuthorElementProps,
  type AuthorElementPropValue,
  type AuthorElementSource,
} from "./tree";
import type { AuthoredTag } from "./tags";

export const PUBLIC_SLIDE_OPTION_NAMES = ["name", "template", "className", "style"] as const;
export const PUBLIC_SHAPE_NAMES = ["rect", "ellipse", "line", "roundRect"] as const;
export const PUBLIC_TABLE_CELL_SPAN_MAX = 64;
export const CLASS_NAME_ARRAY_DEPTH_MAX = 1024;

/** Public geometry names accepted by the authored `shape` prop. */
export type ShapeName = (typeof PUBLIC_SHAPE_NAMES)[number];

/**
 * Public positive integer span accepted by authored table cells.
 *
 * The cap keeps generated table topology predictable and lets TypeScript reject out-of-range
 * authoring before compile diagnostics need to intervene.
 */
export type TableCellSpan =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 39
  | 40
  | 41
  | 42
  | 43
  | 44
  | 45
  | 46
  | 47
  | 48
  | 49
  | 50
  | 51
  | 52
  | 53
  | 54
  | 55
  | 56
  | 57
  | 58
  | 59
  | 60
  | 61
  | 62
  | 63
  | 64;

const PUBLIC_SLIDE_OPTION_NAME_SET: ReadonlySet<string> = new Set(PUBLIC_SLIDE_OPTION_NAMES);
const PUBLIC_SHAPE_NAME_SET: ReadonlySet<string> = new Set(PUBLIC_SHAPE_NAMES);
const CLASS_NAME_WHITESPACE_RE = /\s/;
const CLASS_STYLE_PROP_NAMES: ReadonlySet<string> = new Set(["className", "style"]);
const PLACEABLE_PROP_NAMES: ReadonlySet<string> = new Set(["className", "style", "area"]);
const TABLE_CELL_PROP_NAMES: ReadonlySet<string> = new Set([
  "className",
  "style",
  "colspan",
  "rowspan",
]);
const IMAGE_PROP_NAMES: ReadonlySet<string> = new Set([
  "className",
  "style",
  "area",
  "src",
  "data",
]);
const VIDEO_PROP_NAMES: ReadonlySet<string> = new Set([
  "className",
  "style",
  "area",
  "src",
  "data",
  "poster",
  "posterData",
]);
const SHAPE_PROP_NAMES: ReadonlySet<string> = new Set(["className", "style", "area", "shape"]);

export type ClassNameValidationIssue = {
  readonly code: "E_COMPILE_INVALID_CLASS_NAME_PROP";
  readonly title: "className prop is not part of the public authoring API";
  readonly path: string;
  readonly message: string;
  readonly help: readonly string[];
};

export type ImageSourceValidationIssue =
  | {
      readonly kind: "invalid";
      readonly code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP";
      readonly title: string;
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly code: "E_COMPILE_AMBIGUOUS_IMAGE_SOURCE_PROP";
      readonly title: string;
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly kind: "missing";
      readonly code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP";
      readonly title: string;
      readonly path: string;
      readonly message: string;
      readonly help: readonly string[];
    };

export type VideoSourceValidationIssue =
  | {
      readonly kind: "invalid" | "ambiguous";
      readonly code: "E_COMPILE_VIDEO_SOURCE_INVALID";
      readonly title: string;
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly kind: "missing";
      readonly code: "E_COMPILE_VIDEO_SOURCE_INVALID";
      readonly title: string;
      readonly path: string;
      readonly message: string;
      readonly help: readonly string[];
    };

export type VideoPosterValidationIssue = {
  readonly kind: "invalid" | "ambiguous";
  readonly code: "E_COMPILE_VIDEO_POSTER_INVALID";
  readonly title: string;
  readonly path: string;
  readonly message: string;
};

export type AuthoringPropContractIssue = {
  readonly code: string;
  readonly title: string;
  readonly path: string;
  readonly message: string;
  readonly help?: readonly string[];
};

export function isAuthoringOptionsRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return isAuthoringRecord(value);
}

function isAuthoringRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAuthoringProp(props: AuthorElementProps, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, key);
}

export function supportedSlideOptionNames(): ReadonlySet<string> {
  return PUBLIC_SLIDE_OPTION_NAME_SET;
}

export function supportedPropNamesForAuthoredTag(tag: AuthoredTag): ReadonlySet<string> {
  switch (tag) {
    case "span":
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
      return CLASS_STYLE_PROP_NAMES;
    case "th":
    case "td":
      return TABLE_CELL_PROP_NAMES;
    case "img":
      return IMAGE_PROP_NAMES;
    case "video":
      return VIDEO_PROP_NAMES;
    case "shape":
      return SHAPE_PROP_NAMES;
    default:
      return PLACEABLE_PROP_NAMES;
  }
}

export function isPublicShapeName(value: unknown): value is ShapeName {
  return typeof value === "string" && PUBLIC_SHAPE_NAME_SET.has(value);
}

export function isPublicTableCellSpan(value: unknown): value is TableCellSpan {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= PUBLIC_TABLE_CELL_SPAN_MAX
  );
}

export function classNameStringTokens(value: string): readonly string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

export function isPublicClassNameObjectKey(name: string): boolean {
  return name.trim().length > 0 && !CLASS_NAME_WHITESPACE_RE.test(name);
}

function hasClassNameWhitespace(value: string): boolean {
  return CLASS_NAME_WHITESPACE_RE.test(value);
}

function isPublicClassNameObjectValue(value: unknown): value is boolean | null | undefined {
  return value === true || value === false || value === null || value === undefined;
}

function classNameObjectKeyPath(path: string, name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)
    ? `${path}.${name}`
    : `${path}[${JSON.stringify(name)}]`;
}

function classNameIssue(path: string, message: string): ClassNameValidationIssue {
  return {
    code: "E_COMPILE_INVALID_CLASS_NAME_PROP",
    title: "className prop is not part of the public authoring API",
    path,
    message: `${message} This is not part of the public authoring API.`,
    help: [
      "Use a string, false, null, undefined, an array of className values, or an object map whose values are boolean, null, or undefined.",
    ],
  };
}

export function validateClassNameValueContract(
  value: AuthorElementPropValue,
  path: string,
  visitedArrays: WeakSet<readonly unknown[]> = new WeakSet(),
  depth = 0,
): readonly ClassNameValidationIssue[] {
  if (value === false || value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim().length === 0
      ? [
          classNameIssue(
            path,
            "className string values must contain at least one non-whitespace class token.",
          ),
        ]
      : [];
  }

  if (Array.isArray(value)) {
    if (visitedArrays.has(value)) {
      return [classNameIssue(path, "className arrays must not be cyclic.")];
    }

    if (depth >= CLASS_NAME_ARRAY_DEPTH_MAX) {
      return [classNameIssue(path, "className arrays are too deeply nested.")];
    }

    visitedArrays.add(value);
    const issues = value.flatMap((item, index) =>
      validateClassNameValueContract(
        item as AuthorElementPropValue,
        `${path}[${index}]`,
        visitedArrays,
        depth + 1,
      ),
    );
    visitedArrays.delete(value);
    return issues;
  }

  if (isAuthoringRecord(value)) {
    return Object.entries(value).flatMap(([name, enabled]) => {
      const issues: ClassNameValidationIssue[] = [];
      if (name.trim().length === 0) {
        issues.push(
          classNameIssue(
            classNameObjectKeyPath(path, name),
            "className object map keys must contain at least one non-whitespace class token.",
          ),
        );
      } else if (hasClassNameWhitespace(name)) {
        issues.push(
          classNameIssue(
            classNameObjectKeyPath(path, name),
            "className object map keys must be a single class token without whitespace.",
          ),
        );
      }

      if (!isPublicClassNameObjectValue(enabled)) {
        issues.push(
          classNameIssue(
            classNameObjectKeyPath(path, name),
            "className object map values must be boolean, null, or undefined.",
          ),
        );
      }

      return issues;
    });
  }

  return [
    classNameIssue(
      path,
      "className must be a string, false, null, undefined, an array, or an object map.",
    ),
  ];
}

function nonPublicAuthoringPropHelp(property: string): readonly string[] | undefined {
  if (property === "x" || property === "y") {
    return [
      "Use normal flow, flex, grid, or Template Areas for structural placement.",
      'Use explicit CSS positioning only when fixed placement is required, for example style={{ position: "absolute", left: 1, top: 1 }}.',
    ];
  }

  return undefined;
}

export function validateSupportedAuthoringPropNamesContract(input: {
  readonly props: Readonly<Record<string, unknown>>;
  readonly supported: ReadonlySet<string>;
  readonly propPath: string;
  readonly target: "authoring prop" | "slide declaration option";
}): readonly AuthoringPropContractIssue[] {
  return Object.keys(input.props).flatMap((key) => {
    if (input.supported.has(key)) {
      return [];
    }

    return [
      {
        code: "E_COMPILE_NON_PUBLIC_AUTHORING_PROP",
        title: `${input.target} is not part of the public authoring API`,
        path: `${input.propPath}.${key}`,
        message: `${key} is not part of the public authoring API for this ${input.target}.`,
        help: nonPublicAuthoringPropHelp(key),
      },
    ];
  });
}

export function validateStylePropContract(
  value: unknown,
  propPath: string,
): readonly AuthoringPropContractIssue[] {
  if (value === undefined || isAuthoringRecord(value)) {
    return [];
  }

  return [
    {
      code: "E_COMPILE_INVALID_STYLE_PROP",
      title: "style prop is invalid",
      path: `${propPath}.style`,
      message:
        "The style prop must be an object when it is provided; non-object style values are not part of the public authoring API.",
    },
  ];
}

export function validateShapePropContract(
  props: { readonly shape?: unknown },
  propPath: string,
): readonly AuthoringPropContractIssue[] {
  if (props.shape === undefined || isPublicShapeName(props.shape)) {
    return [];
  }

  return [
    {
      code: "E_COMPILE_INVALID_SHAPE_PROP",
      title: "shape prop is invalid",
      path: `${propPath}.shape`,
      message: `The shape prop must be ${PUBLIC_SHAPE_NAMES.join(", ")}; other values are not part of the public authoring API.`,
    },
  ];
}

export function validateSlideDeclarationOptionsContract(
  props: { readonly name?: unknown; readonly template?: unknown },
  propPath: string,
): readonly AuthoringPropContractIssue[] {
  const issues: AuthoringPropContractIssue[] = [];

  if (props.name !== undefined && typeof props.name !== "string") {
    issues.push({
      code: "E_COMPILE_INVALID_SLIDE_NAME_OPTION",
      title: "slide name option is invalid",
      path: `${propPath}.name`,
      message:
        "The slide declaration name option must be a string when it is provided; other values are not part of the public authoring API.",
    });
  }

  if (props.template !== undefined && typeof props.template !== "string") {
    issues.push({
      code: "E_COMPILE_INVALID_SLIDE_TEMPLATE_OPTION",
      title: "slide template option is invalid",
      path: `${propPath}.template`,
      message:
        "The slide declaration template option must be a template name string; other values are not part of the public authoring API.",
    });
  }

  return issues;
}

export function validateTableCellSpanPropsContract(
  props: { readonly colspan?: unknown; readonly rowspan?: unknown },
  propPath: string,
): readonly AuthoringPropContractIssue[] {
  return (["colspan", "rowspan"] as const).flatMap((key) => {
    const value = props[key];
    if (value === undefined || isPublicTableCellSpan(value)) {
      return [];
    }

    return [
      {
        code: "E_COMPILE_INVALID_TABLE_SPAN_PROP",
        title: "table cell span prop is invalid",
        path: `${propPath}.${key}`,
        message: `${key} must be a positive integer from 1 to ${PUBLIC_TABLE_CELL_SPAN_MAX} when it is provided; other values are not part of the public authoring API.`,
      },
    ];
  });
}

export function validateAuthoringElementPropsContract(input: {
  readonly source: AuthorElementSource;
  readonly props: AuthorElementProps;
  readonly path: string;
}): readonly AuthoringPropContractIssue[] {
  const propPath = input.source.kind === "slide" ? `${input.path}.options` : `${input.path}.props`;
  const supported =
    input.source.kind === "slide"
      ? supportedSlideOptionNames()
      : input.source.kind === "tag"
        ? supportedPropNamesForAuthoredTag(input.source.tag)
        : new Set<string>();
  const target = input.source.kind === "slide" ? "slide declaration option" : "authoring prop";
  const issues: AuthoringPropContractIssue[] = [
    ...validateSupportedAuthoringPropNamesContract({
      props: input.props,
      supported,
      propPath,
      target,
    }),
  ];

  if (hasAuthoringProp(input.props, "className")) {
    issues.push(...validateClassNameValueContract(input.props.className, `${propPath}.className`));
  }

  if (hasAuthoringProp(input.props, "style")) {
    issues.push(...validateStylePropContract(input.props.style, propPath));
  }

  if (input.source.kind === "slide") {
    issues.push(...validateSlideDeclarationOptionsContract(input.props, propPath));
    return issues;
  }

  if (input.source.kind !== "tag") {
    return issues;
  }

  if (input.source.tag === "shape") {
    issues.push(...validateShapePropContract(input.props, propPath));
  }

  if (input.source.tag === "th" || input.source.tag === "td") {
    issues.push(...validateTableCellSpanPropsContract(input.props, propPath));
  }

  return issues;
}

export function validateImageSourceContract(
  props: { readonly src?: unknown; readonly data?: unknown },
  path: string,
): ImageSourceValidationIssue | undefined {
  const hasSrc = props.src !== undefined;
  const hasData = props.data !== undefined;

  if (hasSrc && typeof props.src !== "string") {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The img src prop must be a string when it is provided; other values are not part of the public authoring API.",
    };
  }

  if (hasData && typeof props.data !== "string") {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image data prop is invalid",
      path: `${path}.props.data`,
      message:
        "The img data prop must be a string when it is provided; other values are not part of the public authoring API.",
    };
  }

  if (typeof props.src === "string" && isBlankSourceString(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The img src prop must be a non-empty source path or URL; empty values are not part of the public authoring API.",
    };
  }

  if (typeof props.src === "string" && !isPublicPathSourceString(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The img src prop must not start or end with whitespace; values outside the public source path syntax are not part of the public authoring API.",
    };
  }

  if (typeof props.src === "string" && isInlineDataUriSource(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The img src prop is for paths and HTTP(S) URLs; inline data URIs in src are not part of the public authoring API. Use img data for inline media.",
    };
  }

  if (typeof props.src === "string" && hasNonPublicRemoteImageSourceScheme(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The img src prop accepts local paths and HTTP(S) URLs; other URL schemes are not part of the public authoring API.",
    };
  }

  if (typeof props.data === "string" && !isDataUriSource(props.data)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image data prop is invalid",
      path: `${path}.props.data`,
      message:
        "The img data prop must be an inline data URI with a non-empty media type, subtype, and payload; values outside that shape are not part of the public authoring API. Use img src for file paths.",
    };
  }

  if (typeof props.src === "string" && typeof props.data === "string") {
    return {
      kind: "ambiguous",
      code: "E_COMPILE_AMBIGUOUS_IMAGE_SOURCE_PROP",
      title: "image source props are ambiguous",
      path: `${path}.props`,
      message:
        "Use either img src or img data, not both; providing both source props is not part of the public authoring API.",
    };
  }

  if (typeof props.src !== "string" && typeof props.data !== "string") {
    return {
      kind: "missing",
      code: "E_COMPILE_INVALID_IMAGE_SOURCE_PROP",
      title: "image source is missing",
      path,
      message:
        "Image nodes require either src or data; omitting both source props is not part of the public authoring API.",
      help: ["Add a src path or data URL to the image."],
    };
  }

  return undefined;
}

export function validateVideoSourceContract(
  props: { readonly src?: unknown; readonly data?: unknown },
  path: string,
): VideoSourceValidationIssue | undefined {
  const hasSrc = props.src !== undefined;
  const hasData = props.data !== undefined;

  if (hasSrc && typeof props.src !== "string") {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The video src prop must be a string when it is provided; other values are not part of the public authoring API.",
    };
  }

  if (hasData && typeof props.data !== "string") {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video data prop is invalid",
      path: `${path}.props.data`,
      message:
        "The video data prop must be a string when it is provided; other values are not part of the public authoring API.",
    };
  }

  if (typeof props.src === "string" && isBlankSourceString(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The video src prop must be a non-empty local path; empty values are not part of the public authoring API.",
    };
  }

  if (typeof props.src === "string" && !isPublicPathSourceString(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The video src prop must not start or end with whitespace; values outside the public local path syntax are not part of the public authoring API.",
    };
  }

  if (typeof props.src === "string" && isInlineDataUriSource(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The video src prop is for local paths; inline data URIs in src are not part of the public authoring API. Use video data for inline media.",
    };
  }

  if (typeof props.src === "string" && hasRemoteVideoSourceScheme(props.src)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video src prop is invalid",
      path: `${path}.props.src`,
      message:
        "The video src prop must be a local path; URL schemes are not part of the public authoring API. Use video data for inline media or provide a custom asset loader for trusted remote media.",
    };
  }

  if (typeof props.data === "string" && !isDataUriSource(props.data)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video data prop is invalid",
      path: `${path}.props.data`,
      message:
        "The video data prop must be an inline data URI with a non-empty media type, subtype, and payload; values outside that shape are not part of the public authoring API. Use video src for file paths.",
    };
  }

  if (typeof props.src === "string" && typeof props.data === "string") {
    return {
      kind: "ambiguous",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video source props are ambiguous",
      path: `${path}.props`,
      message:
        "Use either video src or video data, not both; providing both source props is not part of the public authoring API.",
    };
  }

  if (typeof props.src !== "string" && typeof props.data !== "string") {
    return {
      kind: "missing",
      code: "E_COMPILE_VIDEO_SOURCE_INVALID",
      title: "video source is missing",
      path: `${path}.props`,
      message:
        "Video nodes require either src or data; omitting both source props is not part of the public authoring API.",
      help: ["Add a src path or data URI to the video."],
    };
  }

  return undefined;
}

export function validateVideoPosterContract(
  props: { readonly poster?: unknown; readonly posterData?: unknown },
  path: string,
): VideoPosterValidationIssue | undefined {
  const hasPoster = props.poster !== undefined;
  const hasPosterData = props.posterData !== undefined;

  if (!hasPoster && !hasPosterData) {
    return undefined;
  }

  if (hasPoster && typeof props.poster !== "string") {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video poster prop is invalid",
      path: `${path}.props.poster`,
      message:
        "The video poster prop must be a string when it is provided; other values are not part of the public authoring API.",
    };
  }

  if (hasPosterData && typeof props.posterData !== "string") {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video posterData prop is invalid",
      path: `${path}.props.posterData`,
      message:
        "The video posterData prop must be a string when it is provided; other values are not part of the public authoring API.",
    };
  }

  if (typeof props.poster === "string" && isBlankSourceString(props.poster)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video poster prop is invalid",
      path: `${path}.props.poster`,
      message:
        "The video poster prop must be a non-empty source path or URL; empty values are not part of the public authoring API.",
    };
  }

  if (typeof props.poster === "string" && !isPublicPathSourceString(props.poster)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video poster prop is invalid",
      path: `${path}.props.poster`,
      message:
        "The video poster prop must not start or end with whitespace; values outside the public source path syntax are not part of the public authoring API.",
    };
  }

  if (typeof props.poster === "string" && isInlineDataUriSource(props.poster)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video poster prop is invalid",
      path: `${path}.props.poster`,
      message:
        "The video poster prop is for paths and HTTP(S) URLs; inline data URIs in poster are not part of the public authoring API. Use video posterData for inline poster media.",
    };
  }

  if (typeof props.poster === "string" && hasNonPublicRemoteImageSourceScheme(props.poster)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video poster prop is invalid",
      path: `${path}.props.poster`,
      message:
        "The video poster prop accepts local paths and HTTP(S) URLs; other URL schemes are not part of the public authoring API.",
    };
  }

  if (typeof props.posterData === "string" && !isDataUriSource(props.posterData)) {
    return {
      kind: "invalid",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video posterData prop is invalid",
      path: `${path}.props.posterData`,
      message:
        "The video posterData prop must be an inline data URI with a non-empty media type, subtype, and payload; values outside that shape are not part of the public authoring API. Use video poster for file paths.",
    };
  }

  if (typeof props.poster === "string" && typeof props.posterData === "string") {
    return {
      kind: "ambiguous",
      code: "E_COMPILE_VIDEO_POSTER_INVALID",
      title: "video poster props are ambiguous",
      path: `${path}.props`,
      message:
        "Use either video poster or video posterData, not both; providing both poster source props is not part of the public authoring API.",
    };
  }

  return undefined;
}

export function isBlankSourceString(value: string): boolean {
  return value.trim().length === 0;
}

export function isPublicPathSourceString(value: string): boolean {
  return value.trim() === value;
}

export function isInlineDataUriSource(value: string): boolean {
  return value.startsWith("data:");
}

export function sourceUriScheme(value: string): string | undefined {
  return /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value)?.[1]?.toLowerCase();
}

export function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

export function hasNonPublicRemoteImageSourceScheme(value: string): boolean {
  if (isWindowsDrivePath(value)) {
    return false;
  }

  const scheme = sourceUriScheme(value);
  return scheme !== undefined && scheme !== "http" && scheme !== "https" && scheme !== "data";
}

export function hasRemoteVideoSourceScheme(value: string): boolean {
  return !isWindowsDrivePath(value) && sourceUriScheme(value) !== undefined;
}

export function isDataUriSource(value: string): boolean {
  return parseDataUriSource(value) !== undefined;
}

export function dataMediaType(value: string): string | undefined {
  return parseDataUriSource(value)?.mediaType;
}

function parseDataUriSource(value: string): { mediaType: string } | undefined {
  const commaIndex = value.indexOf(",");
  if (!value.startsWith("data:") || commaIndex === -1) {
    return undefined;
  }

  const metadata = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1);
  if (metadata.length === 0 || payload.length === 0) {
    return undefined;
  }
  if (metadata.trim() !== metadata || payload.trim() !== payload) {
    return undefined;
  }

  const [mediaType] = metadata.split(";");
  const slashIndex = mediaType.indexOf("/");
  if (slashIndex <= 0 || slashIndex === mediaType.length - 1) {
    return undefined;
  }

  const type = mediaType.slice(0, slashIndex);
  const subtype = mediaType.slice(slashIndex + 1);
  const mediaTypeTokenPattern = /^[A-Za-z0-9!#$&^_.+-]+$/;
  if (!mediaTypeTokenPattern.test(type) || !mediaTypeTokenPattern.test(subtype)) {
    return undefined;
  }

  return { mediaType };
}

export function authorElementPropsFromSlideOptions(options: unknown): AuthorElementProps {
  return isAuthoringOptionsRecord(options)
    ? authorElementPropsFromEntries(
        Object.entries(options).filter(([, value]) => isAuthorElementPropValue(value)),
      )
    : {};
}

export function slideTemplateOptionValue(options: unknown): unknown {
  return isAuthoringOptionsRecord(options) ? options.template : undefined;
}
