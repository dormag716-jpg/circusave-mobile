import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuthSession } from './authContext';

export type MarketType = 'default' | 'susu' | 'tanda' | 'sol' | 'hagbad' | 'pardner';

type Dictionary = {
  circle: string;
  circles: string;
  pot: string;
  round: string;
  organizer: string;
  contribution: string;
};

const MARKETS: Record<MarketType, Dictionary> = {
  default: {
    circle: 'Circle',
    circles: 'Circles',
    pot: 'Pot',
    round: 'Round',
    organizer: 'Organizer',
    contribution: 'Contribution',
  },
  susu: {
    circle: 'Susu',
    circles: 'Susus',
    pot: 'Pot',
    round: 'Hand',
    organizer: 'Banker',
    contribution: 'Hand',
  },
  tanda: {
    circle: 'Tanda',
    circles: 'Tandas',
    pot: 'Pot',
    round: 'Number',
    organizer: 'Organizer',
    contribution: 'Quota',
  },
  sol: {
    circle: 'Sol',
    circles: 'Sols',
    pot: 'Pot',
    round: 'Hand',
    organizer: 'Mother',
    contribution: 'Hand',
  },
  hagbad: {
    circle: 'Hagbad',
    circles: 'Hagbads',
    pot: 'Ayuto',
    round: 'Round',
    organizer: 'Ayuto',
    contribution: 'Contribution',
  },
  pardner: {
    circle: 'Pardner',
    circles: 'Pardners',
    pot: 'Draw',
    round: 'Week',
    organizer: 'Banker',
    contribution: 'Hand',
  }
};

type MarketContextType = {
  market: MarketType;
  setMarket: (market: MarketType) => void;
  t: (term: keyof Dictionary) => string;
};

const MarketContext = createContext<MarketContextType | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { session, setAuthenticatedSession } = useAuthSession();
  const initialMarket = (session?.user?.preferredMarket?.toLowerCase() as MarketType) || 'default';
  const [market, setMarketState] = useState<MarketType>(
    MARKETS[initialMarket] ? initialMarket : 'default'
  );

  useEffect(() => {
    if (session?.user?.preferredMarket) {
      const m = session.user.preferredMarket.toLowerCase() as MarketType;
      if (MARKETS[m]) {
        setMarketState(m);
      }
    }
  }, [session?.user?.preferredMarket]);

  const setMarket = async (newMarket: MarketType) => {
    setMarketState(newMarket);
    if (session) {
      const updatedSession = {
        ...session,
        user: { ...session.user, preferredMarket: newMarket },
      };
      await setAuthenticatedSession(updatedSession);
    }
  };

  const t = (term: keyof Dictionary) => {
    return MARKETS[market][term] || MARKETS.default[term];
  };

  return (
    <MarketContext.Provider value={{ market, setMarket, t }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return context;
}
