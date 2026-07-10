import { ethers } from 'ethers';

export function buildGasHealth(balanceWei, thresholdWei) {
  const balance = BigInt(balanceWei || 0);
  const threshold = BigInt(thresholdWei || 0);
  const status = balance === 0n ? 'empty' : balance < threshold ? 'low' : 'healthy';
  return {
    status,
    balanceBot: Number(ethers.formatEther(balance)).toFixed(4),
    thresholdBot: Number(ethers.formatEther(threshold)).toFixed(4),
    canExecute: balance >= threshold,
  };
}

export function serialiseExecutionLog(log, parsed, explorer) {
  const amountWei = parsed.args.amountWei ?? 0n;
  const actionId = String(parsed.args.actionId);
  const labels = {
    [ethers.id('BDEX_SWAP_PROOF').toLowerCase()]: 'Policy execution receipt',
    [ethers.id('BRIDGE_PROOF').toLowerCase()]: 'Bridge policy receipt',
    [ethers.id('BDEX_SWAP_V2').toLowerCase()]: 'BDEX V2 swap',
    [ethers.id('BOT_BRIDGE').toLowerCase()]: 'BOT Bridge execution',
  };
  return {
    executionId: parsed.args.executionId,
    agent: parsed.args.agent,
    actionId,
    actionLabel: labels[actionId.toLowerCase()] || 'Agent execution',
    amountBot: ethers.formatEther(amountWei),
    metadataHash: parsed.args.metadataHash,
    timestamp: Number(parsed.args.timestamp),
    blockNumber: Number(log.blockNumber),
    transactionHash: log.transactionHash,
    explorerUrl: `${explorer.replace(/\/$/, '')}/tx/${log.transactionHash}`,
  };
}

export function buildAgentScore({ active, gasStatus, eventCount, hasVaultCode, recentHeartbeat }) {
  let score = 0;
  if (active) score += 30;
  if (gasStatus === 'healthy') score += 25;
  else if (gasStatus === 'low') score += 10;
  if (hasVaultCode) score += 20;
  if (recentHeartbeat) score += 15;
  score += Math.min(10, Number(eventCount || 0));
  return Math.min(100, score);
}

export function isRecent(isoDate, windowMs = 120000) {
  if (!isoDate) return false;
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= windowMs;
}
