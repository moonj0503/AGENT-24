import { describe, expect, it } from "vitest";
import { isOverlayPreviewRoute } from "./overlay-preview-route";

describe("overlay preview route", () => {
  it("is only enabled on the exact development route", () => {
    expect(isOverlayPreviewRoute("/overlay-preview", true)).toBe(true);
    expect(isOverlayPreviewRoute("/overlay-preview", false)).toBe(false);
    expect(isOverlayPreviewRoute("/", true)).toBe(false);
  });
});
