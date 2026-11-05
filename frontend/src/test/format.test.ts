import { humanize, num, pct, segColor, segmentTitle } from "../lib/format";

describe("format helpers", () => {
  it("humanizes column names", () => {
    expect(humanize("MntGoldProds")).toBe("Gold products");
    expect(humanize("Total_Spend")).toBe("Total spend");
    expect(humanize("NumWebVisitsMonth")).toBe("Web visits month");
  });
  it("formats numbers and percents safely", () => {
    expect(num(null)).toBe("—");
    expect(num(1234.567)).toBe("1,235");
    expect(num(0.1234)).toBe("0.12");
    expect(pct(0.425, 1)).toBe("42.5%");
  });
  it("keeps colours consistent per segment and grey for noise", () => {
    expect(segColor(0)).toBe(segColor(8));
    expect(segColor(-1).color).toBe("#8A93A3");
  });
  it("prefers the AI persona name but never for noise", () => {
    expect(segmentTitle({ id: 0, statistical_name: "High spend", persona_name: "Premium Loyalists" })).toBe("Premium Loyalists");
    expect(segmentTitle({ id: 1, statistical_name: "High spend" })).toBe("High spend");
    expect(segmentTitle({ id: -1, statistical_name: "x", is_noise: true })).toBe("Outliers (noise)");
  });
});
