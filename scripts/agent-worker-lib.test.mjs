import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { buildAgentScore, buildGasHealth, isRecent, serialiseExecutionLog } from './agent-worker-lib.mjs';

test('gas health reports healthy, low, and empty balances', () => {
  const threshold = ethers.parseEther('0.1');
  assert.equal(buildGasHealth(ethers.parseEther('1'), threshold).status, 'healthy');
  assert.equal(buildGasHealth(ethers.parseEther('0.05'), threshold).status, 'low');
  assert.equal(buildGasHealth(0n, threshold).status, 'empty');
});

test('agent score rewards live, funded, verifiable execution', () => {
  assert.equal(buildAgentScore({ active: true, gasStatus: 'healthy', eventCount: 20, hasVaultCode: true, recentHeartbeat: true }), 100);
  assert.equal(buildAgentScore({ active: false, gasStatus: 'empty', eventCount: 0, hasVaultCode: false, recentHeartbeat: false }), 0);
});

test('recent heartbeat check rejects stale timestamps', () => {
  assert.equal(isRecent(new Date().toISOString()), true);
  assert.equal(isRecent('2020-01-01T00:00:00.000Z'), false);
});

test('execution logs receive human-readable action labels', () => {
  const event = serialiseExecutionLog(
    { blockNumber: 10, transactionHash: '0xabc' },
    { args: { executionId: '0x1', agent: '0x2', actionId: ethers.id('BDEX_SWAP_PROOF'), amountWei: 0n, metadataHash: '0x3', timestamp: 100n } },
    'https://scan.bohr.life',
  );
  assert.equal(event.actionLabel, 'Policy execution receipt');
  assert.equal(event.explorerUrl, 'https://scan.bohr.life/tx/0xabc');
});
