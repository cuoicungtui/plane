import type { BaseEditor, BaseRange, Range, Element } from "slate";
import type { ReactEditor, RenderElementProps } from "slate-react";
import type { HistoryEditor } from "slate-history";
import type { CustomElement, CustomText } from "@plait/common";

export type CustomEditor = BaseEditor &
  ReactEditor &
  HistoryEditor & {
    nodeToDecorations?: Map<Element, Range[]>;
  };

export type RenderElementPropsFor<T> = RenderElementProps & {
  element: T;
};

declare module "slate" {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
    Range: BaseRange & {
      [key: string]: unknown;
    };
  }
}
