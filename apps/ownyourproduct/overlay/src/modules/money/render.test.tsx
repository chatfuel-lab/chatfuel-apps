import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestClient } from "../testClient";
import { MoneyApp } from "./MoneyApp";

/** The white-screen guard (no provider here on purpose: the module brings its own): no auth context renders the sign-in notice, not a crash. */
describe("Money renders", () => {
  it("draws the header and the sign-in notice", () => {
    const html = renderToStaticMarkup(
      <MoneyApp botId="bot-1" client={createTestClient()} view="" setView={() => undefined} params={new URLSearchParams()} setParams={() => undefined} navigate={() => undefined} />,
    );
    expect(html).toContain("Dinero");
    expect(html).toContain("Inicia sesión");
  });
});
