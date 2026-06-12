import type { TemplateAreaRef } from "../templates";
import type {
  ImageStyle,
  ShapeStyle,
  SlideStyle,
  TextRunStyle,
  TextStyle,
  VideoStyle,
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
};

export type ViewNodeProps = {
  style?: ViewStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;

export type TextNodeProps = {
  style?: TextStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;

export type TextRunNodeProps = {
  style?: TextRunStyle;
} & ClassNameAuthorProps;

export type ImageNodeProps = {
  style?: ImageStyle;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
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

export type VideoNodeProps = {
  style?: VideoStyle;
  poster?: string;
  posterData?: string;
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps &
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
  shape?: "rect" | "ellipse" | "line";
} & ClassNameAuthorProps &
  TemplateAreaAuthorProps;
