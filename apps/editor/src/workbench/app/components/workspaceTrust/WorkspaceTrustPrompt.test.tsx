import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WorkspaceTrustPrompt from "./WorkspaceTrustPrompt";

describe("WorkspaceTrustPrompt", () => {
  it("discloses parent-repository Source Control access", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTrustPrompt
        workspacePath="/projects/axon/services/core"
        parentRepositoryRoot="/projects/axon"
        onReject={vi.fn()}
        onTrust={vi.fn()}
      />,
    );

    expect(markup).toContain("Trust this workspace?");
    expect(markup).toContain("parent Git repository");
    expect(markup).toContain("axon");
    expect(markup).toContain("including files outside");
    expect(markup).toContain("/projects/axon");
  });

  it("keeps the normal trust prompt for a repository-root workspace", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTrustPrompt
        workspacePath="/projects/axon"
        parentRepositoryRoot={null}
        onReject={vi.fn()}
        onTrust={vi.fn()}
      />,
    );

    expect(markup).toContain("Trust this workspace?");
    expect(markup).not.toContain("parent Git repository");
  });
});
