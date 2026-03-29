# AGENTS.md

## Cursor Cloud specific instructions

This is a Foundry/Solidity smart contract project (ERC404 / ERC20 meme tokens). There is no backend, frontend, or running service — only Solidity contracts, deployment scripts, and tests.

### Toolchain

- **Foundry** (`forge`, `cast`, `anvil`, `chisel`) is the sole build/test toolchain. Installed via `foundryup`.
- Foundry binaries live in `~/.foundry/bin`. Ensure `$HOME/.foundry/bin` is on `PATH`.
- Dependencies are git submodules (`lib/forge-std`, `lib/openzeppelin-contracts`). Initialize with `git submodule update --init --recursive`.

### Key commands

| Action | Command |
|--------|---------|
| Build | `forge build` |
| Build with sizes | `forge build --sizes` |
| Test | `forge test -vvv` |
| Format check | `forge fmt --check` |
| Format fix | `forge fmt` |
| Local chain | `anvil` (default port 8545) |
| Deploy (local) | `forge script script/deploy20.sol --rpc-url http://127.0.0.1:8545 --private-key <KEY> --broadcast` |

### Notes

- The project uses `solc 0.8.23` with `via_ir = true` (IR-based compilation). First builds take ~5s.
- The existing test suite (`test/meme20tax.t.sol`) has **8 pre-existing failures** related to `msg.sender` / ownership mismatches in the test setup. These are bugs in the tests, not in the environment.
- `forge fmt --check` reports pre-existing formatting differences — the codebase was not formatted with `forge fmt`.
- On-chain deployment scripts require env vars for RPC URLs and API keys (see `foundry.toml`). These are **not needed** for local development with `anvil`.
- CI (`.github/workflows/test.yml`) uses `foundry-rs/foundry-toolchain@v1` with `version: nightly`.
