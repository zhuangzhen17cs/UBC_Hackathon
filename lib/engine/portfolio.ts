type PaperAction = "BUY" | "SELL" | "HOLD";

export type Position = {
  usdc: number;
  sol: number;
};

export type Fill = Position & {
  /** USD notional that actually traded. 0 means the order was skipped. */
  filledUsd: number;
};

export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function roundSol(amount: number): number {
  return Math.round(amount * 1e8) / 1e8;
}

/** Mark a paper book to the latest SOL price. Missing price values SOL at 0. */
export function equityUsd(position: Position, priceUsd: number | null): number {
  const price = priceUsd != null && priceUsd > 0 ? priceUsd : 0;
  return roundUsd(position.usdc + position.sol * price);
}

/**
 * Paper fill at `priceUsd`. Buys spend USDC and receive SOL.
 * Sells do the reverse. Amounts are clamped to the cash or SOL on hand.
 */
export function applyFill(
  position: Position,
  action: PaperAction,
  amountUsd: number,
  priceUsd: number,
): Fill {
  if (action === "HOLD" || !(priceUsd > 0) || !(amountUsd > 0)) {
    return { usdc: roundUsd(position.usdc), sol: roundSol(position.sol), filledUsd: 0 };
  }

  if (action === "BUY") {
    const spend = roundUsd(Math.min(amountUsd, Math.max(position.usdc, 0)));
    if (spend < 1) {
      return { usdc: roundUsd(position.usdc), sol: roundSol(position.sol), filledUsd: 0 };
    }
    return {
      usdc: roundUsd(position.usdc - spend),
      sol: roundSol(position.sol + spend / priceUsd),
      filledUsd: spend,
    };
  }

  const solSold = Math.min(amountUsd / priceUsd, Math.max(position.sol, 0));
  const proceeds = roundUsd(solSold * priceUsd);
  if (proceeds < 1) {
    return { usdc: roundUsd(position.usdc), sol: roundSol(position.sol), filledUsd: 0 };
  }
  return {
    usdc: roundUsd(position.usdc + proceeds),
    sol: roundSol(position.sol - solSold),
    filledUsd: proceeds,
  };
}
