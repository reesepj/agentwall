import { describe, expect, it } from "@jest/globals";
import { detectManifestDrift, hashManifest } from "../src/integrity/manifest";

describe("Manifest integrity", () => {
  it("produces stable hashes for equivalent manifests", () => {
    const left = hashManifest({ b: 2, a: 1 });
    const right = hashManifest({ a: 1, b: 2 });
    expect(left.hash).toBe(right.hash);
  });

  it("detects drift and requires reapproval", () => {
    const approvedFingerprint = hashManifest({ command: "stdio", tools: ["search"] });
    const result = detectManifestDrift({
      subjectId: "mcp:search",
      subjectType: "mcp_server",
      manifest: { command: "stdio", tools: ["search", "write"] },
      approvedFingerprint,
    });
    expect(result.status).toBe("drifted");
    expect(result.requiresReapproval).toBe(true);
    expect(result.changed).toBe(true);
  });
});
