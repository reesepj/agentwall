import { describe, expect, it } from "@jest/globals";
import { inspectNetworkRequest } from "../src/planes/network/ssrf";

describe("SSRF Inspector", () => {
  it("denies external HTTPS URLs by default when not allowlisted", () => {
    const result = inspectNetworkRequest({ url: "https://api.openai.com/v1/chat/completions" });
    expect(result.allowed).toBe(false);
    expect(result.blockedCategory).toBe("default-deny-egress");
    expect(result.egressDenied).toBe(true);
  });

  it("allows external HTTPS URLs when allowlisted", () => {
    const result = inspectNetworkRequest(
      { url: "https://api.openai.com/v1/chat/completions" },
      { allowedHosts: ["api.openai.com"] }
    );
    expect(result.allowed).toBe(true);
    expect(result.ssrf).toBe(false);
  });

  it("blocks localhost", () => {
    const result = inspectNetworkRequest({ url: "http://localhost:9200" });
    expect(result.allowed).toBe(false);
    expect(result.ssrf).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    const result = inspectNetworkRequest({ url: "http://127.0.0.1/admin" });
    expect(result.allowed).toBe(false);
    expect(result.ssrf).toBe(true);
    expect(result.riskLevel).toBe("critical");
  });

  it("blocks metadata endpoints", () => {
    const result = inspectNetworkRequest(
      { url: "http://169.254.169.254/latest/meta-data/" },
      { allowedSchemes: ["http", "https"], allowedPorts: [80, 443] }
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedCategory).toBe("cloud-metadata");
    expect(result.riskLevel).toBe("critical");
  });

  it("blocks embedded credentials", () => {
    const result = inspectNetworkRequest(
      { url: "https://user:pass@example.com/data" },
      { allowedHosts: ["example.com"] }
    );
    expect(result.allowed).toBe(false);
    expect(result.blockedCategory).toBe("embedded-credentials");
  });

  it("blocks non-https schemes by default", () => {
    const result = inspectNetworkRequest({ url: "http://example.com" }, { allowedHosts: ["example.com"], allowedPorts: [80, 443] });
    expect(result.allowed).toBe(false);
    expect(result.blockedCategory).toBe("blocked-scheme");
  });

  it("allows private ranges only when explicitly permitted and allowlisted", () => {
    const result = inspectNetworkRequest(
      { url: "https://192.168.1.1/" },
      { allowPrivateRanges: true, allowedHosts: ["192.168.1.1"] }
    );
    expect(result.allowed).toBe(true);
    expect(result.privateRange).toBe(true);
  });

  it("returns high risk for malformed URLs", () => {
    const result = inspectNetworkRequest({ url: "not-a-url" });
    expect(result.allowed).toBe(false);
    expect(result.riskLevel).toBe("high");
  });
});
