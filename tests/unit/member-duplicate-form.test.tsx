// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OperationForm } from "@/components/operation-form";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("offers the existing profile and requires explicit review before a shared contact is saved", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "DUPLICATE_MEMBER",
            message: "Revisa coincidencias",
            matches: [
              { id: "existing", name: "Andrea Ejemplo", active: false },
            ],
          },
        },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ id: "new-member" }));
  vi.stubGlobal("fetch", fetch);
  render(
    <OperationForm
      endpoint="/api/gym/members"
      memberDuplicateReview
      fields={[
        { name: "firstName", label: "Nombres" },
        { name: "phone", label: "Teléfono" },
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText("Nombres"), {
    target: { value: "Mateo" },
  });
  fireEvent.change(screen.getByLabelText("Teléfono"), {
    target: { value: "0990000010" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Andrea Ejemplo" }),
    ).toHaveAttribute("href", "/members/existing"),
  );
  const confirm = screen.getByRole("checkbox", {
    name: /Revisé las coincidencias/,
  });
  expect(confirm).toBeRequired();
  expect(confirm).not.toBeChecked();
  fireEvent.click(confirm);
  fireEvent.change(screen.getByLabelText("Teléfono"), {
    target: { value: "0990000020" },
  });
  expect(confirm).not.toBeChecked();
  fireEvent.click(confirm);
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(screen.getByRole("status")).toBeVisible());
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    duplicateConfirmed: true,
    phone: "0990000020",
  });
});
