/**
 * Economy
 * -------
 * Persistent meta-game currency + inventory. Coins collected in runs (plus
 * a score bonus) bank into a localStorage wallet; customization items with
 * a price must be bought before they can be equipped. Placeholder content:
 * prices live on the item catalogs in CustomizationState.
 */

const COINS_KEY = 'coneZoneCoins';
const OWNED_KEY = 'coneZoneOwned';
const STARTING_COINS = 150; // enough to buy something on day one

export class Economy {
  coins: number;
  private owned: Set<string>;

  constructor() {
    const stored = localStorage.getItem(COINS_KEY);
    this.coins = stored === null ? STARTING_COINS : Number(stored) || 0;
    try {
      this.owned = new Set(JSON.parse(localStorage.getItem(OWNED_KEY) ?? '[]'));
    } catch {
      this.owned = new Set();
    }
  }

  /** Items with price 0 are always owned. */
  isOwned(itemId: string, price: number): boolean {
    return price <= 0 || this.owned.has(itemId);
  }

  canAfford(price: number): boolean {
    return this.coins >= price;
  }

  /** Returns true if the purchase went through. */
  buy(itemId: string, price: number): boolean {
    if (this.isOwned(itemId, price)) return true;
    if (!this.canAfford(price)) return false;
    this.coins -= price;
    this.owned.add(itemId);
    this.persist();
    return true;
  }

  addCoins(amount: number): void {
    this.coins += Math.max(0, Math.round(amount));
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(COINS_KEY, String(this.coins));
    localStorage.setItem(OWNED_KEY, JSON.stringify([...this.owned]));
  }
}
