import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, setCsrf, write } from "./api";
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());
describe("write recovery", () => {
  it("retains conflict status and details for explicit duplicate confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response(409, { error: "Duplikat", details: { duplicate_id: 7 } }),
        ),
    );
    await expect(write("/purchases", {})).rejects.toMatchObject({
      status: 409,
      details: { duplicate_id: 7 },
    });
  });
  it("refreshes CSRF once and repeats the same write only after the known pre-write rejection", async () => {
    setCsrf("old");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(400, { error: "CSRF-Token fehlt oder ist ungültig." }),
      )
      .mockResolvedValueOnce(
        response(200, { csrf_token: "fresh", authenticated: true }),
      )
      .mockResolvedValueOnce(response(200, { id: 1 }));
    vi.stubGlobal("fetch", fetch);
    await expect(write("/purchases", { merchant: "Markt" })).resolves.toEqual({
      id: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toBe("/api/session");
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[2][1].body);
    expect(fetch.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("fresh");
  });
  it("never repeats a rejected business validation or loops on a second CSRF rejection", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(400, { error: "Menge ungültig" }));
    vi.stubGlobal("fetch", fetch);
    await expect(write("/purchases", {})).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch
      .mockReset()
      .mockResolvedValueOnce(
        response(400, { error: "CSRF-Token fehlt oder ist ungültig." }),
      )
      .mockResolvedValueOnce(response(200, { csrf_token: "fresh" }))
      .mockResolvedValueOnce(
        response(400, { error: "CSRF-Token fehlt oder ist ungültig." }),
      );
    await expect(write("/purchases", {})).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
