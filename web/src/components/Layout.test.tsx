import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Layout from "@/components/Layout";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renders nav links", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: /record/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /lectures/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("renders the route's content via outlet", () => {
    renderAt("/anywhere");
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
