import { api, ApiError } from "../lib/api";

describe("api client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("surfaces structured backend errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: { code: "analysis_not_found", message: "expired" } }), { status: 404 }));
    await expect(api.analysis("x")).rejects.toMatchObject({ status: 404, code: "analysis_not_found", message: "expired" });
  });

  it("explains network failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("network");
  });

  it("sends the selected features to the segmentation endpoint", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await api.runAnalysis("d1", ["Income", "Recency"], [], { algorithm: "kmeans", n_clusters: 4 });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/analyses$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({ dataset_id: "d1", numeric_features: ["Income", "Recency"], algorithm: "kmeans", n_clusters: 4 });
  });

  it("builds report urls", () => {
    expect(api.reportUrl("a1", "report.html", true)).toMatch(/\/api\/analyses\/a1\/reports\/report\.html\?download=true$/);
  });
});
