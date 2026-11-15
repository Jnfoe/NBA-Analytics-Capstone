import React from "react";
import { motion } from "framer-motion";

interface ProbabilityBarProps {
  homeProb: number;
  awayProb: number;
}

export function ProbabilityBar({ homeProb, awayProb }: ProbabilityBarProps) {
  // Normalize in case probabilities don't add to exactly 100 due to vig
  const total = homeProb + awayProb;
  const homePercent = (homeProb / total) * 100;
  const awayPercent = (awayProb / total) * 100;

  return (
    <div className="w-full mt-4">
      <div className="flex justify-between text-xs font-semibold mb-2">
        <span className="text-foreground font-display tracking-wider">{homeProb.toFixed(1)}%</span>
        <span className="text-muted-foreground font-display text-[10px] uppercase tracking-widest">Win Probability</span>
        <span className="text-muted-foreground font-display tracking-wider">{awayProb.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full bg-card border border-white/5 rounded-full overflow-hidden flex shadow-inner">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${homePercent}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-white/60"
        />

        <div className="h-full w-[2px] bg-background z-10" />

        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${awayPercent}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-white/25"
        />
      </div>
    </div>
  );
}
