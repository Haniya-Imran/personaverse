import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Heatmap, ShareBars } from "../components/charts";
import { Claim, EmptyState } from "../components/ui";

describe("components", () => {
  it("labels observed vs hypothesis claims", () => {
    render(<ul><Claim text="Spends twice the average" basis="observed" /><Claim text="Values quality" basis="hypothesis" /></ul>);
    expect(screen.getByText("Observed")).toBeInTheDocument();
    expect(screen.getByText("Hypothesis")).toBeInTheDocument();
  });
  it("empty state links to the next step", () => {
    render(<MemoryRouter><EmptyState title="No data" body="Load data" to="/app/data" cta="Go" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/app/data");
  });
  it("renders segment shares and comparison means", () => {
    render(<ShareBars items={[{ id: 0, label: "A", share: 0.4, size: 40 }, { id: 1, label: "B", share: 0.6, size: 60 }]} />);
    expect(screen.getByText("60 · 60.0%")).toBeInTheDocument();
    render(<Heatmap cols={[{ label: "Spend" }]} rows={[{ segment: 0, values: [1.2], means: [1185] }]} names={{ 0: "Loyal" }} />);
    expect(screen.getByText("1,185")).toBeInTheDocument();
  });
});
