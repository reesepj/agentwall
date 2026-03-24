import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { EgressPolicy, HeartbeatConfig } from "./types";

export interface AgentwallConfig {
  port: number;
  host: string;
  logLevel: string;
  approval: {
    mode: "auto" | "always" | "never";
    timeoutMs: number;
    webhookUrl?: string;
    backend?: "memory" | "file";
    persistencePath?: string;
  };
  policy: {
    defaultDecision: "allow" | "deny";
    configPath?: string;
  };
  dlp: {
    enabled: boolean;
    redactSecrets: boolean;
  };
  egress: EgressPolicy;
  manifestIntegrity: {
    enabled: boolean;
    approvedHashesPath?: string;
  };
  watchdog: HeartbeatConfig;
}

export type LegacyHarborConfig = AgentwallConfig;

const defaults: AgentwallConfig = {
  port: 3000,
  host: "127.0.0.1",
  logLevel: "info",
  approval: {
    mode: "auto",
    timeoutMs: 30000,
    backend: "file",
    persistencePath: "./agentwall-approvals.json",
  },
  policy: {
    defaultDecision: "deny",
  },
  dlp: {
    enabled: true,
    redactSecrets: true,
  },
  egress: {
    enabled: true,
    defaultDeny: true,
    allowPrivateRanges: false,
    allowedHosts: [],
    allowedSchemes: ["https"],
    allowedPorts: [443],
  },
  manifestIntegrity: {
    enabled: true,
  },
  watchdog: {
    enabled: true,
    staleAfterMs: 15000,
    timeoutMs: 30000,
    killSwitchMode: "deny_all",
  },
};

export function loadConfig(configPath?: string): AgentwallConfig {
  let fileConfig: Partial<AgentwallConfig> = {};

  const candidatePaths = [
    configPath,
    process.env["AGENTWALL_CONFIG"],
    process.env["HARBOR_CONFIG"], // legacy compatibility only
    "./agentwall.config.yaml",
    "./agentwall.config.yml",
    "./harbor.config.yaml", // legacy compatibility only
    "./harbor.config.yml", // legacy compatibility only
    "./examples/config.yaml",
  ].filter(Boolean) as string[];

  for (const candidatePath of candidatePaths) {
    const resolved = path.resolve(candidatePath);
    if (fs.existsSync(resolved)) {
      const raw = fs.readFileSync(resolved, "utf-8");
      fileConfig = yaml.load(raw) as Partial<AgentwallConfig>;
      break;
    }
  }

  const merged = deepMerge(defaults as unknown as Record<string, unknown>, fileConfig as Record<string, unknown>);

  // Backward-compatibility for older config files that still use `ssrf`.
  if ("ssrf" in (fileConfig as Record<string, unknown>) && !("egress" in (fileConfig as Record<string, unknown>))) {
    merged["egress"] = deepMerge(
      defaults.egress as unknown as Record<string, unknown>,
      ((fileConfig as Record<string, unknown>)["ssrf"] as Record<string, unknown>) ?? {}
    );
  }

  return merged as unknown as AgentwallConfig;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue) && targetValue && typeof targetValue === "object") {
      result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}
