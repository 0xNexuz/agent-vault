import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ethers } from 'ethers';

const root = process.cwd();
const envPath = path.join(root, '.env');
const deploymentPath = path.join(root, 'deployments', 'bot-testnet.json');
const rpcUrl = 'https://rpc.bohr.life';
const explorer = 'https://scan.bohr.life';

function readEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function writeEnv(env) {
  const orderedKeys = [
    'VITE_BOT_TESTNET_CHAIN_ID',
    'VITE_BOT_TESTNET_NAME',
    'VITE_BOT_TESTNET_RPC_URL',
    'VITE_BOT_TESTNET_EXPLORER_URL',
    'VITE_BOT_TESTNET_SYMBOL',
    'VITE_AGENT_STATUS_URL',
    'BOT_TESTNET_RPC_URL',
    'BOT_TESTNET_EXPLORER_URL',
    'DEPLOYER_PRIVATE_KEY',
    'AGENT_PRIVATE_KEY',
    'AGENT_ADDRESS',
    'VAULT_ADDRESS',
    'VAULT_DAILY_LIMIT_BOT',
    'AGENT_PORT',
    'AGENT_INTERVAL_MS',
    'AGENT_ACTION_AMOUNT_BOT',
  ];

  const lines = [
    '# Local AgentVault testnet secrets.',
    '# Keep this file private. Do not paste these keys into chat or commit them.',
  ];

  for (const key of orderedKeys) {
    if (env[key] !== undefined) lines.push(`${key}=${env[key]}`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (!orderedKeys.includes(key)) lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, `${lines.join('\n')}\n`);
}

function ensureWallet(env, privateKeyName, addressName) {
  if (env[privateKeyName]) {
    const wallet = new ethers.Wallet(env[privateKeyName]);
    env[addressName] = wallet.address;
    return wallet;
  }

  const wallet = ethers.Wallet.createRandom();
  env[privateKeyName] = wallet.privateKey;
  env[addressName] = wallet.address;
  return wallet;
}

async function balanceOf(provider, address) {
  return Number(ethers.formatEther(await provider.getBalance(address)));
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

const env = {
  VITE_BOT_TESTNET_CHAIN_ID: '0x3c8',
  VITE_BOT_TESTNET_NAME: 'BOT Chain Testnet',
  VITE_BOT_TESTNET_RPC_URL: rpcUrl,
  VITE_BOT_TESTNET_EXPLORER_URL: explorer,
  VITE_BOT_TESTNET_SYMBOL: 'BOT',
  VITE_AGENT_STATUS_URL: 'http://127.0.0.1:8787/status',
  BOT_TESTNET_RPC_URL: rpcUrl,
  BOT_TESTNET_EXPLORER_URL: explorer,
  VAULT_DAILY_LIMIT_BOT: '50',
  AGENT_PORT: '8787',
  AGENT_INTERVAL_MS: '60000',
  AGENT_ACTION_AMOUNT_BOT: '0',
  ...readEnv(),
};

const deployer = ensureWallet(env, 'DEPLOYER_PRIVATE_KEY', 'DEPLOYER_ADDRESS');
const agent = ensureWallet(env, 'AGENT_PRIVATE_KEY', 'AGENT_ADDRESS');
writeEnv(env);

printHeader('AgentVault local setup');
console.log('Fresh testnet-only wallets are stored in .env on this computer.');
console.log('Do not use these wallets for mainnet funds.');
console.log(`Deployer address: ${deployer.address}`);
console.log(`Agent address:    ${agent.address}`);
console.log(`Explorer:         ${explorer}`);

const provider = new ethers.JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 968n) {
  throw new Error(`RPC returned chain ${network.chainId}, expected BOT Chain testnet 968.`);
}

const deployerBalance = await balanceOf(provider, deployer.address);
const agentBalance = await balanceOf(provider, agent.address);

printHeader('Balances');
console.log(`Deployer: ${deployerBalance} BOT`);
console.log(`Agent:    ${agentBalance} BOT`);

if (deployerBalance <= 0 || agentBalance <= 0) {
  printHeader('Next step');
  console.log('Fund BOTH addresses above with BOT testnet tokens, then run this again:');
  console.log('npm run setup:agentvault');
  console.log('\nThe deployer pays contract deployment gas. The agent pays gas for autonomous proof transactions.');
  process.exit(0);
}

if (!env.VAULT_ADDRESS) {
  printHeader('Deploying vault');
  const result = spawnSync(process.execPath, ['scripts/deploy-vault.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
      AGENT_ADDRESS: agent.address,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    env.VAULT_ADDRESS = deployment.vaultAddress;
    writeEnv(env);
  }
}

printHeader('Ready');
console.log(`Vault address: ${env.VAULT_ADDRESS}`);
console.log(`Vault explorer: ${explorer}/address/${env.VAULT_ADDRESS}`);
console.log('\nStart the autonomous worker with:');
console.log('npm run agent:worker');
console.log('\nOnce it sends a proof transaction, the app will show the latest tx hash and explorer link.');
