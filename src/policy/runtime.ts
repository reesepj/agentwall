import * as fs from "fs";
import * as path from "path";
import { PolicyRule } from "../types";
import { loadDeclarativePolicyRules } from "./loader";

type LoggerLike = Pick<Console, "error" | "warn">;

export interface PolicyRuntimeOptions {
  logger?: LoggerLike;
  watch?: boolean;
  watchDebounceMs?: number;
}

export interface ReloadResult {
  reloaded: boolean;
  rules: PolicyRule[];
  error?: Error;
}

export class FileBackedPolicyRuntime {
  private readonly policyPath: string;
  private readonly logger: LoggerLike;
  private readonly watchEnabled: boolean;
  private readonly watchDebounceMs: number;
  private rules: PolicyRule[];
  private watcher?: fs.FSWatcher;
  private reloadTimer?: NodeJS.Timeout;

  constructor(policyPath: string, options: PolicyRuntimeOptions = {}) {
    this.policyPath = path.resolve(policyPath);
    this.logger = options.logger ?? console;
    this.watchEnabled = options.watch ?? true;
    this.watchDebounceMs = options.watchDebounceMs ?? 50;
    this.rules = loadDeclarativePolicyRules(this.policyPath);
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  reload(): ReloadResult {
    try {
      const nextRules = loadDeclarativePolicyRules(this.policyPath);
      this.rules = nextRules;
      return { reloaded: true, rules: this.getRules() };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to reload policy file ${this.policyPath}: ${failure.message}`);
      return { reloaded: false, rules: this.getRules(), error: failure };
    }
  }

  start(onReload: (result: ReloadResult) => void): void {
    if (!this.watchEnabled || this.watcher) {
      return;
    }

    this.watcher = fs.watch(this.policyPath, () => {
      if (this.reloadTimer) {
        clearTimeout(this.reloadTimer);
      }

      this.reloadTimer = setTimeout(() => {
        this.reloadTimer = undefined;
        onReload(this.reload());
      }, this.watchDebounceMs);
    });

    this.watcher.on("error", (error) => {
      this.logger.warn(`Policy watcher error for ${this.policyPath}: ${error.message}`);
    });
  }

  stop(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = undefined;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }
}
