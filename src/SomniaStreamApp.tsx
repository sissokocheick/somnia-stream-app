import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useRef,
} from "react";
import { ethers } from "ethers";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

// Import seulement ce qui est nécessaire et sûr
// import { SOMNIA_CHAIN_ID, SOMNIA_EXPLORER, SOMNIA_RPC, SOMNIA_STREAM, TEST_TOKEN } from './lib/constants';
// import type { AppAction, AppState, BN, StreamInfo, StreamRaw } from './lib/types';

// AJOUTE CETTE LIGNE EN HAUT DE SomniaStreamApp.tsx

import {
  SOMNIA_RPC,
  SOMNIA_CHAIN_ID,
  SOMNIA_EXPLORER,
  SOMNIA_STREAM,
  TEST_TOKEN
} from './lib/constants.ts';

// Types locaux
type BN = ethers.BigNumber;

interface StreamInfo {
  streamId: string;
  sender: string;
  recipient: string;
  token: string;
  deposit: string;
  ratePerSecond: string;
  remaining: string;
  paused: boolean;
  startTime: number;
  stopTime: number;
  lastWithdrawTime: number;
  progress: number;
  withdrawable: string;
  totalWithdrawn: string;
  isActive: boolean;
  _raw: {
    deposit: BN;
    remaining: BN;
    ratePerSecond: BN;
  };
}

interface StreamRaw {
  sender: string;
  recipient: string;
  deposit: BN;
  token: string;
  startTime: BN;
  stopTime: BN;
  ratePerSecond: BN;
  remainingBalance: BN;
  lastWithdrawTime: BN;
  isPaused: boolean;
  pausedTime: BN;
  totalWithdrawn: BN;
  isActive: boolean;
}

interface AppState {
  account: string;
  chainId: number | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  streams: StreamInfo[];
  activeStream: StreamInfo | null;
  tokenInfo: {
    decimals: number;
    symbol: string;
    name: string;
    balance: string;
    allowance: string;
    _rawBalance?: string;
    _rawAllowance?: string;
  };
}

type AppAction = 
  | { type: "SET_ACCOUNT"; payload: string }
  | { type: "SET_CHAIN_ID"; payload: number }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_STREAMS"; payload: StreamInfo[] }
  | { type: "SET_ACTIVE_STREAM"; payload: StreamInfo | null }
  | { type: "SET_TOKEN_INFO"; payload: Partial<AppState['tokenInfo']> }
  | { type: "UPDATE_STREAM"; payload: StreamInfo }
  | { type: "RESET" };

// ABI nettoyé sans doublons pour éviter les erreurs
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function faucet() returns (bool)"
];

const STREAM_ABI = [
  "function getStreamsAsSender(address) view returns (uint256[])",
  "function getStreamsAsRecipient(address) view returns (uint256[])",
  // La chaîne du tuple ci-dessous correspond EXACTEMENT à l'ordre du struct Solidity
  "function getStream(uint256) view returns (tuple(address sender, address recipient, uint256 deposit, address token, uint256 startTime, uint256 stopTime, uint256 ratePerSecond, uint256 remainingBalance, uint256 lastWithdrawTime, bool isPaused, uint256 pausedTime, uint256 totalWithdrawn, bool isActive))",
  "function withdrawable(uint256,address) view returns (uint256)",
  "function createStream(address,uint256,uint256,address) returns (uint256)",
  "function withdraw(uint256,uint256)", // Note : J'ai mis à jour cette ligne car ta fonction withdraw prend 2 arguments
  "function pauseStream(uint256) returns (bool)",
  "function resumeStream(uint256) returns (bool)",
  "function cancelStream(uint256) returns (bool)"
];
import { fmtUnits, shortenAddress } from './lib/utils';

// Fonction parseUnitsSafe pour remplacer l'import manquant
const parseUnitsSafe = (value: string, decimals: number = 18): ethers.BigNumber => {
  try {
    if (!value || value.trim() === '') return ethers.BigNumber.from(0);
    return ethers.utils.parseUnits(value.toString(), decimals);
  } catch (e) {
    console.error('Error parsing units:', e);
    return ethers.BigNumber.from(0);
  }
};

// Fonction fmtUnits locale si l'import ne fonctionne pas
const formatUnits = (value: ethers.BigNumber, decimals: number = 18): string => {
  try {
    return ethers.utils.formatUnits(value, decimals);
  } catch (e) {
    console.error('Error formatting units:', e);
    return '0';
  }
};

// Fonction shortenAddress locale
const shortenAddr = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Interfaces and types for validation
interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
}

interface FormField {
  value: string;
  rules: ValidationRule[];
  touched: boolean;
}

interface NotificationData {
  id: string;
  type: 'withdrawal_available' | 'stream_completed' | 'stream_paused' | 'stream_resumed';
  title: string;
  message: string;
  streamId: string;
  timestamp: number;
  sound?: boolean;
}

interface ActivityData {
  date: string;
  day: number;
  month: number;
  year: number;
  count: number;
  value: number;
}

// Constants pour les couleurs des graphiques
const COLORS = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  gray: '#6B7280'
};

const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

// Validation rules
const validationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    test: (value) => value.trim().length > 0,
    message
  }),
  
  ethereumAddress: (message = 'Invalid Ethereum address'): ValidationRule => ({
    test: (value) => ethers.utils.isAddress(value),
    message
  }),
  
  positiveNumber: (message = 'Must be a positive number'): ValidationRule => ({
    test: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num > 0;
    },
    message
  }),
  
  maxDecimals: (decimals: number, message?: string): ValidationRule => ({
    test: (value) => {
      const parts = value.split('.');
      return parts.length <= 1 || parts[1].length <= decimals;
    },
    message: message || `Maximum ${decimals} decimals`
  })
};

// Form validation hook simplifié
const useFormValidation = (initialFields: Record<string, FormField>) => {
  const [fields, setFields] = useState(initialFields);

  const errors = useMemo(() => {
    const result: Record<string, string> = {};
    Object.entries(fields).forEach(([key, field]) => {
      if (field.touched) {
        const failedRule = field.rules.find(rule => !rule.test(field.value));
        if (failedRule) {
          result[key] = failedRule.message;
        }
      }
    });
    return result;
  }, [fields]);

  const isValid = useMemo(() => {
    // Vérifier que tous les champs sont valides ET non-vides
    const allFieldsValid = Object.entries(fields).every(([key, field]) => {
      if (!field.value.trim()) return false; // Champ vide
      return field.rules.every(rule => rule.test(field.value));
    });
    return allFieldsValid && Object.keys(errors).length === 0;
  }, [errors, fields]);

  const updateField = (name: string, value: string) => {
    setFields(prev => ({
      ...prev,
      [name]: { ...prev[name], value, touched: true }
    }));
  };

  const resetFields = () => {
    setFields(initialFields);
  };

  return { fields, errors, isValid, updateField, resetFields };
};

// WebSocket Hook pour les mises à jour en temps réel
const useWebSocket = (url: string, options: { enabled: boolean; onMessage: (data: any) => void }) => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!options.enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Simulation d'une connexion WebSocket pour la démo
      // En production, remplacez par une vraie connexion WebSocket
      const mockWs = {
        readyState: WebSocket.OPEN,
        close: () => {},
        send: () => {}
      };
      
      setConnected(true);
      setError(null);
      
      // Simulation des mises à jour périodiques
      const interval = setInterval(() => {
        if (options.enabled && connected) {
          options.onMessage({
            type: 'stream_update',
            timestamp: Date.now(),
            data: { updated: true }
          });
        }
      }, 30000); // Mise à jour toutes les 30 secondes

      return () => {
        clearInterval(interval);
        setConnected(false);
      };
    } catch (err) {
      setError('Failed to connect to WebSocket');
      setConnected(false);
      
      // Tentative de reconnexion après 5 secondes
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [options.enabled, options.onMessage, connected]);

  useEffect(() => {
    if (options.enabled) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [options.enabled, connect]);

  return { connected, error, connect };
};

// Hook pour les notifications
const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && permission === 'default') {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    }
    return permission === 'granted';
  }, [permission]);

  const playNotificationSound = useCallback((type: NotificationData['type']) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Différentes fréquences selon le type de notification
    const frequencies = {
      'withdrawal_available': [800, 1000],
      'stream_completed': [600, 800, 1000],
      'stream_paused': [400, 300],
      'stream_resumed': [300, 400, 500]
    };

    const freqs = frequencies[type] || [440];
    
    freqs.forEach((freq, index) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      }, index * 150);
    });
  }, []);

  const addNotification = useCallback(async (notification: Omit<NotificationData, 'id' | 'timestamp'>) => {
    const fullNotification: NotificationData = {
      ...notification,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now()
    };

    setNotifications(prev => [fullNotification, ...prev].slice(0, 50)); // Garder seulement les 50 dernières

    // Notification sonore
    if (notification.sound !== false) {
      playNotificationSound(notification.type);
    }

    // Notification push du navigateur
    if (permission === 'granted') {
      try {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.streamId,
          requireInteraction: notification.type === 'withdrawal_available'
        });
      } catch (error) {
        console.error('Failed to show notification:', error);
      }
    }

    return fullNotification.id;
  }, [permission, playNotificationSound]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    permission,
    requestPermission,
    addNotification,
    removeNotification,
    clearAllNotifications
  };
};

// Hook pour l'analyse des données de stream
const useStreamAnalytics = (streams: StreamInfo[]) => {
  return useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Données pour le graphique de progression des streams
    const progressData = streams.map(stream => ({
      streamId: `#${stream.streamId}`,
      progress: stream.progress,
      amount: parseFloat(stream.deposit),
      withdrawable: parseFloat(stream.withdrawable),
      status: stream.paused ? 'Paused' : stream.isActive ? 'Active' : 'Completed'
    }));

    // Timeline des activités (simulée pour la démo)
    const timelineData = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const dayStreams = streams.filter(s => {
        const streamDate = new Date(s.startTime * 1000);
        return streamDate.toDateString() === date.toDateString();
      });

      timelineData.push({
        date: date.toISOString().split('T')[0],
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        activeStreams: dayStreams.filter(s => s.isActive).length,
        completedStreams: dayStreams.filter(s => !s.isActive).length,
        totalVolume: dayStreams.reduce((sum, s) => sum + parseFloat(s.deposit), 0),
        withdrawals: dayStreams.reduce((sum, s) => sum + parseFloat(s.totalWithdrawn), 0)
      });
    }

    // Heat map des activités par jour de la semaine et heure
    const heatmapData: ActivityData[] = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    days.forEach((day, dayIndex) => {
      hours.forEach(hour => {
        const activity = Math.floor(Math.random() * 10); // Simulation pour la démo
        heatmapData.push({
          date: `${day}-${hour}`,
          day: dayIndex,
          month: hour,
          year: 2024,
          count: activity,
          value: activity * 10
        });
      });
    });

    // Statistiques par statut
    const statusData = [
      { name: 'Active', value: streams.filter(s => s.isActive && !s.paused).length, color: COLORS.success },
      { name: 'Paused', value: streams.filter(s => s.paused).length, color: COLORS.warning },
      { name: 'Completed', value: streams.filter(s => !s.isActive).length, color: COLORS.gray }
    ];

    return {
      progressData,
      timelineData,
      heatmapData,
      statusData
    };
  }, [streams]);
};

// Predefined stream templates
const streamTemplates = {
  quick: { name: '⚡ Quick test', duration: '2', description: '2-minute test stream' },
  hourly: { name: '⏰ Hourly payment', duration: '60', description: 'One hour stream' },
  daily: { name: '📅 Daily payment', duration: '1440', description: 'One day stream' },
  weekly: { name: '📊 Weekly payment', duration: '10080', description: 'One week stream' }
};

// Built-in components and utilities
const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
);

const ErrorAlert = ({ error, onClose }: { error: string; onClose: () => void }) => (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex justify-between items-center">
    <span>{error}</span>
    <button onClick={onClose} className="text-red-500 hover:text-red-700 ml-4">×</button>
  </div>
);

// Composant pour les notifications en temps réel
const NotificationPanel = ({ notifications, onRemove, onClear }: {
  notifications: NotificationData[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) => {
  if (notifications.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
        <h3 className="font-semibold mb-4">🔔 Notifications</h3>
        <div className="text-center py-4 text-gray-500">
          <div className="text-2xl mb-2">🔕</div>
          <div className="text-sm">No notifications</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">🔔 Notifications ({notifications.length})</h3>
        <button 
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Clear all
        </button>
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {notifications.slice(0, 5).map((notification) => (
          <div key={notification.id} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex-1">
              <div className="font-medium text-sm">{notification.title}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {notification.message}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(notification.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <button
              onClick={() => onRemove(notification.id)}
              className="text-gray-400 hover:text-gray-600 ml-2"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Composant pour les graphiques de progression
const ProgressChart = ({ data }: { data: any[] }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
    <h3 className="font-semibold mb-4">📈 Stream Progress</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="streamId" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="progress" fill={COLORS.primary} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// Composant pour la timeline
const TimelineChart = ({ data }: { data: any[] }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
    <h3 className="font-semibold mb-4">📅 Activity Timeline</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Area 
            type="monotone" 
            dataKey="activeStreams" 
            stackId="1" 
            stroke={COLORS.success} 
            fill={COLORS.success} 
          />
          <Area 
            type="monotone" 
            dataKey="completedStreams" 
            stackId="1" 
            stroke={COLORS.gray} 
            fill={COLORS.gray} 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// Composant pour le volume chart
const VolumeChart = ({ data }: { data: any[] }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
    <h3 className="font-semibold mb-4">💰 Volume Timeline</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line 
            type="monotone" 
            dataKey="totalVolume" 
            stroke={COLORS.primary} 
            strokeWidth={2} 
          />
          <Line 
            type="monotone" 
            dataKey="withdrawals" 
            stroke={COLORS.success} 
            strokeWidth={2} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// Composant pour le status pie chart
const StatusPieChart = ({ data }: { data: any[] }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
    <h3 className="font-semibold mb-4">📊 Status Distribution</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// Heat map component (simplified version)
// Composant HeatMap amélioré (style GitHub)
const HeatMap = ({ data }: { data: ActivityData[] }) => {
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const hours = ['12h', '6h', '12h', '18h'];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
      <h3 className="font-semibold mb-2">🔥 Activity Heat Map</h3>
      <div className="text-xs text-gray-500 mb-4">Daily activity pattern (simulated)</div>

      <div className="flex space-x-3 text-xs text-gray-400">
        {/* Colonne pour les jours de la semaine */}
        <div className="flex flex-col justify-between pt-2">
          <span>Lun</span>
          <span>Mer</span>
          <span>Ven</span>
        </div>

        {/* Grille principale de l'activité */}
// NOUVEAU CODE
<div className="flex-1 overflow-x-auto pr-4">          {/* La grille des carrés colorés */}
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {/* On s'assure d'avoir toujours 168 carrés (7 jours * 24h) */}
            {Array.from({ length: 168 }).map((_, index) => {
              const item = data[index] || { count: 0, date: 'No data' };
              return (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-sm ${
                    item.count === 0 ? 'bg-gray-200 dark:bg-gray-700' :
                    item.count < 3 ? 'bg-blue-200' :
                    item.count < 6 ? 'bg-blue-400' :
                    item.count < 9 ? 'bg-blue-600' : 'bg-blue-800'
                  }`}
                  title={`${item.date}: ${item.count} activities`}
                />
              );
            })}
          </div>

          {/* Ligne pour les heures de la journée */}
          <div className="flex justify-between mt-1">
            {hours.map(hour => <span key={hour}>{hour}</span>)}
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="flex items-center justify-end space-x-2 mt-4 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex space-x-1">
          <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-200 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-400 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
          <div className="w-3 h-3 bg-blue-800 rounded-sm"></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
};

// Initial state
const initialState: AppState = {
  account: "",
  chainId: null,
  connected: false,
  loading: false,
  error: null,
  streams: [],
  activeStream: null,
  tokenInfo: { decimals: 18, symbol: "TEST", name: "Test Token", balance: "0", allowance: "0" },
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_ACCOUNT":
      return { ...state, account: action.payload };
    case "SET_CHAIN_ID":
      return { ...state, chainId: action.payload };
    case "SET_CONNECTED":
      return { ...state, connected: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_STREAMS":
      return { ...state, streams: action.payload };
    case "SET_ACTIVE_STREAM":
      return { ...state, activeStream: action.payload };
    case "SET_TOKEN_INFO":
      return { ...state, tokenInfo: { ...state.tokenInfo, ...action.payload } };
    case "UPDATE_STREAM":
      return {
        ...state,
        streams: state.streams.map((s) => (s.streamId === action.payload.streamId ? action.payload : s)),
        activeStream: state.activeStream?.streamId === action.payload.streamId ? action.payload : state.activeStream,
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// Simple toast hook
const useToast = () => {
  const [toasts, setToasts] = useState<Array<{id: number, message: string, type: 'success' | 'error' | 'info'}>>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  }, []);

  const ToastContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div key={toast.id} className={`px-4 py-2 rounded-lg text-white shadow-lg ${
          toast.type === 'success' ? 'bg-green-500' :
          toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {toast.message}
        </div>
      ))}
    </div>
  );

  return { addToast, ToastContainer };
};

// Hook for stream filters
const useStreamFilters = () => {
  const [filters, setFilters] = useState({
    status: 'all',
    role: 'all',
    search: '',
    sortBy: 'newest'
  });

  const updateFilter = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      status: 'all',
      role: 'all', 
      search: '',
      sortBy: 'newest'
    });
  }, []);

  return { filters, updateFilter, resetFilters };
};

// Main component
export default function SomniaStreamApp() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { addToast, ToastContainer } = useToast();
  const { filters, updateFilter, resetFilters } = useStreamFilters();
  const [theme, setTheme] = useState("light");

  // Notifications
  const { 
    notifications, 
    permission, 
    requestPermission, 
    addNotification, 
    removeNotification, 
    clearAllNotifications 
  } = useNotifications();

  // States for features
  const [readProvider, setReadProvider] = useState<ethers.providers.JsonRpcProvider | null>(null);
  const [writeProvider, setWriteProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "create" | "streams" | "analytics">("dashboard");
  const [isConnecting, setIsConnecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [realTimeEnabled, setRealTimeEnabled] = useState(true);
  // AJOUTE CETTE LIGNE
const [isStreamsLoading, setIsStreamsLoading] = useState(true);

  // Analytics
  const analytics = useStreamAnalytics(state.streams);

  // WebSocket pour les mises à jour en temps réel
  const { connected: wsConnected } = useWebSocket('ws://localhost:8080', {
    enabled: realTimeEnabled && state.connected,
    onMessage: useCallback((data) => {
      if (data.type === 'stream_update') {
        loadUserStreams();
      }
    }, [])
  });

  // Create form validation
  const createFormValidation = useFormValidation({
    recipient: {
      value: "",
      rules: [validationRules.required(), validationRules.ethereumAddress()],
      touched: false
    },
    amount: {
      value: "1",
      rules: [validationRules.required(), validationRules.positiveNumber(), validationRules.maxDecimals(6)],
      touched: false
    },
    duration: {
      value: "2",
      rules: [validationRules.required(), validationRules.positiveNumber()],
      touched: false
    }
  });

  // Contracts
  const tokenRead = useMemo(() => (readProvider ? new ethers.Contract(TEST_TOKEN, ERC20_ABI, readProvider) : null), [readProvider]);
  const tokenWrite = useMemo(() => (signer ? new ethers.Contract(TEST_TOKEN, ERC20_ABI, signer) : null), [signer]);
  const streamRead = useMemo(() => (readProvider ? new ethers.Contract(SOMNIA_STREAM, STREAM_ABI, readProvider) : null), [readProvider]);
  const streamWrite = useMemo(() => (signer ? new ethers.Contract(SOMNIA_STREAM, STREAM_ABI, signer) : null), [signer]);

  // Theme functions
  const enableDark = useCallback(() => {
    document.documentElement.classList.add("dark");
    setTheme("dark");
  }, []);
  
  const enableLight = useCallback(() => {
    document.documentElement.classList.remove("dark");
    setTheme("light");
  }, []);

  useEffect(() => {
    const rp = new ethers.providers.JsonRpcProvider(SOMNIA_RPC, { name: "somnia", chainId: SOMNIA_CHAIN_ID });
    setReadProvider(rp);
  }, []);


 // Shape stream function
const shapeStream = useCallback(async (id: BN | string): Promise<StreamInfo | null> => {
    if (!streamRead) return null;
    try {
        const idBN = ethers.BigNumber.isBigNumber(id) ? (id as BN) : ethers.BigNumber.from(id);
        const s: StreamRaw = await streamRead.getStream(idBN);
        const startTime = Number(s.startTime);

        if (startTime === 0 && s.deposit.isZero()) return null;

        const dec = state.tokenInfo.decimals || 18;
        const now = Math.floor(Date.now() / 1000);
        const stopTime = Number(s.stopTime);
        const totalDuration = stopTime > startTime ? stopTime - startTime : 0;

        let actualProgress = 0;
        let calculatedIsActive = s.isActive;
        let calculatedWithdrawable = ethers.BigNumber.from(0);

        // ✅ NOUVELLE LOGIQUE D'ÉTAT PRIORISÉE
        if (!s.isActive || (now >= stopTime && startTime > 0) || s.totalWithdrawn.gte(s.deposit)) {
            // CAS 1 : Le stream est TERMINÉ (par le contrat, le temps, ou entièrement vidé)
            // C'est la condition la plus importante, elle a la priorité sur tout.
            calculatedIsActive = false;
            actualProgress = 100;
            calculatedWithdrawable = s.deposit.sub(s.totalWithdrawn);

        } else if (s.isPaused) {
            // CAS 2 : Le stream est EN PAUSE (et n'est pas terminé)
            const activeTimeUntilPause = Number(s.pausedTime) - startTime;
            if (totalDuration > 0 && activeTimeUntilPause > 0) {
                actualProgress = (activeTimeUntilPause / totalDuration) * 100;
            }
            const activeTokensUntilPause = s.ratePerSecond.mul(activeTimeUntilPause > 0 ? activeTimeUntilPause : 0);
            calculatedWithdrawable = activeTokensUntilPause.sub(s.totalWithdrawn);

        } else if (now < startTime) {
            // CAS 3 : Le stream est PROGRAMMÉ (pas encore commencé)
            actualProgress = 0;
            calculatedWithdrawable = ethers.BigNumber.from(0);

        } else {
            // CAS 4 : Le stream est ACTIF et s'écoule normalement
            const elapsedTime = now - startTime;
            if (totalDuration > 0) {
                actualProgress = (elapsedTime / totalDuration) * 100;
            }
            const elapsedTokens = s.ratePerSecond.mul(elapsedTime);
            const actualElapsedTokens = elapsedTokens.gt(s.deposit) ? s.deposit : elapsedTokens;
            calculatedWithdrawable = actualElapsedTokens.sub(s.totalWithdrawn);
        }

        actualProgress = Math.min(100, Math.max(0, actualProgress));
        if (calculatedWithdrawable.lt(0)) calculatedWithdrawable = ethers.BigNumber.from(0);
        
        return {
            streamId: idBN.toString(),
            sender: s.sender,
            recipient: s.recipient,
            token: s.token,
            deposit: formatUnits(s.deposit, dec),
            ratePerSecond: formatUnits(s.ratePerSecond, dec),
            remaining: formatUnits(s.deposit.sub(s.totalWithdrawn), dec),
            paused: s.isPaused,
            startTime,
            stopTime,
            lastWithdrawTime: Number(s.lastWithdrawTime),
            progress: actualProgress,
            withdrawable: formatUnits(calculatedWithdrawable, dec),
            totalWithdrawn: formatUnits(s.totalWithdrawn, dec),
            isActive: calculatedIsActive,
            _raw: { deposit: s.deposit, remaining: s.deposit.sub(s.totalWithdrawn), ratePerSecond: s.ratePerSecond },
        };
    } catch (e) {
        console.error(`Error shaping stream #${id.toString()}:`, e);
        return null;
    }
}, [streamRead, signer, state.tokenInfo.decimals]);


  // Load user streams function
 // FONCTION loadUserStreams CORRIGÉE
const loadUserStreams = useCallback(async () => {
    if (!streamRead || !state.account) return;
    try {
        setIsStreamsLoading(true);
        dispatch({ type: "SET_ERROR", payload: null });

        const asSender: BN[] = await streamRead.getStreamsAsSender(state.account);
        const asRecipient: BN[] = await streamRead.getStreamsAsRecipient(state.account);
        const idSet = new Set<string>([...asSender.map(String), ...asRecipient.map(String)]);
        
        const newStreams = (await Promise.all(Array.from(idSet).map(id => shapeStream(id))))
            .filter((s): s is StreamInfo => s !== null)
            .sort((a, b) => Number(b.streamId) - Number(a.streamId));
            
        // ✅ Début de la nouvelle logique de notification améliorée
        const previousStreams = state.streams;

        newStreams.forEach(stream => {
            const previousStream = previousStreams.find(s => s.streamId === stream.streamId);
            const isRecipient = stream.recipient.toLowerCase() === state.account.toLowerCase();

            if (isRecipient) {
                // CAS 1 : Un nouveau stream est reçu pour la première fois.
                if (!previousStream) {
                    addNotification({
                        type: 'stream_completed', // Utilise un son agréable
                        title: 'New Stream Received!',
                        message: `You started receiving a new stream of ${stream.deposit} ${state.tokenInfo.symbol}.`,
                        streamId: stream.streamId
                    });
                    return; // On arrête ici pour ce stream
                }

                // CAS 2 : Un stream qui était actif vient de se terminer.
                if (previousStream.isActive && !stream.isActive) {
                    addNotification({
                        type: 'stream_completed',
                        title: 'Stream Completed',
                        message: `Stream #${stream.streamId} has finished.`,
                        streamId: stream.streamId
                    });
                }

                // CAS 3 : Des fonds sont disponibles pour la PREMIÈRE fois.
                const previousWithdrawable = parseFloat(previousStream.withdrawable || "0");
                const currentWithdrawable = parseFloat(stream.withdrawable || "0");
                if (previousWithdrawable === 0 && currentWithdrawable > 0) {
                     addNotification({
                        type: 'withdrawal_available',
                        title: 'Funds Available',
                        message: `You can now withdraw funds from stream #${stream.streamId}.`,
                        streamId: stream.streamId
                    });
                }
            }
        });
        // ✅ Fin de la nouvelle logique de notification
            
        dispatch({ type: "SET_STREAMS", payload: newStreams });

    } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e?.message || "Failed to load streams" });
        addToast("Error loading streams", "error");
    } finally {
        setIsStreamsLoading(false);
    }
}, [streamRead, state.account, state.streams, addToast, addNotification, shapeStream]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!state.connected || !realTimeEnabled) return;
    
    const interval = setInterval(() => {
      loadUserStreams();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [state.connected, realTimeEnabled, loadUserStreams]);

 

  // Connect wallet function
  const connectWallet = useCallback(async () => {
    if (isConnecting) {
      addToast("Connection already in progress...", "info");
      return;
    }

    try {
      setIsConnecting(true);
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error("MetaMask not detected.");

      const provider = new ethers.providers.Web3Provider(ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      
      let network = await provider.getNetwork();
      if (network.chainId !== SOMNIA_CHAIN_ID) {
        try {
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${SOMNIA_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: `0x${SOMNIA_CHAIN_ID.toString(16)}`,
                chainName: "Somnia Testnet",
                rpcUrls: [SOMNIA_RPC],
                nativeCurrency: { name: "SOMNIA", symbol: "SOMNIA", decimals: 18 },
                blockExplorerUrls: [SOMNIA_EXPLORER],
              }],
            });
          } else { throw switchError; }
        }
        network = await provider.getNetwork();
      }

      const signer = provider.getSigner();
      const address = await signer.getAddress();

      setWriteProvider(provider);
      setSigner(signer);
      dispatch({ type: "SET_ACCOUNT", payload: address });
      dispatch({ type: "SET_CHAIN_ID", payload: network.chainId });
      dispatch({ type: "SET_CONNECTED", payload: true });

      addToast("Wallet connected successfully!", "success");

      // Demander les permissions de notification
      await requestPermission();

      if (!(ethereum as any).__somniaListeners) {
        (ethereum as any).__somniaListeners = true;
        ethereum.on("accountsChanged", () => window.location.reload());
        ethereum.on("chainChanged", () => window.location.reload());
      }
    } catch (error: any) {
      let errorMessage = "Connection error";
      
      if (error.code === -32002) {
        errorMessage = "MetaMask is already processing a request. Please wait.";
      } else if (error.code === 4001) {
        errorMessage = "Connection rejected by user.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: "SET_ERROR", payload: errorMessage });
      addToast(errorMessage, "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
      setIsConnecting(false);
    }
  }, [isConnecting, addToast, requestPermission]);

  // Load token info
  const loadTokenInfo = useCallback(async () => {
    if (!tokenRead || !state.account) return;
    
    try {
      const [decimals, symbol, balance, allowance] = await Promise.all([
        tokenRead.decimals(),
        tokenRead.symbol(),
        tokenRead.balanceOf(state.account),
        tokenRead.allowance(state.account, SOMNIA_STREAM),
      ]);
      
      const dec = Number(decimals);
      const balanceFormatted = formatUnits(balance, dec);
      const allowanceFormatted = formatUnits(allowance, dec);
      
      const formatForDisplay = (numStr: string) => {
        const num = parseFloat(numStr);
        if (num > 1e20) return "Unlimited";
        if (num >= 1e12) return (num / 1e12).toFixed(2).replace(/\.?0+$/, '') + "T";
        if (num >= 1e9) return (num / 1e9).toFixed(2).replace(/\.?0+$/, '') + "B";
        if (num >= 1e6) return (num / 1e6).toFixed(2).replace(/\.?0+$/, '') + "M";
        if (num >= 1e3) return (num / 1e3).toFixed(2).replace(/\.?0+$/, '') + "K";
        return Number(num.toFixed(4)).toString();
      };
      
      dispatch({
        type: "SET_TOKEN_INFO",
        payload: {
          decimals: dec,
          symbol,
          balance: formatForDisplay(balanceFormatted),
          allowance: formatForDisplay(allowanceFormatted),
          _rawBalance: balanceFormatted,
          _rawAllowance: allowanceFormatted,
        },
      });
    } catch (e) {
      console.error("Failed to load token info:", e);
    }
  }, [tokenRead, state.account]);

  // Claim tokens from faucet
  const claimTokens = useCallback(async () => {
    if (!tokenWrite) return;
    
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      addToast("Transaction sent...", "info");
      
      const tx = await tokenWrite.faucet();
      await tx.wait();
      
      addToast("Tokens claimed successfully!", "success");
      setTimeout(() => loadTokenInfo(), 1000);
    } catch (e: any) {
      const errorMsg = e.message.includes("already claimed") 
        ? "Faucet already used recently" 
        : "Error claiming tokens";
      addToast(errorMsg, "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [tokenWrite, loadTokenInfo, addToast]);

  // Stream parameters calculation
  const streamParams = useMemo(() => {
    try {
      const dec = state.tokenInfo.decimals || 18;
      const amountValue = createFormValidation.fields.amount.value;
      const durationValue = createFormValidation.fields.duration.value;
      
      if (!amountValue || !durationValue) return null;
      
      const amount = parseUnitsSafe(amountValue, dec);
      const durationSec = Math.max(60, Number(durationValue || "0") * 60);
      
      if (amount.isZero() || durationSec === 0) return null;
      
      const durationBN = ethers.BigNumber.from(durationSec);
      const rps = amount.div(durationBN);
      if (rps.isZero()) return null;
      
      const depositAdjusted = rps.mul(durationBN);
      return {
        rps, 
        depositAdjusted, 
        durationSec,
        human: { rps: formatUnits(rps, dec) },
      };
    } catch (e) { 
      console.error('Error calculating stream params:', e);
      return null; 
    }
  }, [createFormValidation.fields.amount.value, createFormValidation.fields.duration.value, state.tokenInfo.decimals]);

  // Check if create button should be enabled
  const canCreateStream = useMemo(() => {
    return streamParams && 
           createFormValidation.isValid && 
           !state.loading &&
           createFormValidation.fields.recipient.value.trim() !== '' &&
           createFormValidation.fields.amount.value.trim() !== '' &&
           createFormValidation.fields.duration.value.trim() !== '';
  }, [streamParams, createFormValidation.isValid, createFormValidation.fields, state.loading]);

  // Create stream function
  const createStream = useCallback(async () => {
    if (!streamWrite || !tokenWrite || !signer || !streamParams || !createFormValidation.isValid) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      const account = await signer.getAddress();
      const rec = createFormValidation.fields.recipient.value.trim();
      
      if (!ethers.utils.isAddress(rec)) throw new Error("Invalid recipient address");
      if (rec.toLowerCase() === account.toLowerCase()) throw new Error("Cannot create stream to yourself");

      const allowance: BN = await tokenWrite.allowance(account, SOMNIA_STREAM);
      if (allowance.lt(streamParams.depositAdjusted)) {
        addToast("Approving tokens...", "info");
        const txA = await tokenWrite.approve(SOMNIA_STREAM, ethers.constants.MaxUint256);
        await txA.wait();
        addToast("Tokens approved!", "success");
        await loadTokenInfo();
      }

      addToast("Creating stream...", "info");
      const tx = await streamWrite.createStream(rec, streamParams.depositAdjusted, streamParams.rps, TEST_TOKEN);
      await tx.wait();
      await loadUserStreams();
      createFormValidation.resetFields();
      addToast("Stream created successfully!", "success");
      setActiveTab("streams");

      // Notification pour la création du stream
      addNotification({
        type: 'stream_completed',
        title: 'Stream Created',
        message: `New stream created for ${parseFloat(createFormValidation.fields.amount.value).toFixed(2)} tokens`,
        streamId: 'new'
      });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e.message || "Error creating stream" });
      addToast("Error creating stream", "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, tokenWrite, signer, createFormValidation, streamParams, loadUserStreams, loadTokenInfo, addToast, addNotification]);

  // Stream actions
  const pauseStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`pause-${streamId}`);
      addToast("Pausing stream...", "info");
      const tx = await streamWrite.pauseStream(streamId);
      await tx.wait();
      await loadUserStreams();
      addToast("Stream paused!", "success");

      addNotification({
        type: 'stream_paused',
        title: 'Stream Paused',
        message: `Stream #${streamId} has been paused`,
        streamId
      });
    } catch (e: any) {
      addToast("Error pausing stream", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, addToast, addNotification]);

  const resumeStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`resume-${streamId}`);
      addToast("Resuming stream...", "info");
      const tx = await streamWrite.resumeStream(streamId);
      await tx.wait();
      await loadUserStreams();
      addToast("Stream resumed!", "success");

      addNotification({
        type: 'stream_resumed',
        title: 'Stream Resumed',
        message: `Stream #${streamId} has been resumed`,
        streamId
      });
    } catch (e: any) {
      addToast("Error resuming stream", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, addToast, addNotification]);

const withdrawStream = useCallback(async (streamId: string) => {
  // S'assurer que les providers et le signer sont prêts
  if (!streamWrite || !streamRead || !signer) {
    addToast("Providers not ready, please reconnect.", "error");
    return;
  }

  try {
    setActionLoading(`withdraw-${streamId}`);
    addToast("Preparing withdrawal...", "info");
    
    // 1. Récupérer le montant exact retirable juste avant la transaction pour être sûr
    const account = await signer.getAddress();
    const amountToWithdraw = await streamRead.withdrawable(streamId, account);

    // 2. Vérifier qu'il y a bien quelque chose à retirer
    if (amountToWithdraw.isZero()) {
      addToast("No funds available to withdraw.", "warning");
      setActionLoading(null); // Arrêter le spinner
      return;
    }

    addToast("Sending transaction...", "info");
    
    // 3. Appeler la fonction du contrat avec les DEUX arguments requis
    const tx = await streamWrite.withdraw(streamId, amountToWithdraw);
    
    await tx.wait();
    
    // Mettre à jour l'interface
    await loadUserStreams();
    await loadTokenInfo();
    addToast("Withdrawal successful!", "success");

  } catch (e: any) {
    console.error("Withdrawal error:", e);
    addToast(e?.reason || "Error during withdrawal", "error");
  } finally {
    setActionLoading(null);
  }
}, [streamWrite, streamRead, signer, loadUserStreams, loadTokenInfo, addToast]);

  const cancelStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`cancel-${streamId}`);
      addToast("Canceling stream...", "info");
      const tx = await streamWrite.cancelStream(streamId);
      await tx.wait();
      await loadUserStreams();
      await loadTokenInfo();
      addToast("Stream canceled!", "success");

      addNotification({
        type: 'stream_completed',
        title: 'Stream Canceled',
        message: `Stream #${streamId} has been canceled`,
        streamId
      });
    } catch (e: any) {
      addToast("Error canceling stream", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, loadTokenInfo, addToast, addNotification]);

  // Load token info on connection
  useEffect(() => {
    if (state.connected && state.account && tokenRead) {
      loadTokenInfo();
    }
  }, [state.connected, state.account, tokenRead, loadTokenInfo]);

  // Load streams on connection
  useEffect(() => {
    if (state.connected && state.account && streamRead) {
      loadUserStreams();
    }
  }, [state.connected, state.account, streamRead, loadUserStreams]);

  // Dashboard calculations
  // NOUVEAU CODE
const dashboardMetrics = useMemo(() => {
  const activeStreams = state.streams.filter(s => s.isActive && !s.paused);
  const pausedStreams = state.streams.filter(s => s.paused);
  const completedStreams = state.streams.filter(s => !s.isActive);
  const sentStreams = state.streams.filter(s => s.sender.toLowerCase() === state.account.toLowerCase());
  const receivedStreams = state.streams.filter(s => s.recipient.toLowerCase() === state.account.toLowerCase());
  
  const totalDeposited = state.streams.reduce((acc, s) => acc + parseFloat(s.deposit || "0"), 0);
  const totalWithdrawn = state.streams.reduce((acc, s) => acc + parseFloat(s.totalWithdrawn || "0"), 0);
  
  // ✅ CORRECTION : On utilise maintenant SEULEMENT les streams reçus pour ce calcul
  const totalWithdrawable = receivedStreams.reduce((acc, s) => acc + parseFloat(s.withdrawable || "0"), 0);
  
  const avgProgress = state.streams.length > 0 
    ? state.streams.reduce((acc, s) => acc + s.progress, 0) / state.streams.length 
    : 0;

  return {
    total: state.streams.length,
    active: activeStreams.length,
    paused: pausedStreams.length,
    completed: completedStreams.length,
    sent: sentStreams.length,
    received: receivedStreams.length,
    totalDeposited: totalDeposited.toFixed(4),
    totalWithdrawn: totalWithdrawn.toFixed(4),
    totalWithdrawable: totalWithdrawable.toFixed(4),
    avgProgress: avgProgress.toFixed(1)
  };
}, [state.streams, state.account]);

  // Filter and sort streams
  const filteredAndSortedStreams = useMemo(() => {
    let filtered = state.streams;

    if (filters.status !== 'all') {
      filtered = filtered.filter(s => {
        switch (filters.status) {
          case 'active': return s.isActive && !s.paused;
          case 'paused': return s.paused;
          case 'completed': return !s.isActive;
          default: return true;
        }
      });
    }

    if (filters.role !== 'all') {
      filtered = filtered.filter(s => {
        const isSender = s.sender.toLowerCase() === state.account.toLowerCase();
        return filters.role === 'sender' ? isSender : !isSender;
      });
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(s => 
        s.streamId.includes(searchLower) ||
        s.sender.toLowerCase().includes(searchLower) ||
        s.recipient.toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'newest': return Number(b.streamId) - Number(a.streamId);
        case 'oldest': return Number(a.streamId) - Number(b.streamId);
        case 'amount': return parseFloat(b.deposit) - parseFloat(a.deposit);
        case 'progress': return b.progress - a.progress;
        default: return 0;
      }
    });

    return filtered;
  }, [state.streams, filters, state.account]);

  // CSS Classes
  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const btn = "px-4 py-2 rounded-lg font-medium transition-colors";
  const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed`;
  const btnSecondary = `${btn} bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <ToastContainer />
      
      <div className="max-w-6xl mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Somnia Stream</h1>
            {state.connected && wsConnected && (
              <div className="flex items-center text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                Live updates
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {/* Real-time toggle */}
            {state.connected && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Real-time</label>
                <button
                  onClick={() => setRealTimeEnabled(!realTimeEnabled)}
                  className={`w-10 h-6 rounded-full p-1 transition-colors ${
                    realTimeEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                    realTimeEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            )}

            {/* Notifications permission */}
            {state.connected && permission === 'default' && (
              <button 
                onClick={requestPermission}
                className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded"
              >
                Enable notifications
              </button>
            )}

            <button onClick={theme === "light" ? enableDark : enableLight} className={btnSecondary}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            {state.connected ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="font-medium">{shortenAddr(state.account)}</div>
                  <div className="text-xs text-gray-500">
                    {state.tokenInfo.balance} {state.tokenInfo.symbol}
                  </div>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full" />
              </div>
            ) : (
              <button 
                onClick={connectWallet} 
                disabled={state.loading || isConnecting} 
                className={btnPrimary}
              >
                {state.loading ? <LoadingSpinner /> : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>

        {/* Error display */}
        {state.error && (
          <ErrorAlert 
            error={state.error} 
            onClose={() => dispatch({ type: "SET_ERROR", payload: null })} 
          />
        )}

        {state.connected ? (
          <div className="space-y-6">
            
            {/* Navigation */}
            <div className="flex space-x-1 bg-gray-200 dark:bg-gray-800 p-1 rounded-lg">
              {["dashboard", "create", "streams", "analytics"].map((tab) => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab as any)}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? "bg-white dark:bg-gray-900 shadow-sm" : ""
                  }`}
                >
                  {tab === 'dashboard' && '📊 '}
                  {tab === 'create' && '➕ '}
                  {tab === 'streams' && '🌊 '}
                  {tab === 'analytics' && '📈 '}
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                
                {activeTab === 'dashboard' && (
                  <div className="space-y-6">
                    {/* Main metrics */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                      <h2 className="text-xl font-semibold mb-4">📊 Dashboard</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{dashboardMetrics.total}</div>
                          <div className="text-sm text-gray-600">Total streams</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{dashboardMetrics.active}</div>
                          <div className="text-sm text-gray-600">Active</div>
                        </div>
                        <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">{dashboardMetrics.paused}</div>
                          <div className="text-sm text-gray-600">Paused</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <div className="text-2xl font-bold text-gray-600">{dashboardMetrics.completed}</div>
                          <div className="text-sm text-gray-600">Completed</div>
                        </div>
                      </div>
                    </div>

                    {/* Advanced metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4">💰 Finances</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Total deposited:</span>
                            <span className="font-medium">{dashboardMetrics.totalDeposited} {state.tokenInfo.symbol}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Total withdrawn:</span>
                            <span className="font-medium">{dashboardMetrics.totalWithdrawn} {state.tokenInfo.symbol}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-gray-600 dark:text-gray-400">Available now:</span>
                            <span className="font-bold text-green-600">{dashboardMetrics.totalWithdrawable} {state.tokenInfo.symbol}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4">📈 Statistics</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Streams sent:</span>
                            <span className="font-medium">{dashboardMetrics.sent}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Streams received:</span>
                            <span className="font-medium">{dashboardMetrics.received}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-gray-600 dark:text-gray-400">Average progress:</span>
                            <span className="font-bold text-blue-600">{dashboardMetrics.avgProgress}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recent streams */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4">🕒 Recent activity</h3>
                      {state.streams.slice(0, 3).map((stream) => (
                        <div key={stream.streamId} className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${
                              stream.paused ? 'bg-yellow-500' :
                              stream.isActive ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                            <div>
                              <div className="font-medium">Stream #{stream.streamId}</div>
                              <div className="text-sm text-gray-500">
                                {stream.sender.toLowerCase() === state.account.toLowerCase() ? '→ ' : '← '}
                                {shortenAddr(stream.sender.toLowerCase() === state.account.toLowerCase() ? stream.recipient : stream.sender)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{parseFloat(stream.deposit).toFixed(2)} {state.tokenInfo.symbol}</div>
                            <div className="text-sm text-gray-500">{stream.progress.toFixed(1)}% complete</div>
                          </div>
                        </div>
                      ))}
                      {state.streams.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <div className="text-4xl mb-2">🎯</div>
                          <div>No activity yet</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'create' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">Create a stream</h2>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 flex justify-between items-center">
                      <p className="text-sm">Need test tokens?</p>
                      <button onClick={claimTokens} className={btnPrimary} disabled={state.loading}>
                        {state.loading ? <LoadingSpinner /> : "Claim"}
                      </button>
                    </div>

                    {/* Stream templates */}
                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-6">
                      <div className="text-sm font-medium mb-2 col-span-2">Quick templates:</div>
                      {Object.entries(streamTemplates).map(([key, template]) => (
                        <button
                          key={key}
                          onClick={() => {
                            createFormValidation.updateField('duration', template.duration);
                            addToast(`Template "${template.name}" applied`, "info");
                          }}
                          className="text-left p-3 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        >
                          <div className="font-medium text-sm">{template.name}</div>
                          <div className="text-xs text-gray-500">{template.description}</div>
                        </button>
                      ))}
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Recipient
                        </label>
                        <input
                          type="text"
                          value={createFormValidation.fields.recipient.value}
                          onChange={(e) => createFormValidation.updateField('recipient', e.target.value)}
                          placeholder="0x..."
                          className={`${inputClass} ${createFormValidation.errors.recipient ? 'border-red-500' : ''}`}
                        />
                        {createFormValidation.errors.recipient && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                            {createFormValidation.errors.recipient}
                          </p>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Amount
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              value={createFormValidation.fields.amount.value}
                              onChange={(e) => createFormValidation.updateField('amount', e.target.value)}
                              placeholder="1.0"
                              className={`${inputClass} pr-16 ${createFormValidation.errors.amount ? 'border-red-500' : ''}`}
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 text-sm">{state.tokenInfo.symbol}</span>
                            </div>
                          </div>
                          {createFormValidation.errors.amount && (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              {createFormValidation.errors.amount}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Duration (minutes)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              value={createFormValidation.fields.duration.value}
                              onChange={(e) => createFormValidation.updateField('duration', e.target.value)}
                              placeholder="2"
                              className={`${inputClass} pr-12 ${createFormValidation.errors.duration ? 'border-red-500' : ''}`}
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                              <span className="text-gray-500 text-sm">min</span>
                            </div>
                          </div>
                          {createFormValidation.errors.duration && (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              {createFormValidation.errors.duration}
                            </p>
                          )}
                        </div>
                      </div>

                      {streamParams && (
                        <div className="text-xs p-3 bg-gray-100 dark:bg-gray-700 rounded flex items-center gap-2">
                          <span>💡</span>
                          <span>Rate: {streamParams.human.rps} tokens/second</span>
                        </div>
                      )}
                      
                      <button 
                        onClick={() => {
                          console.log('Create button clicked!');
                          console.log('canCreateStream:', canCreateStream);
                          console.log('streamParams:', streamParams);
                          console.log('form valid:', createFormValidation.isValid);
                          createStream();
                        }}
                        disabled={!canCreateStream} 
                        className={`${btnPrimary} w-full`}
                      >
                        {state.loading ? <LoadingSpinner /> : "Create stream"}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'streams' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">🌊 My streams</h2>
                      <button 
                        onClick={loadUserStreams}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                        disabled={state.loading}
                      >
                        <span>🔄</span>
                        <span>Refresh</span>
                      </button>
                    </div>
                    
                    {/* Filters and search */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select 
                          value={filters.status} 
                          onChange={(e) => updateFilter('status', e.target.value)}
                          className={inputClass}
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Role</label>
                        <select 
                          value={filters.role} 
                          onChange={(e) => updateFilter('role', e.target.value)}
                          className={inputClass}
                        >
                          <option value="all">All</option>
                          <option value="sender">Sent</option>
                          <option value="recipient">Received</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Sort</label>
                        <select 
                          value={filters.sortBy} 
                          onChange={(e) => updateFilter('sortBy', e.target.value)}
                          className={inputClass}
                        >
                          <option value="newest">Newest</option>
                          <option value="oldest">Oldest</option>
                          <option value="amount">Amount</option>
                          <option value="progress">Progress</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Search</label>
                        <input
                          type="text"
                          value={filters.search}
                          onChange={(e) => updateFilter('search', e.target.value)}
                          placeholder="ID or address..."
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Reset filters button */}
                    {(filters.status !== 'all' || filters.role !== 'all' || filters.search || filters.sortBy !== 'newest') && (
                      <div className="mb-4">
                        <button onClick={resetFilters} className="text-sm text-gray-500 hover:text-gray-700">
                          ✕ Reset filters
                        </button>
                      </div>
                    )}
                    
                    {filteredAndSortedStreams.length > 0 ? (
                      <div className="space-y-4">
                        {filteredAndSortedStreams.map((stream) => {
                          const isRecipient = stream.recipient.toLowerCase() === state.account.toLowerCase();
const isSender = stream.sender.toLowerCase() === state.account.toLowerCase();
const canWithdraw = isRecipient && parseFloat(stream.withdrawable) > 0;

// ✅ Ces conditions sont maintenant toutes correctes et dépendent de stream.isActive
const canPause = isSender && stream.isActive && !stream.paused;
const canResume = isSender && stream.isActive && stream.paused; // <-- CORRIGÉ
const canCancel = isSender && stream.isActive;
                          
                          return (
                            <div key={stream.streamId} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-3">
                                  <div className="text-sm font-medium">Stream #{stream.streamId}</div>
                                  <div className={`text-xs px-2 py-1 rounded-full ${
                                    stream.paused ? 'bg-yellow-100 text-yellow-800' :
                                    stream.isActive ? 'bg-green-100 text-green-800' : 
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {stream.paused ? '⏸️ Paused' : stream.isActive ? '▶️ Active' : '⏹️ Completed'}
                                  </div>
                                  <div className={`text-xs px-2 py-1 rounded-full ${
                                    isRecipient ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {isRecipient ? '📥 Received' : '📤 Sent'}
                                  </div>
                                </div>
                                
                                {/* Actions */}
                                <div className="flex items-center space-x-2">
                                  {isRecipient && parseFloat(stream.withdrawable || "0") > 0.001 && (
                                    <button
                                      onClick={() => withdrawStream(stream.streamId)}
                                      disabled={actionLoading === `withdraw-${stream.streamId}`}
                                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `withdraw-${stream.streamId}` ? '⏳' : '💰 Withdraw'}
                                    </button>
                                  )}
                                  
                                  {isSender && stream.isActive && !stream.paused && (
                                    <button
                                      onClick={() => pauseStream(stream.streamId)}
                                      disabled={actionLoading === `pause-${stream.streamId}`}
                                      className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `pause-${stream.streamId}` ? '⏳' : '⏸️ Pause'}
                                    </button>
                                  )}
                                  
                                  {isSender && stream.paused && (
                                    <button
                                      onClick={() => resumeStream(stream.streamId)}
                                      disabled={actionLoading === `resume-${stream.streamId}`}
                                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `resume-${stream.streamId}` ? '⏳' : '▶️ Resume'}
                                    </button>
                                  )}
                                  
                                  {isSender && stream.isActive && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Are you sure you want to cancel this stream?')) {
                                          cancelStream(stream.streamId);
                                        }
                                      }}
                                      disabled={actionLoading === `cancel-${stream.streamId}`}
                                      className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `cancel-${stream.streamId}` ? '⏳' : '❌ Cancel'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 dark:text-gray-400 mb-3">
                                <div>
                                  <div><strong>Counterparty:</strong> {shortenAddr(isRecipient ? stream.sender : stream.recipient)}</div>
                                  <div><strong>Total amount:</strong> {parseFloat(stream.deposit).toFixed(4)} {state.tokenInfo.symbol}</div>
                                </div>
                                <div>
                                  <div><strong>Progress:</strong> {stream.progress.toFixed(1)}%</div>
                                  <div><strong>Already withdrawn:</strong> {parseFloat(stream.totalWithdrawn).toFixed(4)} {state.tokenInfo.symbol}</div>
                                </div>
                                <div>
                                  <div><strong>Rate/sec:</strong> {parseFloat(stream.ratePerSecond).toFixed(6)}</div>
                                  <div className="text-green-600"><strong>Available:</strong> {parseFloat(stream.withdrawable).toFixed(6)} {state.tokenInfo.symbol}</div>
                                </div>
                              </div>
                              
                              {/* Progress bar */}
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-300 ${
                                    stream.paused ? 'bg-yellow-500' : 
                                    stream.isActive ? 'bg-green-500' : 'bg-gray-400'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, stream.progress))}%` }}
                                />
                              </div>
                              
                              {/* Time details */}
                              <div className="flex justify-between text-xs text-gray-500">
                                <div>Start: {new Date(stream.startTime * 1000).toLocaleString()}</div>
                                <div>End: {new Date(stream.stopTime * 1000).toLocaleString()}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        {state.streams.length === 0 ? (
                          <>
                            <div className="text-4xl mb-2">🌊</div>
                            <div>No streams yet</div>
                            <div className="text-sm mt-2">Create your first stream!</div>
                          </>
                        ) : (
                          <>
                            <div className="text-4xl mb-2">🔍</div>
                            <div>No streams match the criteria</div>
                            <div className="text-sm mt-2">Try changing the filters</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'analytics' && (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                      <h2 className="text-xl font-semibold mb-4">📈 Analytics Dashboard</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                        Advanced visualization and analysis of your streaming activities
                      </p>
                    </div>

                    {state.streams.length > 0 ? (
                      <>
                        {/* Progress Chart */}
                        <ProgressChart data={analytics.progressData} />

                        {/* Timeline and Volume Charts */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                          <TimelineChart data={analytics.timelineData} />
                          <VolumeChart data={analytics.timelineData} />
                        </div>

                        {/* Status Distribution and Heat Map */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                          <StatusPieChart data={analytics.statusData} />
                          <HeatMap data={analytics.heatmapData} />
                        </div>
                      </>
                    ) : (
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                        <div className="text-center py-16 text-gray-500">
                          <div className="text-6xl mb-4">📊</div>
                          <h3 className="text-xl font-semibold mb-2">No Data to Analyze</h3>
                          <p className="text-gray-600 mb-6">Create some streams to see analytics and visualizations.</p>
                          <button 
                            onClick={() => setActiveTab('create')}
                            className={btnPrimary}
                          >
                            Create Your First Stream
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Enhanced sidebar */}
              <div className="space-y-6">
                {/* Notifications Panel */}
                <NotificationPanel 
                  notifications={notifications}
                  onRemove={removeNotification}
                  onClear={clearAllNotifications}
                />

                {/* Wallet info */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">💳 Wallet</h3>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Balance:</span>
                      <span className="font-medium">{state.tokenInfo.balance} {state.tokenInfo.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Allowance:</span>
                      <span className="font-medium">{state.tokenInfo.allowance}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <button 
                      onClick={claimTokens} 
                      className={`${btnSecondary} w-full text-sm mb-2`}
                      disabled={state.loading}
                    >
                      🚰 Claim tokens
                    </button>
                    <button 
                      onClick={loadTokenInfo} 
                      className={`${btnSecondary} w-full text-sm`}
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">📊 Summary</h3>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Total Streams:</span>
                      <span className="font-medium">{dashboardMetrics.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active:</span>
                      <span className="font-medium text-green-600">{dashboardMetrics.active}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Paused:</span>
                      <span className="font-medium text-yellow-600">{dashboardMetrics.paused}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Completed:</span>
                      <span className="font-medium text-gray-600">{dashboardMetrics.completed}</span>
                    </div>
                  </div>
                </div>

                {parseFloat(dashboardMetrics.totalWithdrawable) > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-xl p-6">
                    <h3 className="font-semibold mb-2 text-green-800 dark:text-green-200">💰 Available funds</h3>
                    <div className="text-2xl font-bold text-green-600 mb-2">
                      {dashboardMetrics.totalWithdrawable} {state.tokenInfo.symbol}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">
                      Total amount you can withdraw now
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">🔗 Useful links</h3>
                  <div className="space-y-2 text-sm">
                    <a 
                      href={`${SOMNIA_EXPLORER}/address/${TEST_TOKEN}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800"
                    >
                      📄 Token Contract
                    </a>
                    <a 
                      href={`${SOMNIA_EXPLORER}/address/${SOMNIA_STREAM}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800"
                    >
                      🌊 Stream Contract
                    </a>
                    <a 
                      href={`${SOMNIA_EXPLORER}/address/${state.account}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800"
                    >
                      👤 My Account
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🌊</div>
            <h2 className="text-2xl font-semibold mb-2">Welcome to Somnia Stream</h2>
            <p className="text-gray-600 mb-6">Connect your wallet to get started with real-time notifications and advanced analytics.</p>
          </div>
        )}
      </div>
    </div>
  );
}