import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Backpack, Coins, PackageOpen, Trash2 } from 'lucide-react';
import {
  RARITIES,
  formatCredits,
  type InventoryItemDTO,
  type ItemRarity,
} from '@castino/shared';
import { apiFetch } from '../lib/api';
import { sound } from '../lib/sound';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';

export const InventoryPage: React.FC = () => {
  const { setBalance } = useAuthStore();
  const { pushToast } = useUIStore();

  const [items, setItems] = useState<InventoryItemDTO[]>([]);
  const [rarityFilter, setRarityFilter] = useState<'ALL' | ItemRarity>('ALL');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: InventoryItemDTO[] }>('/api/inventory');
      setItems(res.items);
    } catch {
      pushToast('Erreur de chargement de l’inventaire', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInventory();
  }, []);

  const handleSellOne = async (invId: string) => {
    setBusyId(invId);
    try {
      const res = await apiFetch<{ sellPrice: number; newBalance: number; itemName: string }>(
        `/api/inventory/${invId}/sell`,
        { method: 'POST' }
      );
      setItems((prev) => prev.filter((i) => i.id !== invId));
      setBalance(res.newBalance);
      sound.win();
      pushToast(`${res.itemName} vendu pour +${formatCredits(res.sellPrice)} cr`, 'success');
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur lors de la revente', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSellAll = async () => {
    if (items.length === 0) return;
    setBusyId('ALL');
    try {
      const res = await apiFetch<{
        soldCount: number;
        totalCredited: number;
        newBalance: number;
      }>('/api/inventory/sell-all', { method: 'POST' });
      setItems([]);
      setBalance(res.newBalance);
      sound.win();
      pushToast(
        `${res.soldCount} objets vendus pour +${formatCredits(res.totalCredited)} crédits !`,
        'success'
      );
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : 'Erreur lors de la vente groupée', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems =
    rarityFilter === 'ALL' ? items : items.filter((i) => i.item.rarity === rarityFilter);
  const totalValue = items.reduce((sum, i) => sum + i.item.value, 0);

  return (
    <div className="space-y-6">
      <div className="bg-[#1a2c38] border border-[#2f4553] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2.5">
            <Backpack className="w-6 h-6 text-[#00e701]" />
            <span>Mon Inventaire ({items.length})</span>
          </h1>
          <p className="text-xs sm:text-sm text-stake-muted mt-1">
            Valeur totale estimée :{' '}
            <span className="font-mono font-bold text-[#00e701]">
              {formatCredits(totalValue)} crédits
            </span>
          </p>
        </div>

        <button
          disabled={items.length === 0 || busyId === 'ALL'}
          onClick={handleSellAll}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#071824] font-extrabold text-xs sm:text-sm transition disabled:opacity-40"
        >
          <Coins className="w-4 h-4" />
          <span>Tout vendre (+{formatCredits(totalValue)} cr)</span>
        </button>
      </div>

      {/* Filtres de rareté */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRarityFilter(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              rarityFilter === r
                ? 'bg-[#213743] border-[#00e701] text-white'
                : 'bg-[#1a2c38] border-[#2f4553] text-stake-muted hover:text-white'
            }`}
          >
            {r === 'ALL' ? 'Toutes les raretés' : RARITIES[r].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-stake-muted">Chargement de vos skins...</div>
      ) : visibleItems.length === 0 ? (
        <div className="bg-[#1a2c38] border border-[#2f4553] rounded-2xl p-12 text-center space-y-4">
          <PackageOpen className="w-12 h-12 text-stake-muted mx-auto" />
          <div className="text-base font-bold">Aucun objet dans cette catégorie</div>
          <p className="text-xs text-stake-muted">
            Ouvrez des caisses pour collectionner des skins rares ou les revendre contre des crédits !
          </p>
          <Link
            to="/cases"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00e701] text-[#071824] font-extrabold text-xs"
          >
            Explorer les Caisses
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {visibleItems.map((inv) => {
            const rMeta = RARITIES[inv.item.rarity];
            return (
              <div
                key={inv.id}
                style={{ borderBottomColor: rMeta.color }}
                className="bg-[#213743] border border-[#2f4553] border-b-4 rounded-xl p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      style={{ color: rMeta.color }}
                      className="text-[10px] font-black uppercase"
                    >
                      {rMeta.label}
                    </span>
                    {inv.originCase && (
                      <span className="text-[10px] text-stake-muted truncate max-w-[85px]">
                        {inv.originCase.name}
                      </span>
                    )}
                  </div>
                  <img
                    src={inv.item.imageUrl}
                    alt={inv.item.name}
                    className="w-24 h-24 object-contain mx-auto my-2"
                  />
                  <div className="text-[11px] text-stake-muted text-center">
                    {inv.item.weaponOrCategory}
                  </div>
                  <div className="text-xs font-extrabold text-white text-center truncate">
                    {inv.item.name}
                  </div>
                </div>

                <button
                  disabled={busyId === inv.id}
                  onClick={() => void handleSellOne(inv.id)}
                  className="mt-3 w-full py-2 rounded-lg bg-[#0f1923] hover:bg-[#00e701] hover:text-[#071824] border border-[#2f4553] hover:border-[#00e701] font-mono text-xs font-extrabold text-[#00e701] flex items-center justify-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vendre {formatCredits(inv.item.value)}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
