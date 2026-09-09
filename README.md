# ERC404

ERC404 is an experimental, mixed ERC20 / ERC721 implementation with native liquidity and fractionalization. While these two standards are not designed to be mixed, this implementation strives to do so in as robust a manner as possible while minimizing tradeoffs.

In it's current implementation, ERC404 effectively isolates ERC20 / ERC721 standard logic or introduces pathing where possible. Pathing could best be described as a lossy encoding scheme in which token amount data and ids occupy shared space under the assumption that negligible token transfers occupying id space do not or do not need to occur.

This standard is entirely experimental and unaudited, while testing has been conducted in an effort to ensure execution is as accurate as possible. The nature of overlapping standards, however, does imply that integrating protocols will not fully understand their mixed function.

## ERC721 Notes

The ERC721 implementation here is a bit non-standard, where tokens are instead burned and minted repeatedly as per underlying / fractional transfers. This is a aspect of the concept's design is deliberate, with the goal of creating an NFT that has native fractionalization, liquidity and encourages some aspects of trading / engagement to farm unique trait sets.

## Setup

You need to whitelist owner of the smart contract as well as the uniswap contract created by factory below.
Maybe also the token contract itself to WL?!

## Uniswap V3

To predict the address of your Uniswap V3 Pool, use the following simulator: https://dashboard.tenderly.co/shared/simulation/92dadba3-92c3-46a2-9ccc-c793cac6c33d.

To use:

Click Re-Simulate in the top right corner.
Update the simulation parameters: tokenA (your token address), tokenB (typically WETH, or 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2), and set the fee tier to either 500, 3000 (for 0.3%), or 10000 (for 1%).
Run Simulate, and then expand the Input/Output section. The output on the right column will show the derived pool address.

Also check this https://github.com/Pandora-Labs-Org/erc404?tab=readme-ov-file

## Experiments

See [`experiments/`](./experiments) for local tools that sit next to the contracts.

- [`experiments/dexscreener-screener`](./experiments/dexscreener-screener) — DexScreener agent that finds sub-$3M tokens and checks website, Twitter, liquidity, and paid promo

