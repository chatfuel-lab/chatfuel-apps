import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestClient } from "../testClient";
import { SalonOnboardingApp } from "./SalonOnboardingApp";

/** The white-screen guard (no provider here on purpose: the module brings its own): the first step renders with no data and no storage. */
describe("Set-up renders", () => {
  it("draws the business step", () => {
    const html = renderToStaticMarkup(
      <SalonOnboardingApp botId="bot-1" client={createTestClient()} view="" setView={() => undefined} params={new URLSearchParams()} setParams={() => undefined} navigate={() => undefined} />,
    );
    expect(html).toContain("Tu negocio");
    expect(html).toContain("Continuar");
  });
});
