export const ECONOMY = {
  /** 100 centimes = 1.00 $ */
  CENTS_PER_CREDIT: 100,
  /** Solde de départ : 1 000.00 $ */
  INITIAL_BALANCE: 100_000,
  /** Montant du Faucet : +1 000.00 $ */
  FAUCET_AMOUNT: 100_000,
  /** Seuil sous lequel le Faucet est réclamable : strictement en dessous de 100.00 $ */
  FAUCET_MAX_BALANCE_THRESHOLD: 10_000,
  /** Cooldown minimum entre deux Faucets : 3 minutes (180 secondes) */
  FAUCET_COOLDOWN_SECONDS: 180,
  /** Cooldown de la caisse gratuite ($0) : 60 secondes */
  FREE_CASE_COOLDOWN_SECONDS: 60,
  /** Mise minimale : 0.10 $ */
  MIN_WAGER: 10,
  /** Mise maximale : 1 000 000.00 $ */
  MAX_WAGER: 100_000_000,
  /** Total de tickets par caisse (précision 0.001%) */
  CASE_TOTAL_TICKETS: 100_000,
} as const;

export function formatCredits(cents: number): string {
  return (cents / ECONOMY.CENTS_PER_CREDIT).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function creditsToCents(credits: number): number {
  return Math.round(credits * ECONOMY.CENTS_PER_CREDIT);
}

export function centsToCredits(cents: number): number {
  return cents / ECONOMY.CENTS_PER_CREDIT;
}
