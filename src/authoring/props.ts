import type { TemplateAreaRef } from "../templates";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  TextRunStyle,
  TextStyle,
  ViewStyle,
} from "../style/types";

export interface ClassNameValueArray extends ReadonlyArray<ClassNameValue> {}
export type ClassNameObject = Readonly<Record<string, boolean | null | undefined>>;
export type ClassNameValue =
  | string
  | false
  | null
  | undefined
  | ClassNameValueArray
  | ClassNameObject;

type ClassNameAuthorProps = {
  className?: ClassNameValue;
};

type TemplateAreaAuthorProps = {
  area?: TemplateAreaRef;
};

export type SlideNodeProps = {
  name?: string;
  template?: string;
  className?: ClassNameValue;
  style?: SlideStyle;
  background?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundTransparency?: number;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundClip?: string;
  backgroundOrigin?: string;
};

export type ViewNodeProps = {
  style?: ViewStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
  ViewStyle;

export type TextNodeProps = {
  style?: TextStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
  TextStyle;

export type TextRunNodeProps = {
  style?: TextRunStyle;
} & ClassNameAuthorProps &
  TextRunStyle;

export type ImageNodeProps = {
  style?: ImageStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
  ImageStyle &
  (
    | {
        src: string;
        data?: string;
      }
    | {
        src?: string;
        data: string;
      }
  );

export type ShapeNodeProps = {
  style?: ShapeStyle;
  shape: "rect" | "ellipse" | "line";
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
  ShapeStyle;

export type AuthorNodeKind = "slide" | "view" | "text" | "image" | "shape";

export type AuthorNodePropsMap = {
  slide: SlideNodeProps;
  view: ViewNodeProps;
  text: TextNodeProps;
  image: ImageNodeProps;
  shape: ShapeNodeProps;
};

export type AuthorNodeProps<K extends AuthorNodeKind> = AuthorNodePropsMap[K];
