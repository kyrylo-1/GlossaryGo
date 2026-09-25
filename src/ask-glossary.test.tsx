// @vitest-environment jsdom
/// <reference lib="dom" />

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AI, confirmAlert, environment } from "@raycast/api";

import Command, { AskGlossaryCommand, type AskGlossaryCommandDependencies } from "./ask-glossary";
import { GlossaryError } from "./glossary/glossary-error";
import type * as GlossaryModule from "./glossary/glossary";
import type { Term } from "./utils/types";

const defaultMocks = vi.hoisted(() => ({
  load: vi.fn<(path: string) => Promise<readonly Term[]>>(),
  path: "/synthetic/custom.yaml",
  target: vi.fn<() => { createParent: boolean; path: string }>(),
}));
vi.mock("./glossary/get-glossary-target", () => ({ getGlossaryTarget: defaultMocks.target }));
vi.mock("./glossary/glossary", async (importOriginal) => ({
  ...(await importOriginal<typeof GlossaryModule>()),
  loadGlossary: defaultMocks.load,
}));

const oneTerm = [{ definition: "Application Programming Interface", term: "API" }] as const;

const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let settle!: (value: T) => void;
  // A controlled external response lets the component receive chunks before completion.
  // eslint-disable-next-line promise/avoid-new
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: settle };
};

const createDependencies = (): {
  askAi: ReturnType<typeof vi.fn<AskGlossaryCommandDependencies["askAi"]>>;
  canAccessAi: ReturnType<typeof vi.fn<AskGlossaryCommandDependencies["canAccessAi"]>>;
  confirmDisclosure: ReturnType<typeof vi.fn<AskGlossaryCommandDependencies["confirmDisclosure"]>>;
  loadTerms: ReturnType<typeof vi.fn<AskGlossaryCommandDependencies["loadTerms"]>>;
} => ({
  askAi: vi.fn<AskGlossaryCommandDependencies["askAi"]>().mockResolvedValue("The API is an interface."),
  canAccessAi: vi.fn<AskGlossaryCommandDependencies["canAccessAi"]>().mockReturnValue(true),
  confirmDisclosure: vi.fn<AskGlossaryCommandDependencies["confirmDisclosure"]>().mockResolvedValue(true),
  loadTerms: vi.fn<AskGlossaryCommandDependencies["loadTerms"]>().mockResolvedValue(oneTerm),
});

const ask = (question: string): void => {
  fireEvent.change(screen.getByTestId("question"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask Glossary" }));
};

const questionValue = (): string => {
  const field = screen.getByTestId("question");
  if (!(field instanceof globalThis.HTMLTextAreaElement)) {
    throw new TypeError("Expected a question textarea.");
  }
  return field.value;
};

const displayedMarkdown = (): string => {
  const markdown = globalThis.document.querySelector("section pre");
  if (!markdown) {
    throw new TypeError("Expected an answer detail.");
  }
  return markdown.textContent ?? "";
};

beforeEach(() => {
  vi.clearAllMocks();
  defaultMocks.path = "/synthetic/custom.yaml";
  defaultMocks.target.mockImplementation(() => ({ createParent: false, path: defaultMocks.path }));
  defaultMocks.load.mockResolvedValue(oneTerm);
  vi.mocked(confirmAlert).mockResolvedValue(true);
  vi.mocked(environment.canAccess).mockReturnValue(true);
});
afterEach(cleanup);

// eslint-disable-next-line max-lines-per-function
describe("Ask Glossary disclosure", () => {
  test("opening and typing show the question and privacy disclosure without starting work", () => {
    const dependencies = createDependencies();
    render(<AskGlossaryCommand dependencies={dependencies} />);

    expect(screen.getByText("Question")).toBeTruthy();
    expect(
      screen.getByText(/submitting will send the question and supplied Glossary context to Raycast AI/i),
    ).toBeTruthy();
    expect(screen.getByText(/opening this command alone sends nothing/i)).toBeTruthy();
    fireEvent.change(screen.getByTestId("question"), { target: { value: "What is API?" } });
    expect(questionValue()).toBe("What is API?");
    expect(dependencies.confirmDisclosure).not.toHaveBeenCalled();
    expect(dependencies.loadTerms).not.toHaveBeenCalled();
    expect(dependencies.askAi).not.toHaveBeenCalled();
  });

  test("rejects whitespace as a field error before confirmation", () => {
    const dependencies = createDependencies();
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("   \n  ");

    expect(screen.getByRole("alert").textContent).toBe("Enter a question.");
    expect(dependencies.confirmDisclosure).not.toHaveBeenCalled();
    expect(dependencies.loadTerms).not.toHaveBeenCalled();
  });

  test("cancelling confirmation retains the question and sends nothing", async () => {
    const dependencies = createDependencies();
    dependencies.confirmDisclosure.mockResolvedValue(false);
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");

    await waitFor(() => expect(dependencies.confirmDisclosure).toHaveBeenCalledOnce());
    expect(questionValue()).toBe("What is API?");
    expect(dependencies.loadTerms).not.toHaveBeenCalled();
    expect(dependencies.askAi).not.toHaveBeenCalled();
  });

  test("acceptance permits one attempt and is remembered only for the mounted session", async () => {
    const dependencies = createDependencies();
    const first = render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
    expect(dependencies.confirmDisclosure).toHaveBeenCalledOnce();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Another Question" }));
    expect(questionValue()).toBe("");
    ask("Explain API again");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledTimes(2));
    expect(dependencies.confirmDisclosure).toHaveBeenCalledOnce();

    first.unmount();
    render(<AskGlossaryCommand dependencies={dependencies} />);
    ask("What is API?");
    await waitFor(() => expect(dependencies.confirmDisclosure).toHaveBeenCalledTimes(2));
  });
});

// eslint-disable-next-line max-lines-per-function
describe("Ask Glossary response", () => {
  test("shows streamed chunks while loading and replaces them with the final answer", async () => {
    const dependencies = createDependencies();
    const pending = deferred<string>();
    let onData: (chunk: string) => void = vi.fn<(chunk: string) => void>();
    dependencies.askAi.mockImplementation((_prompt, options) => {
      onData = options.onData;
      return pending.promise;
    });
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Ask Another Question" }).closest("section")?.dataset.loading).toBe(
      "true",
    );
    act(() => {
      onData("The API ");
      onData("is useful.");
    });
    expect(screen.getByText("The API is useful.")).toBeTruthy();
    await act(async () => {
      pending.resolve("Authoritative final answer.");
      await pending.promise;
    });
    expect(screen.getByText("Authoritative final answer.")).toBeTruthy();
    expect(screen.queryByText("The API is useful.")).toBeNull();
    expect(screen.getByRole("button", { name: "Ask Another Question" }).closest("section")?.dataset.loading).toBe(
      "false",
    );
  });

  test.each([
    {
      final: "Final ![private term](https://tracker.test/pixel?term=API)",
      finalSafe: "Final &#33;[private term](https://tracker.test/pixel?term=API)",
      name: "CommonMark image",
      streamed: "Streaming ![private term](https://tracker.test/pixel?term=API)",
      streamedSafe: "Streaming &#33;[private term](https://tracker.test/pixel?term=API)",
    },
    {
      final: 'Final <img src="https://tracker.test/pixel?term=API">',
      finalSafe:
        "Final &#60;img src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#63;term&#61;API&#34;&#62;",
      name: "raw HTML image",
      streamed: 'Streaming <img src="https://tracker.test/pixel?term=API">',
      streamedSafe:
        "Streaming &#60;img src&#61;&#34;https&#58;&#47;&#47;tracker&#46;test&#47;pixel&#63;term&#61;API&#34;&#62;",
    },
  ])(
    "neutralizes $name in streamed and final answer snapshots",
    async ({ final, finalSafe, streamed, streamedSafe }) => {
      const dependencies = createDependencies();
      const pending = deferred<string>();
      let onData: (chunk: string) => void = vi.fn<(chunk: string) => void>();
      dependencies.askAi.mockImplementation((_prompt, options) => {
        onData = options.onData;
        return pending.promise;
      });
      render(<AskGlossaryCommand dependencies={dependencies} />);

      ask("What is API?");
      await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
      act(() => onData(streamed));
      expect(displayedMarkdown()).toBe(streamedSafe);

      await act(async () => {
        pending.resolve(final);
        await pending.promise;
      });
      expect(displayedMarkdown()).toBe(finalSafe);
    },
  );

  test.each([
    {
      message: "Raycast AI access is unavailable. Check Raycast AI settings and try again.",
      name: "access",
      prepare: (dependencies: ReturnType<typeof createDependencies>): void => {
        dependencies.canAccessAi.mockReturnValue(false);
      },
    },
    {
      message: "No glossary file exists at this path. Add a term to create it.",
      name: "file",
      prepare: (dependencies: ReturnType<typeof createDependencies>): void => {
        dependencies.loadTerms.mockRejectedValue(
          new GlossaryError("missing", "No glossary file exists at this path. Add a term to create it."),
        );
      },
    },
    {
      message: "The glossary could not be loaded. Try again.",
      name: "unknown file error",
      prepare: (dependencies: ReturnType<typeof createDependencies>): void => {
        dependencies.loadTerms.mockRejectedValue(new Error("private filesystem detail"));
      },
    },
    {
      message: "The glossary is empty. Add terms before asking a question.",
      name: "empty glossary",
      prepare: (dependencies: ReturnType<typeof createDependencies>): void => {
        dependencies.loadTerms.mockResolvedValue([]);
      },
    },
    {
      message: "The glossary context exceeds the 32 KiB limit. Reduce the glossary size and try again.",
      name: "context limit",
      prepare: (dependencies: ReturnType<typeof createDependencies>): void => {
        dependencies.loadTerms.mockResolvedValue([{ definition: "x".repeat(32_768), term: "Huge" }]);
      },
    },
    {
      message: "Raycast AI could not answer this question. Try again.",
      name: "AI",
      prepare: (dependencies: ReturnType<typeof createDependencies>): void => {
        dependencies.askAi.mockRejectedValue(new Error("secret service detail"));
      },
    },
  ])("renders a safe actionable $name failure", async ({ prepare, message }) => {
    const dependencies = createDependencies();
    prepare(dependencies);
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask Another Question" })).toBeTruthy();
    expect(dependencies.askAi).toHaveBeenCalledTimes(
      message === "Raycast AI could not answer this question. Try again." ? 1 : 0,
    );
  });

  test("an overlong question reports its limit without loading or sending AI", async () => {
    const dependencies = createDependencies();
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("q".repeat(2_001));

    expect(await screen.findByText("Questions must be 2,000 characters or fewer.")).toBeTruthy();
    expect(dependencies.loadTerms).not.toHaveBeenCalled();
    expect(dependencies.askAi).not.toHaveBeenCalled();
  });

  test("Ask Another Question aborts the active signal and ignores its late chunks and completion", async () => {
    const dependencies = createDependencies();
    const pending = deferred<string>();
    let onData: (chunk: string) => void = vi.fn<(chunk: string) => void>();
    let signal: AbortSignal | undefined;
    dependencies.askAi.mockImplementation((_prompt, options) => {
      onData = options.onData;
      signal = options.signal;
      return pending.promise;
    });
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Ask Another Question" }));
    expect(signal?.aborted).toBe(true);
    expect(questionValue()).toBe("");
    act(() => onData("late chunk"));
    await act(async () => {
      pending.resolve("late final answer");
      await pending.promise;
    });
    expect(screen.queryByText(/late chunk|late final answer/)).toBeNull();
    expect(questionValue()).toBe("");
  });

  test("late chunks and completion from an aborted request cannot overwrite its replacement answer", async () => {
    const dependencies = createDependencies();
    const first = deferred<string>();
    const second = deferred<string>();
    let oldOnData: (chunk: string) => void = vi.fn<(chunk: string) => void>();
    let newOnData: (chunk: string) => void = vi.fn<(chunk: string) => void>();
    dependencies.askAi
      .mockImplementationOnce((_prompt, options) => {
        oldOnData = options.onData;
        return first.promise;
      })
      .mockImplementationOnce((_prompt, options) => {
        newOnData = options.onData;
        return second.promise;
      });
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("First question");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Ask Another Question" }));
    ask("Second question");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledTimes(2));

    act(() => newOnData("Current answer in progress."));
    expect(displayedMarkdown()).toBe("Current answer in progress.");
    act(() => oldOnData("STALE CHUNK"));
    await act(async () => {
      first.resolve("STALE FINAL");
      await first.promise;
    });
    expect(displayedMarkdown()).toBe("Current answer in progress.");
    expect(screen.getByRole("button", { name: "Ask Another Question" }).closest("section")?.dataset.loading).toBe(
      "true",
    );

    act(() => newOnData(" More context."));
    expect(displayedMarkdown()).toBe("Current answer in progress. More context.");
    await act(async () => {
      second.resolve("Current final answer.");
      await second.promise;
    });
    expect(displayedMarkdown()).toBe("Current final answer.");
  });

  test("two submissions while confirmation is pending start one confirmation and one request", async () => {
    const dependencies = createDependencies();
    const pendingConfirmation = deferred<boolean>();
    dependencies.confirmDisclosure.mockReturnValue(pendingConfirmation.promise);
    render(<AskGlossaryCommand dependencies={dependencies} />);

    fireEvent.change(screen.getByTestId("question"), { target: { value: "What is API?" } });
    const submit = screen.getByRole("button", { name: "Ask Glossary" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(dependencies.confirmDisclosure).toHaveBeenCalledOnce();
    await act(async () => {
      pendingConfirmation.resolve(true);
      await pendingConfirmation.promise;
    });
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
  });

  test("two submit gestures while AI is pending start one request", async () => {
    const dependencies = createDependencies();
    const pending = deferred<string>();
    dependencies.askAi.mockResolvedValueOnce("First answer").mockReturnValueOnce(pending.promise);
    render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
    fireEvent.click(await screen.findByRole("button", { name: "Ask Another Question" }));
    fireEvent.change(screen.getByTestId("question"), { target: { value: "Explain API again" } });
    const submit = screen.getByRole("button", { name: "Ask Glossary" });
    act(() => {
      submit.click();
      submit.click();
    });
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledTimes(2));
    await act(async () => {
      pending.resolve("Done");
      await pending.promise;
    });
  });

  test("unmount aborts the active signal and ignores late callbacks", async () => {
    const dependencies = createDependencies();
    const pending = deferred<string>();
    let onData: (chunk: string) => void = vi.fn<(chunk: string) => void>();
    let signal: AbortSignal | undefined;
    dependencies.askAi.mockImplementation((_prompt, options) => {
      onData = options.onData;
      signal = options.signal;
      return pending.promise;
    });
    const view = render(<AskGlossaryCommand dependencies={dependencies} />);

    ask("What is API?");
    await waitFor(() => expect(dependencies.askAi).toHaveBeenCalledOnce());
    view.unmount();
    expect(signal?.aborted).toBe(true);
    act(() => onData("late chunk"));
    await act(async () => {
      pending.resolve("late final answer");
      await pending.promise;
    });
    expect(screen.queryByText(/late chunk|late final answer/)).toBeNull();
  });
});

describe("Ask Glossary command wiring", () => {
  test.each([
    ["custom", "/synthetic/custom.yaml"],
    ["support", `${environment.supportPath}/glossary.yaml`],
  ])("loads the %s effective Glossary File and excludes its path from AI", async (_name, path) => {
    defaultMocks.path = path;
    const on = vi.fn<(event: string, callback: (chunk: string) => void) => void>();
    vi.mocked(AI.ask).mockReturnValue(Object.assign(Promise.resolve("Final answer"), { on }));
    render(<Command />);

    ask("What is API?");

    await waitFor(() => expect(AI.ask).toHaveBeenCalledOnce());
    expect(defaultMocks.target).toHaveBeenCalledOnce();
    expect(defaultMocks.load).toHaveBeenCalledExactlyOnceWith(path);
    expect(confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("question and supplied Glossary context"),
        title: "Send to Raycast AI?",
      }),
    );
    const [prompt, options] = vi.mocked(AI.ask).mock.calls[0];
    expect(prompt).toContain("What is API?");
    expect(prompt).toContain('"term":"API"');
    expect(prompt).not.toContain(path);
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(40_000);
    expect(options).toMatchObject({ creativity: "none", signal: expect.any(AbortSignal) });
    expect(on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(await screen.findByText("Final answer")).toBeTruthy();
  });

  test("registers the exact view command contract", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      commands: Array<Record<string, unknown>>;
    };
    expect(manifest.commands.find((command) => command.name === "ask-glossary")).toEqual({
      description: "Ask questions grounded in your local glossary using Raycast AI",
      mode: "view",
      name: "ask-glossary",
      title: "Ask Glossary",
    });
  });
});
