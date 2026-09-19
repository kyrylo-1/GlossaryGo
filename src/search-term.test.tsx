// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { confirmAlert } from "@raycast/api";

import { getEntryIdentity } from "./glossary/entry-identity";
import { GlossaryError, parseGlossarySource } from "./glossary/glossary";
import type { GlossaryChange } from "./glossary/apply-glossary-change";
import type * as GlossaryModule from "./glossary/glossary";
import * as SearchModule from "./hooks/search";
import Command from "./search-term";
import { raycastApiMocks } from "./test/raycast-api-stub";
import type { Term } from "./utils/types";
import type * as RaycastUtils from "@raycast/utils";

const mocks = vi.hoisted(() => ({
  load: vi.fn<(path: string) => Promise<readonly Term[]>>(),
  path: "/tmp/first.yaml",
  save: vi.fn<(path: string, change: GlossaryChange) => Promise<void>>(),
}));
vi.mock("@raycast/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof RaycastUtils>()),
  showFailureToast: vi.fn<() => Promise<void>>().mockResolvedValue(),
}));
vi.mock("./glossary/glossary", async (importOriginal) => ({
  ...(await importOriginal<typeof GlossaryModule>()),
  loadGlossary: mocks.load,
}));
vi.mock("./glossary/get-glossary-target", () => ({
  getGlossaryTarget: (): { createParent: boolean; path: string } => ({ createParent: false, path: mocks.path }),
}));
vi.mock("./glossary/save-glossary-change", () => ({ saveGlossaryChange: mocks.save }));
const terms = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"].map((term) => ({
  definition: `${term} definition`,
  term,
}));
const names = (): Array<string | null> =>
  screen.queryAllByTestId("result").map((row) => row.getAttribute("aria-label"));
const search = (value: string): void => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
};
const copy = async (name: string, title = "Copy Definition"): Promise<void> => {
  raycastApiMocks.copy.mockClear();
  raycastApiMocks.showToast.mockClear();
  search(name);
  fireEvent.click(within(await screen.findByRole("article", { name })).getByRole("button", { name: title }));
  await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalled());
  await waitFor(() => expect(raycastApiMocks.showToast).toHaveBeenCalled());
  search("");
};
const reload = (): void => {
  fireEvent.click(screen.getAllByRole("button", { name: "Reload Glossary" })[0]);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.path = "/tmp/first.yaml";
  mocks.load.mockResolvedValue(terms);
  mocks.save.mockResolvedValue();
  vi.mocked(confirmAlert).mockResolvedValue(false);
  raycastApiMocks.copy.mockResolvedValue();
  raycastApiMocks.showToast.mockResolvedValue();
});
afterEach(cleanup);

const fieldValue = (id: string): string => {
  const field = screen.getByTestId(id);
  if (!(field instanceof globalThis.HTMLInputElement) && !(field instanceof globalThis.HTMLTextAreaElement)) {
    throw new TypeError(`Missing ${id} field.`);
  }
  return field.value;
};

describe("Search Term action shortcuts", () => {
  test("registers distinct shortcuts on selected actions and preserves default copy shortcuts", async () => {
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Alpha" }));
    expect(
      result
        .getAllByRole("button")
        .slice(0, 2)
        .map((button) => button.textContent),
    ).toEqual(["Copy Definition", "Copy Term"]);
    expect(result.getByRole("button", { name: "Copy Definition" }).dataset.shortcut).toBeUndefined();
    expect(result.getByRole("button", { name: "Copy Term" }).dataset.shortcut).toBeUndefined();
    const shortcuts = [
      ["View Full Definition", { key: "v", modifiers: ["cmd", "shift"] }],
      ["Add Term", { key: "n", modifiers: ["cmd"] }],
      ["Edit Term", { key: "e", modifiers: ["cmd"] }],
      ["Delete Term", { key: "x", modifiers: ["ctrl"] }],
    ] as const;
    for (const [title, shortcut] of shortcuts) {
      expect(JSON.parse(result.getByRole("button", { name: title }).dataset.shortcut ?? "null")).toEqual(shortcut);
    }
  });
});

describe("Add shortcut availability", () => {
  test.each([
    { hasSelection: true, query: "Al", view: "selected" },
    { hasSelection: false, query: "", view: "empty" },
    { hasSelection: false, query: "", view: "missing" },
    { hasSelection: false, query: "New term", view: "no-match" },
  ])("keeps Add's shortcut and form available in the $view view", async ({ hasSelection, query, view }) => {
    if (view === "empty") {
      mocks.load.mockResolvedValue([]);
    } else if (view === "missing") {
      mocks.load.mockRejectedValue(new GlossaryError("missing", "Missing synthetic glossary."));
    }
    render(<Command />);
    if (view === "no-match" || view === "selected") {
      await screen.findByRole("article", { name: "Alpha" });
      search(query);
    }
    const add = await screen.findByRole("button", { name: "Add Term" });
    expect(JSON.parse(add.dataset.shortcut ?? "null")).toEqual({ key: "n", modifiers: ["cmd"] });
    for (const name of ["Edit Term", "Delete Term", "View Full Definition"]) {
      expect(screen.queryAllByRole("button", { name })).toHaveLength(hasSelection ? 1 : 0);
    }
    fireEvent.click(add);
    expect(fieldValue("term")).toBe(query);
    expect(fieldValue("definition")).toBe("");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("Search Term mutation action wiring", () => {
  test("opens Edit with selected values rather than the partial query", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Al");
    fireEvent.click(screen.getByRole("button", { name: "Edit Term" }));
    expect(fieldValue("term")).toBe("Alpha");
    expect(fieldValue("definition")).toBe("Alpha definition");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  test("keeps Delete confirmation, cancels without a write, and confirms only the captured term", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Al");
    fireEvent.click(screen.getByRole("button", { name: "Delete Term" }));
    await waitFor(() => expect(confirmAlert).toHaveBeenCalledOnce());
    expect(confirmAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        dismissAction: { style: "cancel", title: "Cancel" },
        message: expect.stringContaining("Alpha"),
        primaryAction: { style: "destructive", title: "Delete" },
      }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledOnce();
    const query = screen.getByRole("textbox", { name: "Search terms" });
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Al");
    vi.mocked(confirmAlert).mockResolvedValue(true);
    mocks.load.mockResolvedValue(terms.filter(({ term }) => term !== "Alpha"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Term" }));
    await screen.findByRole("heading", { name: "No Matching Terms" });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("/tmp/first.yaml", {
      original: { definition: "Alpha definition", term: "Alpha" },
      type: "delete",
    });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("Al");
  });
});

describe("Search Term recovery actions", () => {
  test("offers only recovery actions after a load failure", async () => {
    mocks.load.mockRejectedValue(new Error("unreadable"));
    render(<Command />);
    await screen.findByRole("heading", { name: "Glossary Could Not Be Loaded" });
    expect(screen.queryByRole("button", { name: "Add Term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View Full Definition" })).toBeNull();
  });
});

describe("definition reading from Search Term", () => {
  const definition = `# Literal heading\n**literal emphasis** [literal link](url) $math$\n\n${Array.from(
    { length: 150 },
    (_, index) => `Long prose line ${index + 1} with enough words to wrap in a reading view.`,
  ).join("\n")}\nLast line`;

  beforeEach(() => {
    mocks.load.mockResolvedValue([
      { definition: "Wrong definition", term: "Zulu" },
      { definition, term: "Résumé" },
    ]);
  });

  test("keeps the split-pane preview and all literal multiline prose without file metadata", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Résumé" });
    expect(screen.getByRole("main").dataset.showingDetail).toBe("true");
    expect(screen.queryAllByText("Glossary File")).toHaveLength(0);
    const preview = screen.getAllByTestId("preview")[0].textContent;
    expect(preview).toContain("&#35; Literal heading  \n&#42;&#42;literal emphasis&#42;&#42;");
    expect(preview).toContain("&#91;literal link&#93;&#40;url&#41; &#36;math&#36;  \n&#160;");
    expect(preview).toContain("Long prose line 150 with enough words to wrap in a reading view&#46;  \nLast line");
  });

  test("opens the selected full definition with exact copy values and Reveal, retaining the query", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Résumé" });
    search("ré");
    const selected = screen.getByRole("article", { name: "Résumé" });
    fireEvent.click(within(selected).getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Résumé" }).closest("section");
    if (!reader) {
      throw new Error("Missing full definition reader.");
    }
    const content = within(reader).getByText(/Last line/).textContent;
    expect(content).toContain("Long prose line 150");
    expect(content).not.toContain("Wrong definition");
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith(definition));
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith("Résumé"));
    fireEvent.click(within(reader).getByRole("button", { name: "Reveal Glossary in Finder" }));
    await waitFor(() => expect(raycastApiMocks.showInFinder).toHaveBeenCalledWith("/tmp"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("heading", { level: 1, name: "Résumé" })).toBeNull();
    const query = screen.getByRole("textbox", { name: "Search terms" });
    expect(query instanceof globalThis.HTMLInputElement && query.value).toBe("ré");
    expect(within(selected).getByRole("button", { name: "Reload Glossary" })).toBeTruthy();
  });
});

describe("full definition reader recency", () => {
  test.each(["Copy Definition", "Copy Term"])("records successful %s from the full reader", async (title) => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Zulu");
    fireEvent.click(screen.getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Zulu" }).closest("section");
    if (!reader) {
      throw new Error("Missing full definition reader.");
    }
    fireEvent.click(within(reader).getByRole("button", { name: title }));
    await waitFor(() => expect(raycastApiMocks.showToast).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    search("");
    expect(names()).toEqual(["Zulu", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]);
  });
});

describe("Search Term result details", () => {
  test("keeps literal term content and existing actions without exposing the glossary path", async () => {
    const definition = "Literal # heading\nA *definition* with `code`.\nRésumé.";
    mocks.load.mockResolvedValue([{ definition, term: "Résumé" }]);
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Résumé" }));

    expect(
      result.getByText("Literal &#35; heading  \nA &#42;definition&#42; with &#96;code&#96;&#46;  \nRésumé&#46;", {
        normalizer: (text) => text,
      }),
    ).toBeTruthy();
    expect(result.queryByText("Glossary File")).toBeNull();
    expect(result.queryByText("/tmp/first.yaml")).toBeNull();
    expect(result.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Copy Definition",
      "Copy Term",
      "View Full Definition",
      "Add Term",
      "Edit Term",
      "Delete Term",
      "Reload Glossary",
      "Reveal Glossary in Finder",
    ]);

    fireEvent.click(result.getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith(definition));
    fireEvent.click(result.getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Résumé"));
    fireEvent.click(result.getByRole("button", { name: "Reveal Glossary in Finder" }));
    expect(raycastApiMocks.showInFinder).toHaveBeenCalledWith("/tmp");

    mocks.load.mockResolvedValue([{ definition: "Updated definition", term: "Résumé" }]);
    reload();
    expect(await screen.findByText(/Updated definition/)).toBeTruthy();
    expect(screen.queryByText("Glossary File")).toBeNull();
    expect(screen.queryByText("/tmp/first.yaml")).toBeNull();
  });
});

describe("Search Term recent history", () => {
  test("keeps typed matches cached when a successful copy updates recent history", async () => {
    const searchTerms = vi.spyOn(SearchModule, "searchTerms");
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("a");
    expect(names()).toEqual(["Alpha"]);
    const typedMatchCalls = searchTerms.mock.calls.filter(([, query]) => query === "a").length;

    fireEvent.click(screen.getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.showToast).toHaveBeenCalled());

    expect(searchTerms.mock.calls.filter(([, query]) => query === "a")).toHaveLength(typedMatchCalls);
    search("");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
  });

  test("records both successful copy actions, deduplicates repeats, and leaves typing alphabetical", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]));
    await copy("Bravo", "Copy Term");
    await waitFor(() => expect(names()).toEqual(["Bravo", "Zulu", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"]));
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Bravo", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"]));
    search("a");
    expect(names()).toEqual(["Alpha"]);
    search("");
    expect(names()).toEqual(["Zulu", "Bravo", "Alpha", "Charlie", "Delta", "Echo", "Foxtrot"]);
  });

  test("does not record a failed copy or passive search", async () => {
    raycastApiMocks.copy.mockRejectedValue(new Error("Clipboard unavailable"));
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Zulu");
    fireEvent.click(screen.getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Zulu"));
    search("");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
  });
});

describe("Search Term complete result list", () => {
  test("renders every broad-prefix match without an overflow message and copies the last definition", async () => {
    mocks.load.mockResolvedValue(
      ["A07", "A06", "A05", "A04", "A03", "A02", "A01"].map((term) => ({
        definition: `${term} original definition`,
        term,
      })),
    );
    render(<Command />);
    await screen.findByRole("article", { name: "A01" });
    search("a");

    expect(names()).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07"]);
    expect(screen.queryByText(/Showing 5 of/)).toBeNull();

    const last = within(screen.getByRole("article", { name: "A07" }));
    fireEvent.click(last.getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith("A07 original definition"));
  });
});

describe("Search Term history lifecycle", () => {
  test("prunes removed names on reload and does not resurrect history after re-adding", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    mocks.load.mockResolvedValue(terms.filter(({ term }) => term !== "Zulu"));
    reload();
    await waitFor(() => expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]));
    mocks.load.mockResolvedValue(terms);
    reload();
    await waitFor(() => expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]));
  });

  test("isolates history when the effective glossary changes and when the command reopens", async () => {
    const view = render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]));
    mocks.path = "/tmp/second.yaml";
    view.rerender(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
    await copy("Zulu");
    view.unmount();
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Zulu"]);
  });

  test("hides history after a failed reload and refreshes definitions on recovery", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    mocks.load.mockRejectedValue(new Error("unreadable"));
    reload();
    await screen.findByRole("heading", { name: "Glossary Could Not Be Loaded" });
    expect(names()).toEqual([]);
    mocks.load.mockResolvedValue([{ definition: "Updated definition", term: "Zulu" }]);
    reload();
    expect(await screen.findByText(/Updated definition/)).toBeTruthy();
    expect(names()).toEqual(["Zulu"]);
  });
});

// Exercises the action graph on one captured sibling.
// eslint-disable-next-line max-lines-per-function
describe("same-name result identity and actions", () => {
  const source =
    "terms:\n  - term: API\n    definition: First definition\n  - term: API\n    definition: Second definition\n  - term: API\n    definition: Second definition\n";

  test("shows distinct stable IDs and definition context, and copies only the selected sibling", async () => {
    const entries = parseGlossarySource(source);
    mocks.load.mockResolvedValue(entries);
    render(<Command />);
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })).toHaveLength(3));
    const rows = screen.getAllByRole("article", { name: "API" });
    const ids = rows.map((row) => row.dataset.entryId);
    expect(new Set(ids).size).toBe(3);
    expect(within(rows[1]).getByTestId("subtitle").textContent).toContain("Entry 2 · Second definition");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Second definition"));
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })[0].dataset.entryId).toBe(ids[1]));
    expect(screen.getAllByRole("article", { name: "API" })).toHaveLength(3);
    mocks.load.mockResolvedValue(parseGlossarySource(source));
    reload();
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })[0].dataset.entryId).toBe(ids[1]));
    expect(new Set(screen.getAllByRole("article", { name: "API" }).map((row) => row.dataset.entryId))).toEqual(
      new Set(ids),
    );
  });

  test("wires full reader, Edit, and confirmed Delete to the captured sibling", async () => {
    const entries = parseGlossarySource(source);
    mocks.load.mockResolvedValue(entries);
    vi.mocked(confirmAlert).mockResolvedValue(true);
    render(<Command />);
    await waitFor(() => expect(screen.getAllByRole("article", { name: "API" })).toHaveLength(3));
    const selected = within(screen.getAllByRole("article", { name: "API" })[2]);
    fireEvent.click(selected.getByRole("button", { name: "View Full Definition" }));
    expect(selected.getAllByText("Second definition", { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(selected.getAllByRole("button", { name: "Copy Term" })[1]);
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("API"));
    fireEvent.click(selected.getByRole("button", { name: "Edit Term" }));
    expect(fieldValue("definition")).toBe("Second definition");
    fireEvent.click(selected.getByRole("button", { name: "Update Term" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const edit = mocks.save.mock.calls[0][1];
    expect(edit.type).toBe("edit");
    if (edit.type !== "edit") {
      throw new TypeError("Expected edit change");
    }
    expect(getEntryIdentity(edit.original)?.index).toBe(2);
    mocks.save.mockClear();
    fireEvent.click(selected.getByRole("button", { name: "Delete Term" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const deletion = mocks.save.mock.calls[0][1];
    expect(deletion.type).toBe("delete");
    if (deletion.type !== "delete") {
      throw new TypeError("Expected delete change");
    }
    expect(getEntryIdentity(deletion.original)?.index).toBe(2);
  });
});

test("preserves a never-copied selected sibling through rows disappearing during unchanged reload", async () => {
  const source =
    "terms: [{ term: API, definition: First }, { term: API, definition: Second }, { term: api, definition: Lowercase }]\n";
  const entries = parseGlossarySource(source);
  mocks.load.mockResolvedValue(entries);
  render(<Command />);
  await screen.findByRole("article", { name: "api" });
  search("API");
  const selected = screen.getByRole("article", { name: "api" });
  fireEvent.click(selected);
  const id = selected.dataset.entryId;
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(id));
  let finishLoad: (loaded: readonly Term[]) => void = (): never => {
    throw new Error("Reload has not started");
  };
  // Hold the loader pending so native rows and selection disappear before recovery.
  // eslint-disable-next-line promise/avoid-new
  const pending = new Promise<readonly Term[]>((resolve) => {
    finishLoad = resolve;
  });
  mocks.load.mockReturnValueOnce(pending);
  fireEvent.click(within(selected).getByRole("button", { name: "Reload Glossary" }));
  await waitFor(() => expect(screen.queryAllByTestId("result")).toHaveLength(0));
  finishLoad(parseGlossarySource(source));
  await screen.findByRole("article", { name: "api" });
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(id));
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("API");
  expect(raycastApiMocks.copy).not.toHaveBeenCalled();
});

test("chooses a current entry after changed-source reload instead of reusing a stale sibling ID", async () => {
  const source = "terms: [{ term: API, definition: First }, { term: api, definition: Second }]\n";
  mocks.load.mockResolvedValue(parseGlossarySource(source));
  render(<Command />);
  const selected = await screen.findByRole("article", { name: "api" });
  fireEvent.click(selected);
  const oldId = selected.dataset.entryId;
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(oldId));
  mocks.load.mockResolvedValue(parseGlossarySource("terms: [{ term: API, definition: Current }]\n"));
  fireEvent.click(within(selected).getByRole("button", { name: "Reload Glossary" }));
  await waitFor(() => expect(screen.queryAllByTestId("result")).toHaveLength(1));
  const current = screen.getByRole("article", { name: "API" });
  expect(current.dataset.entryId).not.toBe(oldId);
  await waitFor(() => expect(screen.getByRole("main").dataset.selectedItemId).toBe(current.dataset.entryId));
  expect(within(current).getByTestId("preview").textContent).toBe("Current");
});
