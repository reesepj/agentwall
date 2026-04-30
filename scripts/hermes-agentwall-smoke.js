#!/usr/bin/env node
const http = require('http');

const baseUrl = process.argv[2] || 'http://127.0.0.1:3015';
const base = new URL(baseUrl);

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: base.hostname,
      port: base.port || 80,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const results = {};

  results.webExtractLike = await post('/evaluate', {
    agentId: 'hermes',
    sessionId: 'hermes-smoke-network',
    plane: 'network',
    action: 'http_request',
    payload: { url: 'https://api.openai.com/v1/chat/completions', tool: 'web_extract' },
    actor: { channelId: 'telegram:NYX:134', userId: 'reese', roleIds: ['owner'] },
    control: { executionMode: 'normal', enforcedBy: 'hermes' },
    provenance: [{ source: 'user', trustLabel: 'trusted' }],
    flow: { direction: 'egress', labels: ['external_egress'], highRisk: true },
  });

  results.terminalLike = await post('/evaluate', {
    agentId: 'hermes',
    sessionId: 'hermes-smoke-tool',
    plane: 'tool',
    action: 'bash_exec',
    payload: { command: 'git status' },
    actor: { channelId: 'telegram:NYX:134', userId: 'reese', roleIds: ['owner'] },
    control: { executionMode: 'normal', enforcedBy: 'hermes' },
    provenance: [{ source: 'user', trustLabel: 'trusted' }],
    flow: { direction: 'internal', labels: ['destructive_action'], highRisk: true },
  });

  console.log(JSON.stringify({ baseUrl, results }, null, 2));
})();
