import { createHash } from "crypto";
import {
  ManifestDrift,
  ManifestFingerprint,
  ManifestSubjectType,
} from "../types";

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashManifest(manifest: unknown, source?: string): ManifestFingerprint {
  const normalized = canonicalize(manifest);
  const hash = createHash("sha256").update(normalized).digest("hex");
  return {
    algorithm: "sha256",
    hash,
    manifestSize: Buffer.byteLength(normalized, "utf8"),
    source,
  };
}

export function detectManifestDrift(params: {
  subjectId: string;
  subjectType: ManifestSubjectType;
  manifest: unknown;
  approvedFingerprint?: ManifestFingerprint;
  source?: string;
}): ManifestDrift {
  const currentFingerprint = hashManifest(params.manifest, params.source);
  const approvedFingerprint = params.approvedFingerprint;

  if (!approvedFingerprint) {
    return {
      subjectId: params.subjectId,
      subjectType: params.subjectType,
      status: "untracked",
      changed: false,
      requiresReapproval: true,
      reason: "No approved manifest fingerprint recorded",
      currentFingerprint,
    };
  }

  if (approvedFingerprint.hash !== currentFingerprint.hash) {
    return {
      subjectId: params.subjectId,
      subjectType: params.subjectType,
      status: "drifted",
      changed: true,
      requiresReapproval: true,
      reason: "Manifest hash drift detected; re-approval required",
      currentFingerprint,
      approvedFingerprint,
    };
  }

  return {
    subjectId: params.subjectId,
    subjectType: params.subjectType,
    status: "approved",
    changed: false,
    requiresReapproval: false,
    reason: "Manifest fingerprint matches approved state",
    currentFingerprint,
    approvedFingerprint,
  };
}
