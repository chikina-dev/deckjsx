import type { DeckOptions } from "../../authoring/index";
import type { GraphNodeId, SemanticAuthorGraph, SourceOrigin } from "../../graph";
import { frameFromProps } from "../../layout/absolute";
import type { Frame } from "../../layout/frame";
import type { FrameIR } from "../../layout/projected";
import type { ResolvedStyleMap } from "../../style/resolve";
import type { SlideTemplate } from "../../templates";
import { packageIdentity, slidePartIdFor } from "./identity";
import { DEFAULT_COLOR_MAP, DEFAULT_THEME_COLORS, defaultThemeProjectionTrace } from "./theme";
import type {
  PptxPackageModel,
  PptxPackagePart,
  PptxDefaultTextStylePayload,
  PptxPresentationSlideMasterId,
  PptxSlideLayoutAnchor,
  PptxSlideLayoutPartPayload,
  PptxSlideMasterLayoutId,
  PptxSupportPart,
  PptxSupportPartPayload,
} from "./model";

export type PptxDefaultSupportParts = {
  readonly contentTypes: PptxPackagePart;
  readonly rootRelationships: PptxPackagePart;
  readonly presentationPart: PptxSupportPart;
  readonly presentationRelationships: PptxPackagePart;
  readonly themePart: PptxSupportPart;
  readonly slideMasterPart: PptxSupportPart;
  readonly slideMasterRelationships: PptxPackagePart;
  readonly slideLayoutPart: PptxSupportPart;
  readonly slideLayoutRelationships: PptxPackagePart;
  readonly slideLayoutParts: readonly PptxSupportPart[];
  readonly slideLayoutRelationshipParts: readonly PptxPackagePart[];
  readonly documentPropertiesPart: PptxSupportPart;
  readonly extendedDocumentPropertiesPart: PptxSupportPart;
  readonly viewPropertiesPart: PptxSupportPart;
  readonly presentationPropertiesPart: PptxSupportPart;
  readonly tableStylesPart: PptxSupportPart;
};

const DEFAULT_SLIDE_MASTER_NUMERIC_ID = "2147483648";
const DEFAULT_SLIDE_LAYOUT_NUMERIC_ID = 2147483649;

function defaultTextStylePayload(): PptxDefaultTextStylePayload {
  return {
    source: "themeProjection",
    levels: Array.from({ length: 9 }, (_, index) => ({
      level: index + 1,
      marginLeftEmu: index * 457200,
      alignment: "l",
      defaultTabSizeEmu: 914400,
      fontSizePt: 18,
      colorThemeReference: "tx1",
      latinTypeface: "+mn-lt",
      eastAsianTypeface: "+mn-ea",
      complexScriptTypeface: "+mn-cs",
    })),
  };
}

function frameToFrameIR(frame: Frame): FrameIR {
  return {
    xEmu: frame.xEmu,
    yEmu: frame.yEmu,
    widthEmu: frame.widthEmu,
    heightEmu: frame.heightEmu,
  };
}

function sourceKeyForOrigin(source: SourceOrigin | undefined): string {
  return !source || source.kind === "root" ? "root" : source.sourceIdentity;
}

export function slideLayoutPartIdForTemplate(input: {
  readonly sourceKey: string;
  readonly template: string;
}): PptxPackagePart["id"] {
  return packageIdentity("support", `slide-layout:${input.sourceKey}:${input.template}`);
}

function slideFrameFromSize(size: PptxPackageModel["size"]): Frame {
  return {
    xEmu: 0,
    yEmu: 0,
    widthEmu: size.widthEmu,
    heightEmu: size.heightEmu,
  };
}

function templateLayoutAnchors(input: {
  readonly templateName: string;
  readonly template: SlideTemplate;
  readonly size: PptxPackageModel["size"];
}): readonly PptxSlideLayoutAnchor[] {
  const slideFrame = slideFrameFromSize(input.size);

  return Object.entries(input.template.areas).map(([area, templateArea]) => ({
    template: input.templateName,
    area,
    kind: templateArea.kind ?? "generic",
    frame: frameToFrameIR(
      frameFromProps(templateArea.frame, slideFrame, undefined, {
        viewportWidthEmu: input.size.widthEmu,
        viewportHeightEmu: input.size.heightEmu,
      }),
    ),
    placeholderStrategy: "none",
  }));
}

function templateSlideLayoutParts(input: {
  readonly graph: SemanticAuthorGraph;
  readonly size: PptxPackageModel["size"];
  readonly slideMasterPartId: PptxPackagePart["id"];
}): readonly PptxSupportPart[] {
  const parts: PptxSupportPart[] = [];
  let layoutNumber = 2;

  for (const [sourceKey, templates] of input.graph.templates) {
    for (const [templateName, template] of Object.entries(templates)) {
      const id = slideLayoutPartIdForTemplate({ sourceKey, template: templateName });
      parts.push({
        id,
        category: "support",
        kind: "slide-layout",
        path: `ppt/slideLayouts/slideLayout${layoutNumber}.xml`,
        payload: {
          kind: "slide-layout",
          name: templateName,
          editable: true,
          layoutType: "blank",
          preserve: true,
          slideMasterPartId: input.slideMasterPartId,
          placeholderStrategy: "none",
          template: {
            sourceKey,
            name: templateName,
          },
          layoutAnchors: templateLayoutAnchors({
            templateName,
            template,
            size: input.size,
          }),
        } satisfies PptxSlideLayoutPartPayload,
      });
      layoutNumber += 1;
    }
  }

  return parts;
}

function slideLayoutRelationshipsPartFor(
  layoutPart: PptxPackagePart,
  index: number,
): PptxPackagePart {
  return {
    id: packageIdentity("relationships", `${layoutPart.id}`),
    category: "manifest",
    kind: "relationships",
    path: `ppt/slideLayouts/_rels/slideLayout${index + 1}.xml.rels`,
    payload: {
      relationships: [],
    },
  };
}

export function slideLayoutPartForSlide(input: {
  readonly graph: SemanticAuthorGraph;
  readonly slideId: GraphNodeId;
  readonly slideLayoutParts: readonly PptxSupportPart[];
  readonly defaultSlideLayoutPart: PptxSupportPart;
}): PptxSupportPart {
  const slide = input.graph.nodes.get(input.slideId);
  if (slide?.kind !== "slide" || !slide.templateRef) {
    return input.defaultSlideLayoutPart;
  }

  const sourceKey = sourceKeyForOrigin(slide.origin.source);
  const templateLayoutPartId = slideLayoutPartIdForTemplate({
    sourceKey,
    template: slide.templateRef.name,
  });

  return (
    input.slideLayoutParts.find((part) => part.id === templateLayoutPartId) ??
    input.defaultSlideLayoutPart
  );
}

export function defaultPptxSupportParts(input: {
  graph: SemanticAuthorGraph;
  resolvedStyles: ResolvedStyleMap;
  options: DeckOptions;
  size: PptxPackageModel["size"];
  slideIds: readonly GraphNodeId[];
}): PptxDefaultSupportParts {
  const contentTypes: PptxPackagePart = {
    id: packageIdentity("manifest", "content-types"),
    category: "manifest",
    kind: "content-types",
    path: "[Content_Types].xml",
    payload: {
      defaults: [],
      overrides: [],
    },
  };
  const rootRelationships: PptxPackagePart = {
    id: packageIdentity("manifest", "root-relationships"),
    category: "manifest",
    kind: "relationships",
    path: "_rels/.rels",
    payload: {
      relationships: [],
    },
  };
  const presentationRelationships: PptxPackagePart = {
    id: packageIdentity("manifest", "presentation-relationships"),
    category: "manifest",
    kind: "relationships",
    path: "ppt/_rels/presentation.xml.rels",
    payload: {
      relationships: [],
    },
  };
  const themePartId = packageIdentity("support", "theme-default");
  const slideMasterPartId = packageIdentity("support", "slide-master-default");
  const slideLayoutPartId = packageIdentity("support", "slide-layout-default");
  const defaultSlideLayoutPart: PptxSupportPart = {
    id: slideLayoutPartId,
    category: "support",
    kind: "slide-layout",
    path: "ppt/slideLayouts/slideLayout1.xml",
    payload: {
      kind: "slide-layout",
      name: "Blank",
      editable: true,
      layoutType: "blank",
      preserve: true,
      slideMasterPartId,
      placeholderStrategy: "none",
      layoutAnchors: [],
    } satisfies PptxSupportPartPayload,
  };
  const templateLayoutParts = templateSlideLayoutParts({
    graph: input.graph,
    size: input.size,
    slideMasterPartId,
  });
  const slideLayoutParts = [defaultSlideLayoutPart, ...templateLayoutParts];
  const slideLayoutRelationshipParts = slideLayoutParts.map(slideLayoutRelationshipsPartFor);
  const slideLayoutRelationships = slideLayoutRelationshipParts[0]!;
  const slideLayoutPartIds = slideLayoutParts.map((part) => part.id);
  const slideMasterIds: readonly PptxPresentationSlideMasterId[] = [
    {
      slideMasterPartId,
      id: DEFAULT_SLIDE_MASTER_NUMERIC_ID,
    },
  ];
  const slideLayoutIds: readonly PptxSlideMasterLayoutId[] = slideLayoutPartIds.map(
    (slideLayoutPartId, index) => ({
      slideLayoutPartId,
      id: String(DEFAULT_SLIDE_LAYOUT_NUMERIC_ID + index),
    }),
  );
  const presentationPart: PptxSupportPart = {
    id: packageIdentity("support", "presentation"),
    category: "support",
    kind: "presentation",
    path: "ppt/presentation.xml",
    payload: {
      kind: "presentation",
      size: input.size,
      slideMasterIds,
      slidePartIds: input.slideIds.flatMap((slideId) => {
        const slide = input.graph.nodes.get(slideId);
        return slide?.kind === "slide" ? [slidePartIdFor(slide)] : [];
      }),
      defaultTextStyle: defaultTextStylePayload(),
    } satisfies PptxSupportPartPayload,
  };
  const slideLayoutPartIdBySlideId = new Map(
    input.slideIds.flatMap((slideId) => {
      const slide = input.graph.nodes.get(slideId);
      if (slide?.kind !== "slide") {
        return [];
      }
      return [
        [
          slideId,
          slideLayoutPartForSlide({
            graph: input.graph,
            slideId,
            slideLayoutParts,
            defaultSlideLayoutPart,
          }).id,
        ],
      ];
    }),
  );
  const themePart: PptxSupportPart = {
    id: themePartId,
    category: "support",
    kind: "theme",
    path: "ppt/theme/theme1.xml",
    payload: {
      kind: "theme",
      name: "deckjsx",
      editable: true,
      projection: {
        id: "pptx:theme-projection:default",
        purpose: "default",
        source: "deckjsx-default",
        trace: defaultThemeProjectionTrace({
          graph: input.graph,
          resolvedStyles: input.resolvedStyles,
          themePartId,
          slideMasterPartId,
          slideLayoutPartIdBySlideId,
        }),
      },
      colorScheme: {
        name: "deckjsx",
        colors: DEFAULT_THEME_COLORS,
      },
      fontScheme: {
        name: "deckjsx",
        majorLatin: "Aptos Display",
        minorLatin: "Aptos",
      },
      formatScheme: {
        name: "deckjsx",
      },
    } satisfies PptxSupportPartPayload,
  };
  const slideMasterPart: PptxSupportPart = {
    id: slideMasterPartId,
    category: "support",
    kind: "slide-master",
    path: "ppt/slideMasters/slideMaster1.xml",
    payload: {
      kind: "slide-master",
      name: "Default",
      editable: true,
      themePartId,
      slideLayoutPartIds,
      slideLayoutIds,
      colorMap: DEFAULT_COLOR_MAP,
      textStyles: {
        title: "empty",
        body: "empty",
        other: "empty",
      },
    } satisfies PptxSupportPartPayload,
  };
  const slideMasterRelationships: PptxPackagePart = {
    id: packageIdentity("relationships", "slide-master-default"),
    category: "manifest",
    kind: "relationships",
    path: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    payload: {
      relationships: [],
    },
  };
  const documentPropertiesPart: PptxSupportPart = {
    id: packageIdentity("support", "document-properties-core"),
    category: "support",
    kind: "document-properties",
    path: "docProps/core.xml",
    payload: {
      kind: "document-properties",
      propertyKind: "core",
      editable: true,
      source: "deckjsx-meta",
      meta: input.options.meta ?? {},
    } satisfies PptxSupportPartPayload,
  };
  const extendedDocumentPropertiesPart: PptxSupportPart = {
    id: packageIdentity("support", "document-properties-extended"),
    category: "support",
    kind: "document-properties",
    path: "docProps/app.xml",
    payload: {
      kind: "document-properties",
      propertyKind: "extended",
      editable: true,
      source: "deckjsx-projection",
      application: "deckjsx",
      slideCount: input.slideIds.length,
    } satisfies PptxSupportPartPayload,
  };
  const viewPropertiesPart: PptxSupportPart = {
    id: packageIdentity("support", "view-properties"),
    category: "support",
    kind: "view-properties",
    path: "ppt/viewProps.xml",
    payload: {
      kind: "view-properties",
      editable: true,
      settings: {},
    } satisfies PptxSupportPartPayload,
  };
  const presentationPropertiesPart: PptxSupportPart = {
    id: packageIdentity("support", "presentation-properties"),
    category: "support",
    kind: "presentation-properties",
    path: "ppt/presProps.xml",
    payload: {
      kind: "presentation-properties",
      editable: true,
      settings: {},
    } satisfies PptxSupportPartPayload,
  };
  const tableStylesPart: PptxSupportPart = {
    id: packageIdentity("support", "table-styles"),
    category: "support",
    kind: "table-styles",
    path: "ppt/tableStyles.xml",
    payload: {
      kind: "table-styles",
      editable: true,
      defaultStyleId: "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}",
      styleName: "deckjsx default",
      slots: {
        wholeTable: {
          status: "supported",
          fill: { themeReference: "bg1" },
          text: { themeReference: "tx1" },
          border: { themeReference: "tx1", widthPt: 0.75 },
        },
        headerRow: {
          status: "supported",
          fill: { themeReference: "accent1" },
          text: { themeReference: "lt1", bold: true },
          border: { themeReference: "accent1", widthPt: 0.75 },
        },
        firstColumn: {
          status: "placeholder",
          reason:
            "v0.8.4 does not add PPTX-specific first-column authoring flags; future selector support can feed this table-style slot.",
        },
        bandedRows: {
          status: "placeholder",
          reason:
            "v0.8.4 does not add pseudo-class row banding; future selector support can feed this table-style slot.",
        },
      },
    } satisfies PptxSupportPartPayload,
  };

  return {
    contentTypes,
    rootRelationships,
    presentationPart,
    presentationRelationships,
    themePart,
    slideMasterPart,
    slideMasterRelationships,
    slideLayoutPart: defaultSlideLayoutPart,
    slideLayoutRelationships,
    slideLayoutParts,
    slideLayoutRelationshipParts,
    documentPropertiesPart,
    extendedDocumentPropertiesPart,
    viewPropertiesPart,
    presentationPropertiesPart,
    tableStylesPart,
  };
}
