# AgentVault

Policy-bound treasuries for autonomous agents on BOT Chain.

AgentVault is a production-ready frontend shell for a BOT Chain sprint build. It connects to an injected EVM wallet, reads live account/network/balance state, prepares policy-bound vault actions, signs owner approval intents, and exports an audit log.

## What is live

- Wallet connection through `window.ethereum`
- Chain ID detection
- Native balance read with `eth_getBalance`
- Wallet network add/switch flow when BOT testnet values are configured
- Owner approval signing with `personal_sign`
- Policy toggles, daily spend limit, audit filtering, audit export, and agent proposal UI

## BOT Chain testnet

AgentVault is configured for BOT Chain testnet:

- Chain ID: `968` (`0x3c8`)
- RPC: `https://rpc.bohr.life`
- Native token: `BOT`
- Total supply: `150 Million`
- Explorer: `https://scan.bohr.life/`

The default app config already includes these values. You can still override them with environment variables:

```bash
cp .env.example .env
```

Then fill:

```bash
VITE_BOT_TESTNET_CHAIN_ID=0x...
VITE_BOT_TESTNET_RPC_URL=https://...
VITE_BOT_TESTNET_EXPLORER_URL=https://...
```

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Deployment

Vercel:

```bash
vercel --prod
```

GitHub:

```bash
git init
git add .
git commit -m "Initial AgentVault frontend"
gh repo create agent-vault --public --source=. --remote=origin --push
```

## Contract path

The included `contracts/AgentVault.sol` enforces:

- owner address
- agent allowlist
- daily spend limit
- allowed protocol selectors or target addresses
- event emission for every proposal and execution

### Simple setup

Use the guided setup command first. It creates fresh testnet-only deployer and agent wallets locally in `.env`, prints the addresses to fund, checks BOT Chain testnet balances, deploys the vault after both wallets have BOT, and saves the deployed `VAULT_ADDRESS`.

```bash
npm run setup:agentvault
```

If it says the wallets need funds, send BOT testnet tokens to both printed addresses and run the same command again:

```bash
npm run setup:agentvault
```

Do not paste funded private keys into chat. The safe path is to let the script create local testnet wallets, fund only those addresses, and keep `.env` private.

Manual deployment is still available:

```bash
DEPLOYER_PRIVATE_KEY=0x... AGENT_ADDRESS=0x... npm run deploy:vault
```

## Background agent

The worker in `scripts/agent-worker.mjs` is the proof that agents can act after the user disconnects. It runs outside the browser, signs with `AGENT_PRIVATE_KEY`, calls `executeProof(...)` on the deployed vault, and emits an explorer-visible `AgentExecution` event.

Run locally:

```bash
npm run agent:worker
```

Run through GitHub Actions:

1. Add repository secrets `AGENT_PRIVATE_KEY` and `VAULT_ADDRESS`.
2. Trigger **AgentVault autonomous worker** manually, or let the 15-minute schedule run.
3. Verify activity from the latest tx hash / vault events on `https://scan.bohr.life`.

Without those secrets and a deployed vault, the app intentionally shows `standby` rather than pretending agents are autonomous.
