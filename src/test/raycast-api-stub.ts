import { createElement, type ReactElement, type ReactNode } from "react";
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
  showInFinder: vi.fn<() => Promise<void>>().mockResolvedValue(),
  showToast: vi.fn<() => Promise<void>>().mockResolvedValue(),
};

const action = ({ onAction, title }: ActionProps): ReactElement =>
  createElement("button", { onClick: onAction, type: "button" }, title);

const actionPanel = ({ children }: ContainerProps): ReactElement => createElement("div", {}, children);

const getFieldValue = (id: string): string => {
  const field = globalThis.document.querySelector(`[data-testid="${id}"]`) as { value?: string } | null;
  if (typeof field?.value !== "string") {
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

export const Action = Object.assign(action, { SubmitForm: submitForm });
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
export const Icon = { Checkmark: "checkmark", Finder: "finder", Pencil: "pencil", Plus: "plus" };
export const Toast = { Style: { Failure: "failure", Success: "success" } };
export const closeMainWindow = raycastApiMocks.closeMainWindow;
export const openExtensionPreferences = vi.fn<() => Promise<void>>().mockResolvedValue();
export const showInFinder = raycastApiMocks.showInFinder;
export const showToast = raycastApiMocks.showToast;
