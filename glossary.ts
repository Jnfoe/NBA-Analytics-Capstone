/**
 * Glossary of sports betting and machine learning terms.
 * Used by the InfoTooltip component throughout the Analytics page.
 */

export interface GlossaryEntry {
  title: string;
  description: string;
  formula?: string;
  example?: string;
}

export const glossary: Record<string, GlossaryEntry> = {
  ev: {
    title: "Expected Value (EV)",
    description:
      "The average profit or loss you'd expect from a bet if you placed it many times. Positive EV means the bet is theoretically profitable long-term. Negative EV means the house has the edge.",
    formula: "EV = (Win Probability × Payout) − (Loss Probability × Stake)",
    example: "EV of +$5 means you'd average $5 profit per $100 wagered over many bets.",
  },

  impliedProbability: {
    title: "Implied Probability",
    description:
      "The win probability baked into the sportsbook's odds. It includes the vig (bookmaker's margin), so implied probabilities for both sides typically add up to more than 100%.",
    formula: "Implied Prob = |Odds| ÷ (|Odds| + 100)  [for negative odds]",
    example: "-110 odds → 52.4% implied probability.",
  },

  

  edge: {
    title: "Edge",
    description:
      "The gap between the model's probability and the sportsbook's implied probability. A positive edge means the model believes the true odds are better than what the book is offering — a potential betting opportunity.",
    formula: "Edge = Model Probability − Implied Probability",
    example: "Model says 58%, book implies 52% → edge of +6%.",
  },

  kelly: {
    title: "Kelly Criterion",
    description:
      "A bankroll management formula that calculates the optimal fraction of your bankroll to bet given your edge and the odds. A 25% fractional Kelly is used here for safety.",
    formula: "Kelly % = (b×p − q) ÷ b   [b = payout odds, p = win prob, q = loss prob]",
    example: "Kelly of 4% means bet 4% of your total bankroll on this game.",
  },

  brierScore: {
    title: "Brier Score",
    description:
      "A measure of probability forecast accuracy. Lower is better — a perfect model scores 0, random guessing scores 0.25. We use cross-validated Brier scores so the number isn't artificially inflated by training data.",
    formula: "Brier = (1/N) × Σ(forecast − outcome)²",
    example: "Brier of 0.23 is close to random; 0.15 is a good sports model.",
  },

 
  



  

  modelAccuracy: {
    title: "Training Accuracy",
    description:
      "The percentage of training games the model predicted correctly. Note: high training accuracy can indicate overfitting — the cross-validated Brier Score is a more reliable measure of true predictive power.",
  },

  eloRating: {
    title: "Elo Rating",
    description:
      "A running team strength rating updated after every game. Teams gain Elo points for wins and lose them for losses, weighted by margin of victory. Used as a key feature in the ML model.",
  },

  
  

  spread: {
    title: "Point Spread",
    description:
      "A handicap applied to a game to level the playing field. A −5.5 spread means the favored team must win by 6+ points to cover. The model's probability accounts for the spread.",
  },
};
