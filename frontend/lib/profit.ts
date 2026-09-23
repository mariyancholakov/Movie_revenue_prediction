// Rough share of the worldwide gross that reaches the studio. Theaters keep
// about half (more abroad, less in the US), so "profit" is the studio's cut
// minus the production budget. Marketing isn't in the reported budget.
export const STUDIO_SHARE = 0.5;

export const estProfit = (predictedGross: number, budget: number) =>
  predictedGross * STUDIO_SHARE - budget;
