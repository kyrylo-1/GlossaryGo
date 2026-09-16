// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Command from "./search-term";
import { searchTerms } from "./hooks/search";
import { raycastApiMocks } from "./test/raycast-api-stub";

const definition = "# Literal heading\n**literal emphasis** [literal link](https://example.com)\nLast line";
const terms = [
  { definition: "Wrong definition", term: "Zulu" },
  { definition, term: "Résumé" },
];
const mocks = vi.hoisted(() => ({ reload: vi.fn<() => Promise<void>>().mockResolvedValue() }));
vi.mock("@raycast/utils", () => ({ showFailureToast: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("./hooks/use-glossary", () => ({
  useGlossary: (): object => {
    const [query, setQuery] = useState("");
    return {
      createParent: false,
      glossaryFile: "/tmp/kyr23-synthetic.yaml",
      query,
      reload: mocks.reload,
      result: searchTerms(terms, query),
      setQuery,
      state: { status: "ready", terms },
    };
  },
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("definition reading from Search Term", () => {
  test("removes preview metadata while preserving literal multiline prose", () => {
    render(<Command />);
    expect(screen.queryAllByText("Glossary File")).toHaveLength(0);
    expect(screen.getAllByTestId("preview")[0].textContent).toBe(
      "\\# Literal heading  \n\\*\\*literal emphasis\\*\\* \\[literal link\\]\\(https\\:\\/\\/example\\.com\\)  \nLast line",
    );
  });

  test("opens the selected definition with exact copy values and Reveal, retaining the query", async () => {
    render(<Command />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "ré" } });
    const selected = screen.getByRole("heading", { name: "Résumé" }).closest("article");
    if (!selected) {
      throw new Error("Missing selected result.");
    }
    fireEvent.click(within(selected).getByRole("button", { name: "View Full Definition" }));
    const reader = screen.getByRole("heading", { level: 1, name: "Résumé" }).closest("section");
    if (!reader) {
      throw new Error("Missing full definition reader.");
    }
    expect(within(reader).getByText(/Last line/).textContent).not.toContain("Wrong definition");
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Definition" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith(definition));
    fireEvent.click(within(reader).getByRole("button", { name: "Copy Term" }));
    await waitFor(() => expect(raycastApiMocks.copy).toHaveBeenLastCalledWith("Résumé"));
    expect(within(reader).getByRole("button", { name: "Reveal Glossary in Finder" })).toBeTruthy();
    const search = screen.getByRole("textbox", { name: "Search" });
    expect(search instanceof globalThis.HTMLInputElement && search.value).toBe("ré");
    expect(within(selected).getByRole("button", { name: "Reload Glossary" })).toBeTruthy();
  });
});
