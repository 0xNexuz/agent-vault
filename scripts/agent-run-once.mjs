import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['scripts/agent-worker.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AGENT_PORT: process.env.AGENT_PORT || '8788',
    AGENT_INTERVAL_MS: '86400000',
  },
  stdio: 'inherit',
});

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, Number(process.env.AGENT_RUN_ONCE_TIMEOUT_MS || 45000));

child.on('exit', (code) => {
  clearTimeout(timeout);
  process.exit(code ?? 0);
});
