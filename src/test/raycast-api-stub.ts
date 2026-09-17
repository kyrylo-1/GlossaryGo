/// <reference lib="dom" />

import { createElement, useState, type ReactElement, type ReactNode } from "react";
import { vi } from "vitest";

type ActionProps = Readonly<{ onAction?: () => void; title: string }>;
type ContainerProps = Readonly<{
  actions?: ReactNode;
  children?: ReactNode;
  markdown?: string;
  navigationTitle?: string;
}>;
type FieldProps = Readonly<{
  autoFocus?: boolean;
  error?: string;
  id: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  title?: string;
  value?: string;
}>;
type SubmitProps = Readonly<{
  onSubmit: (values: Readonly<{ definition: string; term: string }>) => Promise<boolean>;
  title: string;
}>;

export const raycastApiMocks = {
  closeMainWindow: vi.fn<() => Promise<void>>().mockResolvedValue(),
  copy: vi.fn<(content: string) => Promise<void>>().mockResolvedValue(),
  showInFinder: vi.fn<() => Promise<void>>().mockResolvedValue(),
  showToast: vi.fn<() => Promise<void>>().mockResolvedValue(),
};

const action = ({ onAction, title }: ActionProps): ReactElement =>
  createElement("button", { onClick: onAction, type: "button" }, title);

const actionPanel = ({ children }: ContainerProps): ReactElement => createElement("div", {}, children);

const getFieldValue = (id: string): string => {
  const field = globalThis.document.querySelector(`[data-testid="${id}"]`);
  if (!(field instanceof globalThis.HTMLInputElement) && !(field instanceof globalThis.HTMLTextAreaElement)) {
    throw new TypeError(`Missing ${id} form field.`);
  }
  return field.value;
};

const submitForm = ({ onSubmit, title }: SubmitProps): ReactElement =>
  createElement(
    "button",
    {
      onClick: () => {
        onSubmit({ definition: getFieldValue("definition"), term: getFieldValue("term") }).catch(() => null);
      },
      type: "button",
    },
    title,
  );

const renderField = (element: "input" | "textarea", props: FieldProps): ReactElement =>
  createElement(
    "label",
    {},
    props.title,
    createElement(element, {
      autoFocus: props.autoFocus,
      "data-testid": props.id,
      onBlur: props.onBlur,
      onChange: (event: Readonly<{ target: Readonly<{ value: string }> }>) => props.onChange?.(event.target.value),
      value: props.value,
    }),
    props.error ? createElement("span", { role: "alert" }, props.error) : null,
  );

const PushAction = ({ target, title }: Readonly<{ target: ReactNode; title: string }>): ReactElement => {
  const [opened, setOpened] = useState(false);
  return createElement(
    "div",
    {},
    action({ onAction: () => setOpened(true), title }),
    opened ? createElement("div", {}, target, action({ onAction: () => setOpened(false), title: "Back" })) : null,
  );
};

export const Action = Object.assign(action, {
  Push: PushAction,
  Style: { Destructive: "destructive" },
  SubmitForm: submitForm,
});
export const ActionPanel = Object.assign(actionPanel, { Section: actionPanel });
export const Detail = ({ actions, markdown, navigationTitle }: ContainerProps): ReactElement =>
  createElement("section", {}, createElement("h1", {}, navigationTitle), createElement("pre", {}, markdown), actions);
export const Form = Object.assign(
  ({ actions, children }: ContainerProps): ReactElement => createElement("section", {}, children, actions),
  {
    Description: (): null => null,
    TextArea: (props: FieldProps): ReactElement => renderField("textarea", props),
    TextField: (props: FieldProps): ReactElement => renderField("input", props),
  },
);
export const Icon = { Checkmark: "checkmark", Document: "document", Finder: "finder", Pencil: "pencil", Plus: "plus" };
export const Toast = { Style: { Failure: "failure", Success: "success" } };
export const closeMainWindow = raycastApiMocks.closeMainWindow;
export const openExtensionPreferences = vi.fn<() => Promise<void>>().mockResolvedValue();
export const showInFinder = raycastApiMocks.showInFinder;
export const showToast = raycastApiMocks.showToast;

export const Clipboard = { copy: raycastApiMocks.copy };
export const Alert = { ActionStyle: { Cancel: "cancel", Destructive: "destructive" } };
export const confirmAlert = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
const pop = vi.fn<() => void>();
export const useNavigation = (): { pop: () => void } => ({ pop });

const listContainer = ({
  children,
  isShowingDetail,
  onSearchTextChange,
  searchText,
}: ContainerProps &
  Readonly<{
    isShowingDetail: boolean;
    onSearchTextChange: (value: string) => void;
    searchText: string;
  }>): ReactElement =>
  createElement(
    "main",
    { "data-showing-detail": isShowingDetail },
    createElement("input", {
      "aria-label": "Search terms",
      onChange: (event: Readonly<{ target: Readonly<{ value: string }> }>) => onSearchTextChange(event.target.value),
      value: searchText,
    }),
    children,
  );
const listSection = ({ children, title }: ContainerProps & Readonly<{ title?: string }>): ReactElement =>
  createElement("section", {}, title ? createElement("h2", {}, title) : null, children);
const listItem = ({
  actions,
  detail,
  title,
}: ContainerProps & Readonly<{ detail: ReactNode; title: string }>): ReactElement =>
  createElement("article", { "aria-label": title, "data-testid": "result" }, title, detail, actions);
const listDetail = Object.assign(
  ({ markdown, metadata }: ContainerProps & Readonly<{ metadata?: ReactNode }>): ReactElement =>
    createElement("div", {}, createElement("pre", { "data-testid": "preview" }, markdown), metadata),
  {
    Metadata: Object.assign(actionPanel, {
      Label: ({ title }: Readonly<{ title: string }>): ReactElement => createElement("span", {}, title),
    }),
  },
);
export const List = Object.assign(listContainer, {
  EmptyView: ({ actions, title }: ContainerProps & Readonly<{ title: string }>): ReactElement =>
    createElement("section", {}, createElement("h2", {}, title), actions),
  Item: Object.assign(listItem, { Detail: listDetail }),
  Section: listSection,
});
