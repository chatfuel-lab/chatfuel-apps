import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestClient } from "../testClient";
import { CommentStudioApp } from "./CommentStudioApp";

/** The white-screen guard (no provider here on purpose: the module brings its own): the frame renders before any data arrives. */
describe("Comment Studio renders", () => {
  it("draws its header and loading state without data", () => {
    const html = renderToStaticMarkup(
      <CommentStudioApp
          botId="bot-1"
          client={createTestClient()}
          view=""
          setView={() => undefined}
          params={new URLSearchParams()}
          setParams={() => undefined}
          navigate={() => undefined}
        />,
    );
    expect(html).toContain("Comment Studio");
    expect(html).toContain("Leyendo tu bot");
  });
});
