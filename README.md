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

## What needs official BOT testnet inputs

The frontend refuses to fake BOT testnet connectivity. Add the official values when available:

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

The intended vault contract should enforce:

- owner address
- agent allowlist
- daily spend limit
- allowed protocol selectors or target addresses
- emergency pause
- signed owner approval for policy updates
- event emission for every proposal and execution

Until the contract is deployed, this frontend signs approval intents and exports policy/audit state without pretending that an on-chain vault already exists.
