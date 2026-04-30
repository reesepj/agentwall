# Install Agentwall

## Requirements

- Node.js 20+
- npm 10+

## Local source install

```bash
git clone https://github.com/your-org/agentwall
cd agentwall
npm install
npm run build
```

Initialize config/policy:

```bash
node dist/cli.js init --mode guarded --allow-hosts api.openai.com
```

Start service:

```bash
node dist/cli.js start
```

## Install `agentwall` launcher command

```bash
./scripts/agentwall-install.sh --yes
agentwall help
```

If your shell PATH includes `/usr/local/bin`, you can now run:

```bash
agentwall init --mode strict --allow-hosts api.openai.com
agentwall doctor
agentwall start
```

## Verify health and policy decisions

```bash
curl http://127.0.0.1:3000/health
npm run smoke:local
```

`npm run smoke:local` checks `/health` plus representative allowed and denied `/evaluate` decisions against the running service. Use `AGENTWALL_URL=http://host:port npm run smoke:local` for a non-default target.

## Uninstall

- User-level launcher only: remove `/usr/local/bin/agentwall`
- Service + common Linux artifacts: `sudo ./scripts/agentwall-uninstall.sh --yes`

