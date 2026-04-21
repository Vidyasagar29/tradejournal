import { exitRepository } from "../../data/exit-repository.js";
import { positionRepository } from "../../data/position-repository.js";
import { strategyRepository } from "../../data/strategy-repository.js";
import { tradeRepository } from "../../data/trade-repository.js";

export async function getStrategySnapshot() {
  const [strategies, trades, positions, exits] = await Promise.all([
    strategyRepository.listStrategies(),
    tradeRepository.listTrades({ limit: 2000 }),
    positionRepository.listPositions({ limit: 2000 }),
    exitRepository.listExits({ limit: 3000 })
  ]);

  const positionMap = new Map(positions.map((position) => [position.trade_id, position]));
  const exitMap = exits.reduce((map, exitRow) => {
    const rows = map.get(exitRow.trade_id) || [];
    rows.push(exitRow);
    map.set(exitRow.trade_id, rows);
    return map;
  }, new Map());
  const groups = buildStrategyGroups(strategies, trades).map((strategyGroup) => {
    const strategyTrades = strategyGroup.trades;
    const symbols = [...new Set(strategyTrades.map((trade) => trade.symbol).filter(Boolean))];
    const openTrades = strategyTrades.filter((trade) => {
      const position = positionMap.get(trade.id);
      return Number(position?.remaining_qty || 0) > 0;
    });
    const closedTrades = strategyTrades.length - openTrades.length;
    const totalQty = strategyTrades.reduce((total, trade) => total + Number(trade.qty || 0), 0);
    const remainingQty = openTrades.reduce((total, trade) => {
      const position = positionMap.get(trade.id);
      return total + Number(position?.remaining_qty || 0);
    }, 0);
    const exitedQty = strategyTrades.reduce((total, trade) => {
      const rows = exitMap.get(trade.id) || [];
      return total + rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    }, 0);
    const openValue = openTrades.reduce((total, trade) => {
      const position = positionMap.get(trade.id);
      return total + Number(position?.remaining_qty || 0) * Number(trade.entry_price || 0);
    }, 0);
    const lastTradeDate = strategyTrades
      .map((trade) => trade.trade_date)
      .filter(Boolean)
      .sort()
      .at(-1) || "-";

    return {
      id: strategyGroup.id,
      name: strategyGroup.name,
      tradeCount: strategyTrades.length,
      openCount: openTrades.length,
      closedCount: closedTrades,
      totalQty,
      remainingQty,
      exitedQty,
      openValue,
      symbols,
      lastTradeDate,
      trades: strategyTrades
        .map((trade) => {
          const position = positionMap.get(trade.id);
          return {
            id: trade.id,
            tradeDate: trade.trade_date,
            symbol: trade.symbol,
            action: trade.action,
            instrument: trade.instrument,
            optionType: trade.option_type || "-",
            strike: trade.strike ?? "-",
            qty: Number(trade.qty || 0),
            remainingQty: Number(position?.remaining_qty || 0),
            entryPrice: Number(trade.entry_price || 0),
            tag: trade.tag || "-",
            expiry: trade.expiry || "-"
          };
        })
        .sort((left, right) => String(right.tradeDate).localeCompare(String(left.tradeDate)))
    };
  })
    .filter((group) => group.tradeCount > 0)
    .sort((left, right) => right.tradeCount - left.tradeCount || left.name.localeCompare(right.name));

  return {
    strategies: groups,
    summary: {
      strategyCount: groups.length,
      openStrategies: groups.filter((group) => group.openCount > 0).length,
      multiSymbolStrategies: groups.filter((group) => group.symbols.length > 1).length,
      totalOpenValue: groups.reduce((total, group) => total + group.openValue, 0)
    }
  };
}

function buildStrategyGroups(strategies, trades) {
  const strategyIdMap = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const groups = new Map();

  trades.forEach((trade) => {
    const strategy = trade.strategy_id ? strategyIdMap.get(trade.strategy_id) : null;
    const strategyName = strategy?.strategy_name || "Unassigned";
    const key = strategy?.id ? `id:${strategy.id}` : `name:${strategyName.toLowerCase()}`;
    const existing = groups.get(key) || {
      id: strategy?.id || null,
      name: strategyName,
      trades: []
    };

    existing.trades.push(trade);
    groups.set(key, existing);
  });

  return [...groups.values()];
}
