import type { ReactElement, ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, test, vi } from "vitest";

import Command from "./add-term";
import type { GlossaryChange } from "./glossary/apply-glossary-change";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  closeMainWindow: vi.fn<() => Promise<void>>().mockResolvedValue(),
  saveGlossaryChange: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>(),
  showInFinder: vi.fn<() => Promise<void>>().mockResolvedValue(),
  showToast: vi.fn<() => Promise<void>>().mockResolvedValue(),
}));

vi.mock("@raycast/api", async () => {
  const { createElement } = await import("react");
  const action = (props: Readonly<Record<string, unknown>>): ReactElement => createElement("action", props);
  const actionPanel = (props: Readonly<Record<string, unknown>>): ReactElement => createElement("action-panel", props);
  const renderContainer = (
    type: string,
    {
      actions,
      children,
      ...props
    }: Readonly<Record<string, unknown>> & {
      actions?: ReactNode;
      children?: ReactNode;
    },
  ): ReactElement => createElement(type, props, children, actions);

  return {
    Action: Object.assign(action, {
      SubmitForm: (props: Readonly<Record<string, unknown>>): ReactElement => createElement("submit-form", props),
    }),
    ActionPanel: Object.assign(actionPanel, {
      Section: (props: Readonly<Record<string, unknown>>): ReactElement => createElement("action-panel-section", props),
    }),
    Detail: (props: Readonly<Record<string, unknown>>): ReactElement => renderContainer("detail", props),
    Form: Object.assign((props: Readonly<Record<string, unknown>>): ReactElement => renderContainer("form", props), {
      Description: (props: Readonly<Record<string, unknown>>): ReactElement => createElement("form-description", props),
      TextArea: (props: Readonly<Record<string, unknown>>): ReactElement => createElement("form-text-area", props),
      TextField: (props: Readonly<Record<string, unknown>>): ReactElement => createElement("form-text-field", props),
    }),
    Icon: { Checkmark: "checkmark", Finder: "finder", Pencil: "pencil", Plus: "plus" },
    Toast: { Style: { Failure: "failure", Success: "success" } },
    closeMainWindow: mocks.closeMainWindow,
    openExtensionPreferences: vi.fn<() => Promise<void>>().mockResolvedValue(),
    showInFinder: mocks.showInFinder,
    showToast: mocks.showToast,
  };
});

vi.mock("@raycast/utils", () => ({ showFailureToast: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("./glossary/get-glossary-target", () => ({
  getGlossaryTarget: (): { createParent: boolean; path: string } => ({
    createParent: false,
    path: "/tmp/glossary.yaml",
  }),
}));
vi.mock("./glossary/save-glossary-change", () => ({ saveGlossaryChange: mocks.saveGlossaryChange }));

type HostProps = Readonly<{
  autoFocus?: boolean;
  error?: string;
  markdown?: string;
  onAction?: () => void;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  onSubmit?: (values: Readonly<{ definition: string; term: string }>) => Promise<boolean>;
  title?: string;
  value?: string;
}>;

const propsOf = (instance: ReactTestInstance): HostProps => instance.props;

const findHost = (root: ReactTestInstance, type: string): ReactTestInstance => {
  return root.find((instance) => instance.type === type);
};

const findAction = (root: ReactTestInstance, title: string): ReactTestInstance => {
  return root.find((instance) => instance.type === "action" && propsOf(instance).title === title);
};

const renderCommand = (): ReactTestRenderer => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<Command />);
  });
  if (!renderer) {
    throw new Error("Command did not render.");
  }
  return renderer;
};

const changeField = (renderer: ReactTestRenderer, type: string, value: string): void => {
  act(() => propsOf(findHost(renderer.root, type)).onChange?.(value));
};

const submitForm = async (
  renderer: ReactTestRenderer,
  values: Readonly<{ definition: string; term: string }>,
): Promise<void> => {
  await act(async () => {
    await propsOf(findHost(renderer.root, "submit-form")).onSubmit?.(values);
  });
};

const invokeAction = (renderer: ReactTestRenderer, title: string): void => {
  act(() => findAction(renderer.root, title).props.onAction());
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.closeMainWindow.mockResolvedValue();
  mocks.showInFinder.mockResolvedValue();
  mocks.showToast.mockResolvedValue();
});

describe("standalone Add Term command", () => {
  test("shows saved values, supports Done, and starts another pristine focused form", async () => {
    mocks.saveGlossaryChange.mockResolvedValue();
    const renderer = renderCommand();
    const initialTermField = findHost(renderer.root, "form-text-field");

    expect(propsOf(initialTermField)).toMatchObject({ autoFocus: true, value: "" });
    act(() => propsOf(initialTermField).onBlur?.());
    expect(propsOf(findHost(renderer.root, "form-text-field")).error).toBe("Term must contain non-whitespace text.");

    changeField(renderer, "form-text-field", "  API  ");
    changeField(renderer, "form-text-area", "First line\nSecond line");
    expect(propsOf(findHost(renderer.root, "form-text-field"))).not.toHaveProperty("error");

    await submitForm(renderer, { definition: "First line\nSecond line", term: "  API  " });

    const confirmation = findHost(renderer.root, "detail");
    expect(propsOf(confirmation).markdown).toContain("# Term Added");
    expect(propsOf(confirmation).markdown).toContain("API");
    expect(propsOf(confirmation).markdown).toContain("First line\nSecond line");

    invokeAction(renderer, "Done");
    expect(mocks.closeMainWindow).toHaveBeenCalledOnce();

    invokeAction(renderer, "Add Another Term");
    expect(propsOf(findHost(renderer.root, "form-text-field"))).toMatchObject({ autoFocus: true, value: "" });
    expect(propsOf(findHost(renderer.root, "form-text-area")).value).toBe("");
    expect(propsOf(findHost(renderer.root, "form-text-field"))).not.toHaveProperty("error");
  });

  test("keeps both entered values and shows an actionable error when saving fails", async () => {
    mocks.saveGlossaryChange.mockRejectedValue(new Error("write failed"));
    const renderer = renderCommand();

    changeField(renderer, "form-text-field", "Retained Term");
    changeField(renderer, "form-text-area", "Retained definition");
    await submitForm(renderer, { definition: "Retained definition", term: "Retained Term" });

    expect(propsOf(findHost(renderer.root, "form-text-field")).value).toBe("Retained Term");
    expect(propsOf(findHost(renderer.root, "form-text-area")).value).toBe("Retained definition");
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "The glossary file could not be saved. Try again.",
        primaryAction: expect.objectContaining({ title: "Open Extension Preferences" }),
        title: "Could Not Save Term",
      }),
    );
  });
});
