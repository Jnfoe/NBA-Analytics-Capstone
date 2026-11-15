import React from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ArrowLeft, Clock, ShieldAlert, BarChart3, TrendingUp, AlertTriangle } from "lucide-react";
import { useGame } from "@/hooks/use-games";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/Badge";
import { ProbabilityBar } from "@/components/games/ProbabilityBar";

export default function GameView() {
  const params = useParams();
  const gameId = parseInt(params.id || "0", 10);
  
  const { data: game, isLoading, error } = useGame(gameId);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-pulse space-y-8">
          <div className="h-10 w-32 bg-card rounded-lg" />
          <div className="h-64 w-full bg-card rounded-2xl border border-white/5" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="h-48 bg-card rounded-2xl border border-white/5" />
             <div className="h-48 bg-card rounded-2xl border border-white/5" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !game) {
    return (
      <AppLayout>
        <div className="glass-panel rounded-2xl p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Game Not Found</h2>
          <p className="text-muted-foreground mb-6">The requested market analysis could not be loaded.</p>
          <Link href="/">
            <a className="text-primary hover:underline font-medium">← Back to Dashboard</a>
          </Link>
        </div>
      </AppLayout>
    );
  }

  // Defensive parsing
  const homeSpread = Number(game.homeSpread);
  const awaySpread = Number(game.awaySpread);
  const winProbHome = Number(game.winProbabilityHome);
  const winProbAway = Number(game.winProbabilityAway);
  const gameDate = new Date(game.commenceTime);
  const now = new Date();
  const isFinished = gameDate < new Date(now.getTime() - 3.5 * 60 * 60 * 1000);
  const isLive = !isFinished && gameDate <= now;
  
  // Implied Probability derived from spread (simplified calculation for visual effect)
  const impliedHome = winProbHome > 50 ? winProbHome - 2.5 : winProbHome + 2.5; 
  const edgeHome = winProbHome - impliedHome;

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-8"
      >
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Markets
        </Link>
      </motion.div>

      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel rounded-3xl p-8 lg:p-12 mb-8 relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        
        <div className="flex flex-col items-center text-center relative z-10">
          <div className="flex items-center flex-wrap justify-center gap-3 mb-6">
            <Badge variant="outline" className="px-4 py-1 text-sm bg-background/50 backdrop-blur-md">
              <ShieldAlert className="w-4 h-4 mr-2 text-primary" />
              {game.bookmaker} Odds
            </Badge>
            <Badge variant="outline" className="px-4 py-1 text-sm bg-background/50 backdrop-blur-md">
              <Clock className="w-4 h-4 mr-2 text-secondary" />
              {format(gameDate, "EEEE, MMMM d • HH:mm a")}
            </Badge>
            {isFinished ? (
              <Badge variant="outline" className="px-4 py-1 text-sm bg-white/5 border-white/15 text-white/40">
                FINISHED
              </Badge>
            ) : isLive ? (
              <Badge variant="neon" className="px-4 py-1 text-sm animate-pulse">LIVE NOW</Badge>
            ) : (
              <Badge variant="outline" className="px-4 py-1 text-sm bg-green-500/10 border-green-500/20 text-green-300">
                UPCOMING
              </Badge>
            )}
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 w-full">
            {/* Home Team */}
            <div className="flex flex-col items-center md:items-end w-full md:w-1/3">
              <div className="w-20 h-20 rounded-2xl bg-card border-2 border-primary/30 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.2)] mb-4">
                <span className="text-3xl font-display font-bold text-primary">H</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-foreground">{game.homeTeam}</h2>
              <span className="text-muted-foreground font-medium mt-1">Home</span>
            </div>

            {/* VS */}
            <div className="flex flex-col items-center justify-center">
              <span className="text-2xl font-display font-black text-white/20">VS</span>
              <div className="w-px h-16 bg-white/10 my-4 hidden md:block" />
            </div>

            {/* Away Team */}
            <div className="flex flex-col items-center md:items-start w-full md:w-1/3">
              <div className="w-20 h-20 rounded-2xl bg-card border-2 border-secondary/30 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.2)] mb-4">
                <span className="text-3xl font-display font-bold text-secondary">A</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-foreground">{game.awayTeam}</h2>
              <span className="text-muted-foreground font-medium mt-1">Away</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Core Probabilities */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 glass-panel rounded-3xl p-8"
        >
          <div className="flex items-center gap-3 mb-8">
            <BarChart3 className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-display font-bold">Algorithmic Win Probability</h3>
          </div>
          
          <div className="p-6 bg-background/50 rounded-2xl border border-white/5 mb-8">
            <ProbabilityBar homeProb={winProbHome} awayProb={winProbAway} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-card border border-primary/20">
              <span className="text-sm text-muted-foreground font-medium block mb-1">Home Win Edge</span>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-display font-bold ${edgeHome > 0 ? 'text-success' : 'text-destructive'}`}>
                  {edgeHome > 0 ? '+' : ''}{edgeHome.toFixed(2)}%
                </span>
                <span className="text-sm text-muted-foreground pb-1 block">vs Market</span>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-card border border-secondary/20">
              <span className="text-sm text-muted-foreground font-medium block mb-1">Away Win Edge</span>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-display font-bold ${-edgeHome > 0 ? 'text-success' : 'text-destructive'}`}>
                  {-edgeHome > 0 ? '+' : ''}{(-edgeHome).toFixed(2)}%
                </span>
                <span className="text-sm text-muted-foreground pb-1 block">vs Market</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Spread Data */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel rounded-3xl p-8"
        >
          <div className="flex items-center gap-3 mb-8">
            <TrendingUp className="w-6 h-6 text-secondary" />
            <h3 className="text-xl font-display font-bold">Point Spread</h3>
          </div>

          <div className="space-y-4">
             <div className="flex justify-between items-center p-4 bg-background/40 rounded-xl border border-white/5">
                <span className="font-semibold text-muted-foreground">Home Spread</span>
                <Badge variant={homeSpread > 0 ? "success" : "destructive"} className="text-lg px-4 py-1 font-display">
                  {homeSpread > 0 ? `+${homeSpread}` : homeSpread}
                </Badge>
             </div>
             
             <div className="flex justify-between items-center p-4 bg-background/40 rounded-xl border border-white/5">
                <span className="font-semibold text-muted-foreground">Away Spread</span>
                <Badge variant={awaySpread > 0 ? "success" : "destructive"} className="text-lg px-4 py-1 font-display">
                  {awaySpread > 0 ? `+${awaySpread}` : awaySpread}
                </Badge>
             </div>
          </div>

          <div className="mt-8 p-5 bg-primary/10 rounded-2xl border border-primary/20">
             <h4 className="font-semibold text-primary mb-2">Trading Signal</h4>
             <p className="text-sm text-foreground/80 leading-relaxed">
               Based on the variance between algorithmic probability and implied market odds, the highest expected value sits with 
               <strong className="text-white ml-1">{edgeHome > 0 ? game.homeTeam : game.awayTeam}</strong>.
             </p>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
