import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "../components/Sidebar";

describe("Sidebar Component", () => {
  it("renders all menu items", () => {
    const mockSetCurrentTab = vi.fn();

    render(
      <Sidebar currentTab="dashboard" setCurrentTab={mockSetCurrentTab} />
    );

    expect(screen.getByTitle("Dashboard")).toBeInTheDocument();
    expect(screen.getByTitle("Performance")).toBeInTheDocument();
    expect(screen.getByTitle("Processes")).toBeInTheDocument();
    expect(screen.getByTitle("Process Tree")).toBeInTheDocument();
  });

  it("highlights the active tab", () => {
    const mockSetCurrentTab = vi.fn();

    render(
      <Sidebar currentTab="performance" setCurrentTab={mockSetCurrentTab} />
    );

    const performanceButton = screen.getByTitle("Performance");
    expect(performanceButton).toHaveClass("from-accent-primary");
  });

  it("calls setCurrentTab when a tab is clicked", async () => {
    const user = userEvent.setup();
    const mockSetCurrentTab = vi.fn();

    render(
      <Sidebar currentTab="dashboard" setCurrentTab={mockSetCurrentTab} />
    );

    const processesButton = screen.getByTitle("Processes");
    await user.click(processesButton);

    expect(mockSetCurrentTab).toHaveBeenCalledWith("processes");
  });

  it("renders settings button at the bottom", () => {
    const mockSetCurrentTab = vi.fn();

    render(
      <Sidebar currentTab="dashboard" setCurrentTab={mockSetCurrentTab} />
    );

    expect(screen.getByTitle("Settings")).toBeInTheDocument();
  });
});
