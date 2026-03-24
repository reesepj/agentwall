import { EgressPolicy, NetworkInspection, NetworkRequest } from "../../types";

const IPV4_PRIVATE_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.6[4-9]\./,
  /^100\.[7-9]\d\./,
  /^100\.1[01]\d\./,
  /^100\.12[0-7]\./,
  /^0\./,
  /^255\./,
];

const IPV6_PRIVATE_PATTERNS: RegExp[] = [
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe8[0-9a-f]:/i,
  /^fe9[0-9a-f]:/i,
  /^fea[0-9a-f]:/i,
  /^feb[0-9a-f]:/i,
];

const PRIVATE_HOSTNAMES = new Set(["localhost", "broadcasthost", "ip6-localhost", "ip6-loopback"]);

const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.google.com",
]);

const SUSPICIOUS_INTERNAL_SUFFIXES = [".internal", ".local", ".localhost"];

export const DEFAULT_EGRESS_POLICY: EgressPolicy = {
  enabled: true,
  defaultDeny: true,
  allowPrivateRanges: false,
  allowedHosts: [],
  allowedSchemes: ["https"],
  allowedPorts: [443],
};

export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isPrivateHostname(hostname: string): boolean {
  return (
    PRIVATE_HOSTNAMES.has(hostname) ||
    SUSPICIOUS_INTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

export function isPrivateIp(hostname: string): boolean {
  return IPV4_PRIVATE_PATTERNS.some((pattern) => pattern.test(hostname)) ||
    IPV6_PRIVATE_PATTERNS.some((pattern) => pattern.test(hostname));
}

function getPort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : -1;
}

function makeDenied(reason: string, riskLevel: NetworkInspection["riskLevel"], blockedCategory: string, privateRange = false, ssrf = false, egressDenied = false): NetworkInspection {
  return {
    allowed: false,
    reason,
    riskLevel,
    ssrf,
    privateRange,
    blockedCategory,
    egressDenied,
  };
}

export function inspectNetworkRequest(
  req: NetworkRequest,
  policy: Partial<EgressPolicy> = {}
): NetworkInspection {
  const effectivePolicy = { ...DEFAULT_EGRESS_POLICY, ...policy };
  let parsed: URL;
  try {
    parsed = new URL(req.url);
  } catch {
    return makeDenied("Malformed URL", "high", "invalid-url");
  }

  const hostname = parsed.hostname.toLowerCase();
  const scheme = parsed.protocol.slice(0, -1).toLowerCase();
  const port = getPort(parsed);

  if (METADATA_HOSTS.has(hostname)) {
    return makeDenied(`Cloud metadata endpoint blocked: ${hostname}`, "critical", "cloud-metadata", true, true, true);
  }

  const privateRange = isPrivateHostname(hostname) || isPrivateIp(hostname);
  if (privateRange && !effectivePolicy.allowPrivateRanges) {
    return makeDenied(`Private or local target blocked: ${hostname}`, "critical", "private-target", true, true, true);
  }

  if (parsed.username || parsed.password) {
    return makeDenied("URLs with embedded credentials are blocked", "high", "embedded-credentials", false, false, true);
  }

  if (!effectivePolicy.allowedSchemes.includes(scheme)) {
    return makeDenied(`Scheme blocked by egress policy: ${scheme}`, "high", "blocked-scheme", false, false, true);
  }

  if (!effectivePolicy.allowedPorts.includes(port)) {
    return makeDenied(`Port blocked by egress policy: ${port}`, "high", "blocked-port", false, false, true);
  }

  if (effectivePolicy.allowedHosts.includes(hostname)) {
    return {
      allowed: true,
      reason: "Host is in the configured egress allowlist",
      riskLevel: privateRange ? "medium" : "low",
      ssrf: false,
      privateRange,
      egressDenied: false,
    };
  }

  if (effectivePolicy.defaultDeny && hostname !== "") {
    return makeDenied(`Host is not allowlisted by egress policy: ${hostname}`, privateRange ? "critical" : "high", "default-deny-egress", privateRange, privateRange, true);
  }

  return {
    allowed: true,
    reason: "Request passes network inspection",
    riskLevel: privateRange ? "medium" : "low",
    ssrf: false,
    privateRange,
    egressDenied: false,
  };
}
