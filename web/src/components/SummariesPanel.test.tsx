import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SummariesPanel from "@/components/SummariesPanel";
import type { Summary, Template } from "@/types";

const templates: Template[] = [
  { id: "t1", name: "Study Guide", prompt: "{transcript}", is_default: true, created_at: "" },
  { id: "t2", name: "Outline", prompt: "{transcript}", is_default: true, created_at: "" },
  { id: "t3", name: "Anki", prompt: "{transcript}", is_default: false, created_at: "" },
];
const summaries: Summary[] = [
  { id: "s1", template_id: "t1", content: "# notes A", model: "claude-opus-4-7", created_at: "" },
];

function renderPanel(props: React.ComponentProps<typeof SummariesPanel>) {
  return render(<MemoryRouter><SummariesPanel {...props} /></MemoryRouter>);
}

describe("SummariesPanel", () => {
  it("renders an existing summary by template name", () => {
    renderPanel({
      summaries,
      templates,
      anthropicKeySet: true,
      onGenerate: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(screen.getAllByText("Study Guide")[0]).toBeInTheDocument();
    expect(screen.getByText(/# notes A/)).toBeInTheDocument();
  });

  it("calls onGenerate when a template is selected and Generate is clicked", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderPanel({
      summaries,
      templates,
      anthropicKeySet: true,
      onGenerate,
      onDelete: vi.fn(),
    });
    const select = screen.getByLabelText(/generate from template/i);
    await user.selectOptions(select, "t3");
    await user.click(screen.getByRole("button", { name: /^generate$/i }));
    expect(onGenerate).toHaveBeenCalledWith("t3");
  });

  it("shows a hint when the Anthropic key is missing", () => {
    renderPanel({
      summaries: [],
      templates,
      anthropicKeySet: false,
      onGenerate: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(screen.getByText(/add an anthropic api key/i)).toBeInTheDocument();
  });
});
