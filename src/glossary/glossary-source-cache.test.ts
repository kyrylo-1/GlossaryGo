import { describe, expect, test, vi } from "vitest";

import { createGlossarySourceCache } from "./glossary-source-cache";
import type { Term } from "../utils/types";

const apiTerms: readonly Term[] = [{ definition: "Application Programming Interface", term: "API" }];

// eslint-disable-next-line max-lines-per-function
describe("glossary source cache", () => {
  test("reads every reload but parses an exact decoded-source match once", async () => {
    const readSource = vi.fn<() => Promise<string>>().mockResolvedValue("terms: []\n");
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    expect(await cache.load("/synthetic/glossary.yaml")).toBe(apiTerms);
    expect(await cache.load("/synthetic/glossary.yaml")).toBe(apiTerms);

    expect(readSource).toHaveBeenCalledTimes(2);
    expect(parseSource).toHaveBeenCalledOnce();
  });

  test("reparses changed source including an otherwise invisible byte-order mark", async () => {
    const readSource = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("terms: []\n")
      .mockResolvedValueOnce("\uFEFFterms: []\n");
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    await cache.load("/synthetic/glossary.yaml");
    await cache.load("/synthetic/glossary.yaml");

    expect(parseSource).toHaveBeenCalledTimes(2);
    expect(parseSource).toHaveBeenLastCalledWith("\uFEFFterms: []\n");
  });

  test("does not reuse an active source for a different glossary path", async () => {
    const readSource = vi.fn<() => Promise<string>>().mockResolvedValue("terms: []\n");
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    await cache.load("/synthetic/first.yaml");
    await cache.load("/synthetic/second.yaml");

    expect(parseSource).toHaveBeenCalledTimes(2);
  });

  test("clears after a read error so recovery parses the next successful reload", async () => {
    const readSource = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("terms: []\n")
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce("terms: []\n");
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    await cache.load("/synthetic/glossary.yaml");
    await expect(cache.load("/synthetic/glossary.yaml")).rejects.toThrow("missing");
    await cache.load("/synthetic/glossary.yaml");

    expect(parseSource).toHaveBeenCalledTimes(2);
  });

  test("clears after source validation rejects a changed reload", async () => {
    const readSource = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("terms: []\n")
      .mockResolvedValueOnce("terms: invalid\n")
      .mockResolvedValueOnce("terms: []\n");
    const parseSource = vi
      .fn<(source: string) => readonly Term[]>()
      .mockReturnValueOnce(apiTerms)
      .mockImplementationOnce(() => {
        throw new Error("invalid source");
      })
      .mockReturnValueOnce(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    await cache.load("/synthetic/glossary.yaml");
    await expect(cache.load("/synthetic/glossary.yaml")).rejects.toThrow("invalid source");
    await cache.load("/synthetic/glossary.yaml");

    expect(parseSource).toHaveBeenCalledTimes(3);
  });

  test("shares an exact-source parse across overlapping reloads", async () => {
    const firstRead = Promise.withResolvers<string>();
    const readSource = vi
      .fn<() => Promise<string>>()
      .mockReturnValue(firstRead.promise)
      .mockResolvedValueOnce("terms: []\n");
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    const first = cache.load("/synthetic/glossary.yaml");
    const second = cache.load("/synthetic/glossary.yaml");
    firstRead.resolve("terms: []\n");

    await expect(Promise.all([first, second])).resolves.toEqual([apiTerms, apiTerms]);
    expect(readSource).toHaveBeenCalledTimes(2);
    expect(parseSource).toHaveBeenCalledOnce();
  });

  test("does not parse a source after its load is cancelled while reading", async () => {
    const pendingRead = Promise.withResolvers<string>();
    const readSource = vi.fn<() => Promise<string>>().mockReturnValue(pendingRead.promise);
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });
    const controller = new AbortController();
    const loading = cache.load("/synthetic/glossary.yaml", controller.signal);

    controller.abort();
    pendingRead.resolve("terms: []\n");

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(parseSource).not.toHaveBeenCalled();
  });

  test("forgets a source when the command session is cleared", async () => {
    const readSource = vi.fn<() => Promise<string>>().mockResolvedValue("terms: []\n");
    const parseSource = vi.fn<(source: string) => readonly Term[]>().mockReturnValue(apiTerms);
    const cache = createGlossarySourceCache({ parseSource, readSource });

    await cache.load("/synthetic/glossary.yaml");
    cache.clear();
    await cache.load("/synthetic/glossary.yaml");

    expect(parseSource).toHaveBeenCalledTimes(2);
  });
});
