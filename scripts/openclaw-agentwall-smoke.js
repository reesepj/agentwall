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
        } catch (error) {
          reject(new Error(`Failed to parse ${path} response: ${raw}`));
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

  results.toolEvaluate = await post('/evaluate', {
    agentId: 'openclaw-smoke',
    sessionId: 'openclaw-smoke-tool',
    plane: 'tool',
    action: 'bash_exec',
    payload: { command: 'ls' },
    actor: { channelId: 'telegram:NYX:134', userId: 'reese', roleIds: ['owner'] },
    control: { executionMode: 'normal' },
    provenance: [{ source: 'user', trustLabel: 'trusted' }],
    flow: { direction: 'internal', labels: ['destructive_action'], highRisk: true },
  });

  results.networkEvaluate = await post('/evaluate', {
    agentId: 'openclaw-smoke',
    sessionId: 'openclaw-smoke-network',
    plane: 'network',
    action: 'http_request',
    payload: { url: 'https://api.openai.com/v1/chat/completions' },
    actor: { channelId: 'telegram:NYX:134', userId: 'reese', roleIds: ['owner'] },
    control: { executionMode: 'normal' },
    provenance: [{ source: 'user', trustLabel: 'trusted' }],
    flow: { direction: 'egress', labels: ['external_egress'], highRisk: true },
  });

  console.log(JSON.stringify({ baseUrl, results }, null, 2));
})();
