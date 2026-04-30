# Agentwall / Athena Credential Access

Updated: 2026-04-26

Hermes/Athena credential access is set up as a dedicated-agent Bitwarden lane, not Reese's personal vault.

## Commands

```bash
hermes-bw-agent-status
hermes-bw-agent-init
hermes-bw-agent-session
hermes-bw-agent-search <search-term>
hermes-bw-agent-allow <item-id> [domain]
hermes-bw-agent-get <allowlisted-item-id>
hermes-bw-agent-fill-login <domain> [--username-selector CSS] [--password-selector CSS] [--totp-selector CSS]
hermes-bw-agent-lock
```

## Storage

Isolated Bitwarden CLI appdata:

```text
/home/reese/.local/share/hermes-bitwarden-agent/appdata
```

Agent Bitwarden config and local unlock material:

```text
/home/reese/.config/hermes/bitwarden-agent
```

Allowlist:

```text
/home/reese/.config/hermes/bitwarden-agent/allowlist.json
```

## Operating model

- Dedicated Hermes-only Bitwarden account or vault path.
- No personal full-vault access.
- No primary email, banking, trading, crypto custody, password-manager recovery, or owner/admin credentials.
- `hermes-bw-agent-get` blocks every item not in `allowed_item_ids`.
- `hermes-bw-agent-fill-login` can fill the active Chromium login page through CDP without printing the password into terminal output; it requires the domain to be in `allowed_domains` and does not auto-submit.
- Use this only for low-risk agent-owned accounts and scoped service credentials.

## One-time activation

Create the dedicated Bitwarden account first, then run locally:

```bash
hermes-bw-agent-init
```

Do not paste the master password into chat. The script prompts locally and writes the credential file with strict permissions.
