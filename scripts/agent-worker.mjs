import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

const root = process.cwd();
const port = Number(process.env.AGENT_PORT || 8787);
const rpcUrl = process.env.BOT_TESTNET_RPC_URL || process.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life';
const explorer = process.env.BOT_TESTNET_EXPLORER_URL || process.env.VITE_BOT_TESTNET_EXPLORER_URL || 'https://scan.bohr.life';
const privateKey = process.env.AGENT_PRIVATE_KEY;
const vaultAddress = process.env.VAULT_ADDRESS;
const intervalMs = Number(process.env.AGENT_INTERVAL_MS || 60000);
const actionAmountBot = process.env.AGENT_ACTION_AMOUNT_BOT || '0';
const actionId = ethers.id(process.env.AGENT_ACTION_ID || 'BDEX_SWAP_PROOF');
const statePath = path.join(root, 'work', 'agent-state.json');
const artifactPath = path.join(root, 'artifacts', 'AgentVault.json');

const abi = fs.existsSync(artifactPath)
  ? JSON.parse(fs.readFileSync(artifactPath, 'utf8')).abi
  : [
      'function executeProof(bytes32 actionId,uint256 amountWei,bytes32 metadataHash) returns (bytes32)',
      'event AgentExecution(bytes32 indexed executionId,address indexed agent,bytes32 indexed actionId,uint256 amountWei,bytes32 metadataHash,uint256 timestamp,uint256 blockNumber)',
    ];

let state = {
  status: privateKey && vaultAddress ? 'starting' : 'standby',
  proof: privateKey && vaultAddress
    ? 'Agent worker booting with signing key and vault address.'
    : 'Agent worker is installed but not autonomous yet. Missing AGENT_PRIVATE_KEY and/or VAULT_ADDRESS.',
  network: 'BOT Chain Testnet',
  chainId: 968,
  vaultAddress: vaultAddress || '',
  agentAddress: '',
  lastHeartbeatAt: '',
  lastRunAt: '',
  lastTxHash: '',
  lastExplorerUrl: '',
  lastBlockNumber: '',
  lastError: '',
};

function persist() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function runOnce() {
  state.lastHeartbeatAt = new Date().toISOString();
  if (!privateKey || !vaultAddress) {
    state.status = 'standby';
    state.proof = 'No background on-chain execution: configure AGENT_PRIVATE_KEY and VAULT_ADDRESS.';
    persist();
    return state;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  if (network.chainId !== 968n) {
    throw new Error(`Agent RPC is on chain ${network.chainId}, expected 968.`);
  }

  const vault = new ethers.Contract(vaultAddress, abi, wallet);
  const metadata = {
    app: 'AgentVault',
    agent: 'background-worker',
    action: 'BDEX_SWAP_PROOF',
    policy: 'daily-limit-and-allowlist',
    timestamp: new Date().toISOString(),
  };
  const metadataHash = ethers.id(JSON.stringify(metadata));
  const tx = await vault.executeProof(actionId, ethers.parseEther(actionAmountBot), metadataHash);
  state = {
    ...state,
    status: 'tx-submitted',
    proof: 'Background agent submitted an on-chain AgentExecution proof without a connected user wallet.',
    agentAddress: wallet.address,
    vaultAddress,
    lastRunAt: new Date().toISOString(),
    lastTxHash: tx.hash,
    lastExplorerUrl: `${explorer.replace(/\/$/, '')}/tx/${tx.hash}`,
    lastError: '',
  };
  persist();
  const receipt = await tx.wait();
  state = {
    ...state,
    status: receipt.status === 1 ? 'active' : 'reverted',
    proof: receipt.status === 1
      ? 'Background agent is active: latest proof transaction confirmed on BOT Chain testnet.'
      : 'Background agent submitted a transaction, but it reverted.',
    lastBlockNumber: String(receipt.blockNumber),
  };
  persist();
  return state;
}

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_request, response) => response.json({ ok: true }));
app.get('/status', (_request, response) => response.json(state));
app.post('/run-once', async (_request, response) => {
  try {
    response.json(await runOnce());
  } catch (error) {
    state.status = 'error';
    state.lastError = error.message;
    state.lastHeartbeatAt = new Date().toISOString();
    persist();
    response.status(500).json(state);
  }
});

app.listen(port, () => {
  state.lastHeartbeatAt = new Date().toISOString();
  persist();
  console.log(`AgentVault worker listening on http://127.0.0.1:${port}`);
});

setInterval(async () => {
  try {
    await runOnce();
  } catch (error) {
    state.status = 'error';
    state.lastError = error.message;
    state.lastHeartbeatAt = new Date().toISOString();
    persist();
  }
}, intervalMs);

runOnce().catch((error) => {
  state.status = 'error';
  state.lastError = error.message;
  persist();
});
