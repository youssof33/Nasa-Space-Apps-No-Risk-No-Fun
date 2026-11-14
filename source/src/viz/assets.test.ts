import { describe, expect, it } from "vitest";
import { pickVariant, type AssetEntry } from "./assets";

const entry: AssetEntry = {
  source: "https://example.test/source.jpg",
  sourcePage: "https://example.test",
  credit: "Example",
  license: "Example",
  variants: [
    { width: 4096, height: 2048, file: "large.webp", bytes: 3, sha256: "c" },
    { width: 1024, height: 512, file: "small.webp", bytes: 1, sha256: "a" },
    { width: 2048, height: 1024, file: "medium.webp", bytes: 2, sha256: "b" },
  ],
};

describe("pickVariant", () => {
  it("picks the smallest variant that meets the requested width", () => {
    expect(pickVariant(entry, 1000).file).toBe("small.webp");
    expect(pickVariant(entry, 1500).file).toBe("medium.webp");
  });

  it("falls back to the largest variant when the request is too wide", () => {
    expect(pickVariant(entry, 8192).file).toBe("large.webp");
  });

  it("rejects entries without variants", () => {
    expect(() => pickVariant({ ...entry, variants: [] }, 1024)).toThrow();
  });
});
