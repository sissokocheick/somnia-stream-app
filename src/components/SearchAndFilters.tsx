// components/SearchAndFilters.tsx
import React, { useState, useMemo } from 'react';
import type { StreamInfo } from '../lib/types';

interface FilterOptions {
  searchTerm: string;
  status: 'all' | 'active' | 'paused' | 'completed';
  direction: 'all' | 'sent' | 'received';
  amountRange: { min: string; max: string };
  dateRange: { start: string; end: string };
  sortBy: 'newest' | 'oldest' | 'amount_high' | 'amount_low' | 'progress';
}

interface SearchAndFiltersProps {
  streams: StreamInfo[];
  userAccount: string;
  onFilteredStreams: (streams: StreamInfo[]) => void;
}

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  streams,
  userAccount,
  onFilteredStreams
}) => {
  const [filters, setFilters] = useState<FilterOptions>({
    searchTerm: '',
    status: 'all',
    direction: 'all',
    amountRange: { min: '', max: '' },
    dateRange: { start: '', end: '' },
    sortBy: 'newest'
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const filteredAndSortedStreams = useMemo(() => {
    let filtered = streams.filter(stream => {
      // Recherche textuelle
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matches = 
          stream.streamId.includes(searchLower) ||
          stream.sender.toLowerCase().includes(searchLower) ||
          stream.recipient.toLowerCase().includes(searchLower);
        if (!matches) return false;
      }

      // Filtre par statut
      if (filters.status !== 'all') {
        if (filters.status === 'active' && (!stream.isActive || stream.paused)) return false;
        if (filters.status === 'paused' && !stream.paused) return false;
        if (filters.status === 'completed' && stream.isActive) return false;
      }

      // Filtre par direction
      if (filters.direction !== 'all') {
        const isSender = stream.sender.toLowerCase() === userAccount.toLowerCase();
        const isRecipient = stream.recipient.toLowerCase() === userAccount.toLowerCase();
        
        if (filters.direction === 'sent' && !isSender) return false;
        if (filters.direction === 'received' && !isRecipient) return false;
      }

      // Filtre par montant
      if (filters.amountRange.min && parseFloat(stream.deposit) < parseFloat(filters.amountRange.min)) return false;
      if (filters.amountRange.max && parseFloat(stream.deposit) > parseFloat(filters.amountRange.max)) return false;

      // Filtre par date
      if (filters.dateRange.start) {
        const startDate = new Date(filters.dateRange.start).getTime() / 1000;
        if (stream.startTime < startDate) return false;
      }
      if (filters.dateRange.end) {
        const endDate = new Date(filters.dateRange.end).getTime() / 1000;
        if (stream.startTime > endDate) return false;
      }

      return true;
    });

    // Tri
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'newest':
          return b.startTime - a.startTime;
        case 'oldest':
          return a.startTime - b.startTime;
        case 'amount_high':
          return parseFloat(b.deposit) - parseFloat(a.deposit);
        case 'amount_low':
          return parseFloat(a.deposit) - parseFloat(b.deposit);
        case 'progress':
          return b.progress - a.progress;
        default:
          return 0;
      }
    });

    return filtered;
  }, [streams, filters, userAccount]);

  React.useEffect(() => {
    onFilteredStreams(filteredAndSortedStreams);
  }, [filteredAndSortedStreams, onFilteredStreams]);

  const updateFilter = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      status: 'all',
      direction: 'all',
      amountRange: { min: '', max: '' },
      dateRange: { start: '', end: '' },
      sortBy: 'newest'
    });
  };

  const hasActiveFilters = useMemo(() => {
    return filters.searchTerm !== '' ||
           filters.status !== 'all' ||
           filters.direction !== 'all' ||
           filters.amountRange.min !== '' ||
           filters.amountRange.max !== '' ||
           filters.dateRange.start !== '' ||
           filters.dateRange.end !== '';
  }, [filters]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 space-y-4">
      {/* Barre de recherche principale */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400">🔍</span>
          </div>
          <input
            type="text"
            value={filters.searchTerm}
            onChange={(e) => updateFilter('searchTerm', e.target.value)}
            placeholder="Rechercher par ID, adresse..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            showAdvanced || hasActiveFilters
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          Filtres {hasActiveFilters && `(${Object.values(filters).filter(v => v !== '' && v !== 'all').length})`}
        </button>
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-wrap gap-2">
        <QuickFilter
          active={filters.status === 'active'}
          onClick={() => updateFilter('status', filters.status === 'active' ? 'all' : 'active')}
          icon="🔄"
          label="Actifs"
        />
        <QuickFilter
          active={filters.status === 'paused'}
          onClick={() => updateFilter('status', filters.status === 'paused' ? 'all' : 'paused')}
          icon="⏸️"
          label="En pause"
        />
        <QuickFilter
          active={filters.direction === 'sent'}
          onClick={() => updateFilter('direction', filters.direction === 'sent' ? 'all' : 'sent')}
          icon="📤"
          label="Envoyés"
        />
        <QuickFilter
          active={filters.direction === 'received'}
          onClick={() => updateFilter('direction', filters.direction === 'received' ? 'all' : 'received')}
          icon="📥"
          label="Reçus"
        />
      </div>

      {/* Filtres avancés */}
      {showAdvanced && (
        <div className="border-t border-gray-200 dark:border-gray-600 pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tri */}
            <div>
              <label className="block text-sm font-medium mb-1">Trier par</label>
              <select
                value={filters.sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value as FilterOptions['sortBy'])}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              >
                <option value="newest">Plus récents</option>
                <option value="oldest">Plus anciens</option>
                <option value="amount_high">Montant décroissant</option>
                <option value="amount_low">Montant croissant</option>
                <option value="progress">Progression</option>
              </select>
            </div>

            {/* Statut */}
            <div>
              <label className="block text-sm font-medium mb-1">Statut</label>
              <select
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value as FilterOptions['status'])}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              >
                <option value="all">Tous</option>
                <option value="active">Actifs</option>
                <option value="paused">En pause</option>
                <option value="completed">Terminés</option>
              </select>
            </div>

            {/* Direction */}
            <div>
              <label className="block text-sm font-medium mb-1">Direction</label>
              <select
                value={filters.direction}
                onChange={(e) => updateFilter('direction', e.target.value as FilterOptions['direction'])}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              >
                <option value="all">Tous</option>
                <option value="sent">Envoyés</option>
                <option value="received">Reçus</option>
              </select>
            </div>
          </div>

          {/* Plage de montants */}
          <div>
            <label className="block text-sm font-medium mb-1">Montant</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={filters.amountRange.min}
                onChange={(e) => updateFilter('amountRange', { ...filters.amountRange, min: e.target.value })}
                placeholder="Min"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
              <input
                type="number"
                value={filters.amountRange.max}
                onChange={(e) => updateFilter('amountRange', { ...filters.amountRange, max: e.target.value })}
                placeholder="Max"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
          </div>

          {/* Plage de dates */}
          <div>
            <label className="block text-sm font-medium mb-1">Période de création</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.dateRange.start}
                onChange={(e) => updateFilter('dateRange', { ...filters.dateRange, start: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
              <input
                type="date"
                value={filters.dateRange.end}
                onChange={(e) => updateFilter('dateRange', { ...filters.dateRange, end: e.target.value })}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={resetFilters}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Réinitialiser
            </button>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {filteredAndSortedStreams.length} stream(s) trouvé(s)
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface QuickFilterProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}

const QuickFilter: React.FC<QuickFilterProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
      active
        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-300'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`}
  >
    <span className="mr-1">{icon}</span>
    {label}
  </button>
);

// Hook pour sauvegarder les préférences de filtres
export const useFilterPreferences = () => {
  const [savedFilters, setSavedFilters] = useState<Record<string, FilterOptions>>({});

  const saveFilter = (name: string, filters: FilterOptions) => {
    const newSavedFilters = { ...savedFilters, [name]: filters };
    setSavedFilters(newSavedFilters);
    localStorage.setItem('somniaStreamFilters', JSON.stringify(newSavedFilters));
  };

  const loadFilter = (name: string): FilterOptions | null => {
    return savedFilters[name] || null;
  };

  const deleteFilter = (name: string) => {
    const newSavedFilters = { ...savedFilters };
    delete newSavedFilters[name];
    setSavedFilters(newSavedFilters);
    localStorage.setItem('somniaStreamFilters', JSON.stringify(newSavedFilters));
  };

  React.useEffect(() => {
    const saved = localStorage.getItem('somniaStreamFilters');
    if (saved) {
      try {
        setSavedFilters(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved filters:', e);
      }
    }
  }, []);

  return { savedFilters, saveFilter, loadFilter, deleteFilter };
};