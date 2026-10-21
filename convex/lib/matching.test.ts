import { describe, expect, test } from "vitest";
import { compareTitle, isCloseTitle } from "./matching";

const manga = (title: string, altTitles: string[] = []) => ({
  normalizedTitle: title.toLowerCase(),
  altTitles,
});

describe("close titles", () => {
  test("one title containing the other", () => {
    expect(isCloseTitle("solo leveling", "solo leveling manhwa")).toBe(true);
    expect(isCloseTitle("reborn", "reborn rich")).toBe(true);
  });

  test("sharing most of their words", () => {
    expect(isCloseTitle("the hero cannot rest", "hero cannot rest anymore")).toBe(true);
    expect(isCloseTitle("solo leveling", "solo max level newbie")).toBe(false);
  });

  test("only whole words count", () => {
    expect(isCloseTitle("solo", "solomon")).toBe(false);
  });
});

describe("comparing a page title with a manga", () => {
  test("checks alternative titles too", () => {
    expect(compareTitle("Only I Level Up", manga("solo leveling", ["Only I Level Up"]))).toBe("exact");
    expect(compareTitle("Only I Level Up!", manga("solo leveling", ["Only I Level Up (Manhwa)"]))).toBe("close");
    expect(compareTitle("Tower of God", manga("solo leveling"))).toBeNull();
  });
});
