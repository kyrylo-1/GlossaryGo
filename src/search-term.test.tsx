// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type * as GlossaryModule from "./glossary/glossary";
import Command from "./search-term";
import { raycastApiMocks } from "./test/raycast-api-stub";
import type { Term } from "./utils/types";

const mocks = vi.hoisted(() => ({
  load: vi.fn<(path: string) => Promise<readonly Term[]>>(),
  path: "/tmp/first.yaml",
}));
vi.mock("@raycast/utils", () => ({ showFailureToast: vi.fn<() => Promise<void>>().mockResolvedValue() }));
vi.mock("./glossary/glossary", async (importOriginal) => ({
  ...(await importOriginal<typeof GlossaryModule>()),
  loadGlossary: mocks.load,
}));
vi.mock("./glossary/get-glossary-target", () => ({
  getGlossaryTarget: (): { createParent: boolean; path: string } => ({ createParent: false, path: mocks.path }),
}));
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
  raycastApiMocks.copy.mockResolvedValue();
  raycastApiMocks.showToast.mockResolvedValue();
});
afterEach(cleanup);

describe("Search Term result details", () => {
  test("keeps literal term content and existing actions without exposing the glossary path", async () => {
    const definition = "Literal # heading\nA *definition* with `code`.\nRésumé.";
    mocks.load.mockResolvedValue([{ definition, term: "Résumé" }]);
    render(<Command />);
    const result = within(await screen.findByRole("article", { name: "Résumé" }));

    expect(
      result.getByText("```\nLiteral # heading\nA *definition* with `code`.\nRésumé.\n```", {
        normalizer: (text) => text,
      }),
    ).toBeTruthy();
    expect(result.queryByText("Glossary File")).toBeNull();
    expect(result.queryByText("/tmp/first.yaml")).toBeNull();
    expect(result.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Copy Definition",
      "Copy Term",
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
  test("records both successful copy actions, deduplicates repeats, and leaves typing alphabetical", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu"]));
    await copy("Bravo", "Copy Term");
    await waitFor(() => expect(names()).toEqual(["Bravo", "Zulu"]));
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu", "Bravo"]));
    search("a");
    expect(names()).toEqual(["Alpha"]);
    search("");
    expect(names()).toEqual(["Zulu", "Bravo"]);
  });

  test("does not record a failed copy or passive search", async () => {
    raycastApiMocks.copy.mockRejectedValue(new Error("Clipboard unavailable"));
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    search("Zulu");
    fireEvent.click(screen.getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenCalledWith("Zulu"));
    search("");
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });
});

describe("Search Term history lifecycle", () => {
  test("prunes removed names on reload and does not resurrect history after re-adding", async () => {
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    mocks.load.mockResolvedValue(terms.filter(({ term }) => term !== "Zulu"));
    reload();
    await screen.findByRole("article", { name: "Alpha" });
    mocks.load.mockResolvedValue(terms);
    reload();
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });

  test("isolates history when the effective glossary changes and when the command reopens", async () => {
    const view = render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    await copy("Zulu");
    await waitFor(() => expect(names()).toEqual(["Zulu"]));
    mocks.path = "/tmp/second.yaml";
    view.rerender(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
    await copy("Zulu");
    view.unmount();
    render(<Command />);
    await screen.findByRole("article", { name: "Alpha" });
    expect(names()).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
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
