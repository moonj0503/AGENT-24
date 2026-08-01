import { afterEach, expect, it, vi } from "vitest";
import { fetchGapHistory } from "./api";
import { fetchRecoveryBrief } from "../recovery/api";
afterEach(() => vi.unstubAllGlobals());
it("rejects malformed History and Recovery API data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ fixture: true }), { status: 200 })));
  await expect(fetchGapHistory()).rejects.toThrow();
  await expect(fetchRecoveryBrief("gap-backend")).rejects.toThrow();
});
