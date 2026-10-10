import { describe, it, expect } from "vitest";
import { json } from "./db.js";

describe("json.parse", () => {
  it("parses valid JSON string", () => {
    expect(json.parse<string[]>('["a","b"]', [])).toEqual(["a", "b"]);
  });

  it("falls back when input is null/undefined", () => {
    expect(json.parse<string[]>(null, ["fallback"])).toEqual(["fallback"]);
    expect(json.parse<string[]>(undefined, ["fallback"])).toEqual(["fallback"]);
  });

  it("falls back on empty string", () => {
    expect(json.parse<number[]>("", [42])).toEqual([42]);
  });

  it("falls back on invalid JSON (doesn't throw)", () => {
    expect(json.parse<unknown>("not json {", { ok: false })).toEqual({ ok: false });
    expect(json.parse<number[]>("undefined", [])).toEqual([]);
  });

  it("preserves typed structure on success", () => {
    const r = json.parse<{ name: string; n: number }>('{"name":"x","n":3}', { name: "", n: 0 });
    expect(r.name).toBe("x");
    expect(r.n).toBe(3);
  });
});

describe("json.stringify", () => {
  it("serialises objects", () => {
    expect(json.stringify({ a: 1 })).toBe('{"a":1}');
  });
  it("serialises arrays", () => {
    expect(json.stringify([1, 2])).toBe("[1,2]");
  });
});
