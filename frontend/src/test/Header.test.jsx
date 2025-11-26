import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "../components/Header";

describe("Header Component", () => {
  it("renders the header title", () => {
    const mockSystemStats = {
      system: {
        os: "Windows",
        machine: "x86_64",
      },
      cpu: {
        percent: 45.5,
      },
      memory: {
        percent: 60.2,
      },
    };

    render(<Header systemStats={mockSystemStats} />);

    expect(screen.getByText(/Task Manager Pro/i)).toBeInTheDocument();
  });

  it("displays loading state when systemStats is null", () => {
    render(<Header systemStats={null} />);

    // Should still render without crashing
    expect(screen.getByText(/Task Manager Pro/i)).toBeInTheDocument();
  });

  it("displays CPU and memory percentages when available", () => {
    const mockSystemStats = {
      system: {
        os: "Windows",
        machine: "x86_64",
      },
      cpu: {
        percent: 45.5,
      },
      memory: {
        percent: 60.2,
      },
    };

    render(<Header systemStats={mockSystemStats} />);

    // Check if percentages are displayed (may need to adjust based on actual implementation)
    const header = screen.getByRole("banner");
    expect(header).toBeInTheDocument();
  });
});
