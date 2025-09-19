import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { ethers } from "ethers";

// App Logic & Config
// APRÈS (Correct)
import { SOMNIA_CHAIN_ID, SOMNIA_EXPLORER, SOMNIA_RPC, SOMNIA_STREAM, TEST_TOKEN } from './lib/constants.ts';
import { ERC20_ABI, STREAM_ABI } from './lib/abi.ts';
import type { AppAction, AppState, BN, StreamInfo, StreamRaw } from './lib/types.ts';
import { fmtUnits, parseUnitsSafe, shortenAddress } from './lib/utils.ts';
// Interfaces et types pour la validation
interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
}

interface FormField {
  value: string;
  rules: ValidationRule[];
  touched: boolean;
}

// Règles de validation
const validationRules = {
  required: (message = 'Ce champ est requis'): ValidationRule => ({
    test: (value) => value.trim().length > 0,
    message
  }),
  
  ethereumAddress: (message = 'Adresse Ethereum invalide'): ValidationRule => ({
    test: (value) => ethers.utils.isAddress(value),
    message
  }),
  
  positiveNumber: (message = 'Doit être un nombre positif'): ValidationRule => ({
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
    message: message || `Maximum ${decimals} décimales`
  })
};

// Hook de validation
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
    return Object.keys(errors).length === 0 && 
           Object.values(fields).every(field => field.touched);
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

// Templates de streams prédéfinis
const streamTemplates = {
  quick: { name: '⚡ Test rapide', duration: '2', description: 'Stream de test de 2 minutes' },
  hourly: { name: '⏰ Paiement horaire', duration: '60', description: 'Stream d\'une heure' },
  daily: { name: '📅 Paiement quotidien', duration: '1440', description: 'Stream d\'une journée' },
  weekly: { name: '📊 Paiement hebdomadaire', duration: '10080', description: 'Stream d\'une semaine' }
};

// Composants et utilitaires intégrés
const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
);

const ErrorAlert = ({ error, onClose }: { error: string; onClose: () => void }) => (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex justify-between items-center">
    <span>{error}</span>
    <button onClick={onClose} className="text-red-500 hover:text-red-700 ml-4">×</button>
  </div>
);

// État initial
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

// Hook toast simple
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

// Hook pour les filtres de streams
const useStreamFilters = () => {
  const [filters, setFilters] = useState({
    status: 'all', // all, active, paused, completed
    role: 'all', // all, sender, recipient
    search: '',
    sortBy: 'newest' // newest, oldest, amount, progress
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

// Composant principal
export default function SomniaStreamApp() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { addToast, ToastContainer } = useToast();
  const { filters, updateFilter, resetFilters } = useStreamFilters();
  const [theme, setTheme] = useState("light");

  // États pour les fonctionnalités
  const [readProvider, setReadProvider] = useState<ethers.providers.JsonRpcProvider | null>(null);
  const [writeProvider, setWriteProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "create" | "streams">("dashboard");
  const [isConnecting, setIsConnecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Validation du formulaire de création
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

  // Contrats
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

  // Fonction shapeStream
  const shapeStream = useCallback(async (id: BN | string): Promise<StreamInfo | null> => {
    if (!streamRead) return null;
    try {
      const idBN = ethers.BigNumber.isBigNumber(id) ? (id as BN) : ethers.BigNumber.from(id);
      const s: StreamRaw = await streamRead.getStream(idBN);
      
      if (signer) {
        try {
          const currentAccount = await signer.getAddress();
          const contractWithdrawable = await streamRead.withdrawable(idBN, currentAccount);
          // Utilisation de contractWithdrawable si nécessaire
        } catch {}
      }

      const dec = state.tokenInfo.decimals || 18;
      const now = Math.floor(Date.now() / 1000);
      const startTime = Number(s.startTime);
      let stopTime = Number(s.stopTime);
      
      if (stopTime <= startTime || stopTime === 0) {
        stopTime = s.ratePerSecond.isZero() ? startTime + 3600 : startTime + s.deposit.div(s.ratePerSecond).toNumber();
      }
      
      let actualProgress = 0;
      let calculatedWithdrawable = ethers.BigNumber.from(0);
      let calculatedIsActive = s.isActive;
      
      if (!s.ratePerSecond.isZero() && startTime > 0) {
        if (now <= startTime) {
          actualProgress = 0;
          calculatedIsActive = false;
        } else if (now >= stopTime) {
          actualProgress = 100;
          calculatedWithdrawable = s.deposit.sub(s.totalWithdrawn);
          calculatedIsActive = false;
        } else {
          const elapsedTime = now - startTime;
          const totalDuration = stopTime - startTime;
          actualProgress = Math.min(100, (elapsedTime / totalDuration) * 100);
          const elapsedTokens = s.ratePerSecond.mul(elapsedTime);
          const actualElapsedTokens = elapsedTokens.gt(s.deposit) ? s.deposit : elapsedTokens;
          calculatedWithdrawable = actualElapsedTokens.sub(s.totalWithdrawn);
          calculatedIsActive = true;
        }
        
        if (s.isPaused && Number(s.pausedTime) > 0) {
          const activeTime = Math.min(Number(s.pausedTime) - startTime, stopTime - startTime);
          if (activeTime > 0) {
            actualProgress = Math.min(100, (activeTime / (stopTime - startTime)) * 100);
            const activeTokens = s.ratePerSecond.mul(activeTime);
            calculatedWithdrawable = activeTokens.sub(s.totalWithdrawn);
          }
          if (actualProgress < 100) {
            calculatedIsActive = true;
          }
        }
      }
      
      if (s.totalWithdrawn.gte(s.deposit)) {
        calculatedIsActive = false;
        actualProgress = 100;
      }
      
      if (calculatedWithdrawable.lt(0)) calculatedWithdrawable = ethers.BigNumber.from(0);
      
      return {
        streamId: idBN.toString(),
        sender: s.sender,
        recipient: s.recipient,
        token: s.token,
        deposit: fmtUnits(s.deposit, dec),
        ratePerSecond: fmtUnits(s.ratePerSecond, dec),
        remaining: fmtUnits(s.remainingBalance, dec),
        paused: s.isPaused,
        startTime,
        stopTime,
        lastWithdrawTime: Number(s.lastWithdrawTime),
        progress: actualProgress,
        withdrawable: fmtUnits(calculatedWithdrawable, dec),
        totalWithdrawn: fmtUnits(s.totalWithdrawn, dec),
        isActive: calculatedIsActive,
        _raw: { deposit: s.deposit, remaining: s.remainingBalance, ratePerSecond: s.ratePerSecond },
      };
    } catch (e) {
      console.error("Error shaping stream:", e);
      return null;
    }
  }, [streamRead, signer, state.tokenInfo.decimals]);

  // Fonction loadUserStreams
  const loadUserStreams = useCallback(async () => {
    if (!streamRead || !state.account) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });

      const asSender: BN[] = await streamRead.getStreamsAsSender(state.account);
      const asRecipient: BN[] = await streamRead.getStreamsAsRecipient(state.account);
      const idSet = new Set<string>([...asSender.map(String), ...asRecipient.map(String)]);
      
      const streams = (await Promise.all(Array.from(idSet).map(id => shapeStream(id))))
        .filter((s): s is StreamInfo => s !== null)
        .sort((a, b) => Number(b.streamId) - Number(a.streamId));
        
      dispatch({ type: "SET_STREAMS", payload: streams });
      addToast(`${streams.length} streams chargés`, "info");
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message || "Failed to load streams" });
      addToast("Erreur lors du chargement des streams", "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamRead, state.account, shapeStream, addToast]);

  // Fonction de connexion wallet
  const connectWallet = useCallback(async () => {
    if (isConnecting) {
      addToast("Connexion déjà en cours...", "info");
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

      addToast("Wallet connecté avec succès !", "success");

      if (!(ethereum as any).__somniaListeners) {
        (ethereum as any).__somniaListeners = true;
        ethereum.on("accountsChanged", () => window.location.reload());
        ethereum.on("chainChanged", () => window.location.reload());
      }
    } catch (error: any) {
      let errorMessage = "Erreur de connexion";
      
      if (error.code === -32002) {
        errorMessage = "MetaMask traite déjà une demande. Veuillez patienter.";
      } else if (error.code === 4001) {
        errorMessage = "Connexion refusée par l'utilisateur.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: "SET_ERROR", payload: errorMessage });
      addToast(errorMessage, "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
      setIsConnecting(false);
    }
  }, [isConnecting, addToast]);

  // Charger les infos du token
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
      const balanceFormatted = fmtUnits(balance, dec);
      const allowanceFormatted = fmtUnits(allowance, dec);
      
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

  // Récupérer des tokens du faucet
  const claimTokens = useCallback(async () => {
    if (!tokenWrite) return;
    
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      addToast("Transaction envoyée...", "info");
      
      const tx = await tokenWrite.faucet();
      await tx.wait();
      
      addToast("Tokens récupérés avec succès !", "success");
      setTimeout(() => loadTokenInfo(), 1000);
    } catch (e: any) {
      const errorMsg = e.message.includes("already claimed") 
        ? "Faucet déjà utilisé récemment" 
        : "Erreur lors de la récupération des tokens";
      addToast(errorMsg, "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [tokenWrite, loadTokenInfo, addToast]);

  // Calcul des paramètres du stream
  const streamParams = useMemo(() => {
    try {
      const dec = state.tokenInfo.decimals || 18;
      const amount = parseUnitsSafe(createFormValidation.fields.amount.value, dec);
      const durationSec = Math.max(60, Number(createFormValidation.fields.duration.value || "0") * 60);
      if (amount.isZero() || durationSec === 0) return null;
      
      const durationBN = ethers.BigNumber.from(durationSec);
      const rps = amount.div(durationBN);
      if (rps.isZero()) return null;
      
      const depositAdjusted = rps.mul(durationBN);
      return {
        rps, depositAdjusted, durationSec,
        human: { rps: fmtUnits(rps, dec) },
      };
    } catch { return null; }
  }, [createFormValidation.fields.amount.value, createFormValidation.fields.duration.value, state.tokenInfo.decimals]);

  // Fonction createStream
  const createStream = useCallback(async () => {
    if (!streamWrite || !tokenWrite || !signer || !streamParams || !createFormValidation.isValid) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      const account = await signer.getAddress();
      const rec = createFormValidation.fields.recipient.value.trim();
      
      if (!ethers.utils.isAddress(rec)) throw new Error("Adresse destinataire invalide");
      if (rec.toLowerCase() === account.toLowerCase()) throw new Error("Impossible de créer un stream vers soi-même");

      const allowance: BN = await tokenWrite.allowance(account, SOMNIA_STREAM);
      if (allowance.lt(streamParams.depositAdjusted)) {
        addToast("Approbation des tokens en cours...", "info");
        const txA = await tokenWrite.approve(SOMNIA_STREAM, ethers.constants.MaxUint256);
        await txA.wait();
        addToast("Tokens approuvés !", "success");
        await loadTokenInfo();
      }

      addToast("Création du stream en cours...", "info");
      const tx = await streamWrite.createStream(rec, streamParams.depositAdjusted, streamParams.rps, TEST_TOKEN);
      await tx.wait();
      await loadUserStreams();
      createFormValidation.resetFields();
      addToast("Stream créé avec succès !", "success");
      setActiveTab("streams");
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e.message || "Erreur lors de la création du stream" });
      addToast("Erreur lors de la création", "error");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, tokenWrite, signer, createFormValidation, streamParams, loadUserStreams, loadTokenInfo, addToast]);

  // Actions sur les streams
  const pauseStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`pause-${streamId}`);
      addToast("Mise en pause du stream...", "info");
      const tx = await streamWrite.pauseStream(streamId);
      await tx.wait();
      await loadUserStreams();
      addToast("Stream mis en pause !", "success");
    } catch (e: any) {
      addToast("Erreur lors de la pause", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, addToast]);

  const resumeStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`resume-${streamId}`);
      addToast("Reprise du stream...", "info");
      const tx = await streamWrite.resumeStream(streamId);
      await tx.wait();
      await loadUserStreams();
      addToast("Stream repris !", "success");
    } catch (e: any) {
      addToast("Erreur lors de la reprise", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, addToast]);

  const withdrawStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`withdraw-${streamId}`);
      addToast("Retrait en cours...", "info");
      const tx = await streamWrite.withdraw(streamId);
      await tx.wait();
      await loadUserStreams();
      await loadTokenInfo();
      addToast("Retrait effectué !", "success");
    } catch (e: any) {
      addToast("Erreur lors du retrait", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, loadTokenInfo, addToast]);

  const cancelStream = useCallback(async (streamId: string) => {
    if (!streamWrite || !signer) return;
    try {
      setActionLoading(`cancel-${streamId}`);
      addToast("Annulation du stream...", "info");
      const tx = await streamWrite.cancelStream(streamId);
      await tx.wait();
      await loadUserStreams();
      await loadTokenInfo();
      addToast("Stream annulé !", "success");
    } catch (e: any) {
      addToast("Erreur lors de l'annulation", "error");
    } finally {
      setActionLoading(null);
    }
  }, [streamWrite, signer, loadUserStreams, loadTokenInfo, addToast]);

  // Charger les infos du token à la connexion
  useEffect(() => {
    if (state.connected && state.account && tokenRead) {
      loadTokenInfo();
    }
  }, [state.connected, state.account, tokenRead, loadTokenInfo]);

  // Charger les streams à la connexion
  useEffect(() => {
    if (state.connected && state.account && streamRead) {
      loadUserStreams();
    }
  }, [state.connected, state.account, streamRead, loadUserStreams]);

  // Calculs pour le dashboard
  const dashboardMetrics = useMemo(() => {
    const activeStreams = state.streams.filter(s => s.isActive && !s.paused);
    const pausedStreams = state.streams.filter(s => s.paused);
    const completedStreams = state.streams.filter(s => !s.isActive);
    const sentStreams = state.streams.filter(s => s.sender.toLowerCase() === state.account.toLowerCase());
    const receivedStreams = state.streams.filter(s => s.recipient.toLowerCase() === state.account.toLowerCase());
    
    const totalDeposited = state.streams.reduce((acc, s) => acc + parseFloat(s.deposit || "0"), 0);
    const totalWithdrawn = state.streams.reduce((acc, s) => acc + parseFloat(s.totalWithdrawn || "0"), 0);
    const totalWithdrawable = state.streams.reduce((acc, s) => acc + parseFloat(s.withdrawable || "0"), 0);
    
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

  // Filtrage et tri des streams
  const filteredAndSortedStreams = useMemo(() => {
    let filtered = state.streams;

    // Filtre par statut
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

    // Filtre par rôle
    if (filters.role !== 'all') {
      filtered = filtered.filter(s => {
        const isSender = s.sender.toLowerCase() === state.account.toLowerCase();
        return filters.role === 'sender' ? isSender : !isSender;
      });
    }

    // Recherche par adresse
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(s => 
        s.streamId.includes(searchLower) ||
        s.sender.toLowerCase().includes(searchLower) ||
        s.recipient.toLowerCase().includes(searchLower)
      );
    }

    // Tri
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

  // Classes CSS
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Somnia Stream</h1>
          <div className="flex items-center space-x-3">
            <button onClick={theme === "light" ? enableDark : enableLight} className={btnSecondary}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            {state.connected ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="font-medium">{shortenAddress(state.account)}</div>
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

        {/* Affichage des erreurs */}
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
              {["dashboard", "create", "streams"].map((tab) => (
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
                  {tab}
                </button>
              ))}
            </div>

            {/* Contenu des onglets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                
                {activeTab === 'dashboard' && (
                  <div className="space-y-6">
                    {/* Métriques principales */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                      <h2 className="text-xl font-semibold mb-4">📊 Tableau de bord</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{dashboardMetrics.total}</div>
                          <div className="text-sm text-gray-600">Total streams</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{dashboardMetrics.active}</div>
                          <div className="text-sm text-gray-600">Actifs</div>
                        </div>
                        <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">{dashboardMetrics.paused}</div>
                          <div className="text-sm text-gray-600">En pause</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <div className="text-2xl font-bold text-gray-600">{dashboardMetrics.completed}</div>
                          <div className="text-sm text-gray-600">Terminés</div>
                        </div>
                      </div>
                    </div>

                    {/* Métriques avancées */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4">💰 Finances</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Total déposé:</span>
                            <span className="font-medium">{dashboardMetrics.totalDeposited} {state.tokenInfo.symbol}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Total retiré:</span>
                            <span className="font-medium">{dashboardMetrics.totalWithdrawn} {state.tokenInfo.symbol}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-gray-600 dark:text-gray-400">Disponible maintenant:</span>
                            <span className="font-bold text-green-600">{dashboardMetrics.totalWithdrawable} {state.tokenInfo.symbol}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4">📈 Statistiques</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Streams envoyés:</span>
                            <span className="font-medium">{dashboardMetrics.sent}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Streams reçus:</span>
                            <span className="font-medium">{dashboardMetrics.received}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-gray-600 dark:text-gray-400">Progression moyenne:</span>
                            <span className="font-bold text-blue-600">{dashboardMetrics.avgProgress}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Streams récents */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4">🕒 Activité récente</h3>
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
                                {shortenAddress(stream.sender.toLowerCase() === state.account.toLowerCase() ? stream.recipient : stream.sender)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{parseFloat(stream.deposit).toFixed(2)} {state.tokenInfo.symbol}</div>
                            <div className="text-sm text-gray-500">{stream.progress.toFixed(1)}% terminé</div>
                          </div>
                        </div>
                      ))}
                      {state.streams.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <div className="text-4xl mb-2">🎯</div>
                          <div>Aucune activité pour le moment</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'create' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4">Créer un stream</h2>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 flex justify-between items-center">
                      <p className="text-sm">Besoin de tokens de test ?</p>
                      <button onClick={claimTokens} className={btnPrimary} disabled={state.loading}>
                        {state.loading ? <LoadingSpinner /> : "Récupérer"}
                      </button>
                    </div>

                    {/* Templates de streams */}
                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-6">
                      <div className="text-sm font-medium mb-2 col-span-2">Templates rapides :</div>
                      {Object.entries(streamTemplates).map(([key, template]) => (
                        <button
                          key={key}
                          onClick={() => {
                            createFormValidation.updateField('duration', template.duration);
                            addToast(`Template "${template.name}" appliqué`, "info");
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
                          Destinataire
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
                            Montant
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
                            Durée (minutes)
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
                          <span>Taux: {streamParams.human.rps} tokens/seconde</span>
                        </div>
                      )}
                      
                      <button 
                        onClick={createStream} 
                        disabled={!streamParams || !createFormValidation.isValid || state.loading} 
                        className={`${btnPrimary} w-full`}
                      >
                        {state.loading ? <LoadingSpinner /> : "Créer le stream"}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'streams' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">🌊 Mes streams</h2>
                      <button 
                        onClick={loadUserStreams}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                        disabled={state.loading}
                      >
                        <span>🔄</span>
                        <span>Actualiser</span>
                      </button>
                    </div>
                    
                    {/* Filtres et recherche */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium mb-1">Statut</label>
                        <select 
                          value={filters.status} 
                          onChange={(e) => updateFilter('status', e.target.value)}
                          className={inputClass}
                        >
                          <option value="all">Tous</option>
                          <option value="active">Actifs</option>
                          <option value="paused">En pause</option>
                          <option value="completed">Terminés</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Rôle</label>
                        <select 
                          value={filters.role} 
                          onChange={(e) => updateFilter('role', e.target.value)}
                          className={inputClass}
                        >
                          <option value="all">Tous</option>
                          <option value="sender">Envoyés</option>
                          <option value="recipient">Reçus</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Tri</label>
                        <select 
                          value={filters.sortBy} 
                          onChange={(e) => updateFilter('sortBy', e.target.value)}
                          className={inputClass}
                        >
                          <option value="newest">Plus récents</option>
                          <option value="oldest">Plus anciens</option>
                          <option value="amount">Montant</option>
                          <option value="progress">Progression</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Rechercher</label>
                        <input
                          type="text"
                          value={filters.search}
                          onChange={(e) => updateFilter('search', e.target.value)}
                          placeholder="ID ou adresse..."
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Bouton reset filtres */}
                    {(filters.status !== 'all' || filters.role !== 'all' || filters.search || filters.sortBy !== 'newest') && (
                      <div className="mb-4">
                        <button onClick={resetFilters} className="text-sm text-gray-500 hover:text-gray-700">
                          ✕ Réinitialiser les filtres
                        </button>
                      </div>
                    )}
                    
                    {filteredAndSortedStreams.length > 0 ? (
                      <div className="space-y-4">
                        {filteredAndSortedStreams.map((stream) => {
                          const isRecipient = stream.recipient.toLowerCase() === state.account.toLowerCase();
                          const isSender = stream.sender.toLowerCase() === state.account.toLowerCase();
                          const canWithdraw = isRecipient && parseFloat(stream.withdrawable) > 0;
                          const canPause = isSender && stream.isActive && !stream.paused;
                          const canResume = isSender && stream.paused;
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
                                    {stream.paused ? '⏸️ En pause' : stream.isActive ? '▶️ Actif' : '⏹️ Terminé'}
                                  </div>
                                  <div className={`text-xs px-2 py-1 rounded-full ${
                                    isRecipient ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {isRecipient ? '📥 Reçu' : '📤 Envoyé'}
                                  </div>
                                </div>
                                
                                {/* Actions */}
                                <div className="flex items-center space-x-2">
                                  {canWithdraw && (
                                    <button
                                      onClick={() => withdrawStream(stream.streamId)}
                                      disabled={actionLoading === `withdraw-${stream.streamId}`}
                                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `withdraw-${stream.streamId}` ? '⏳' : '💰 Retirer'}
                                    </button>
                                  )}
                                  
                                  {canPause && (
                                    <button
                                      onClick={() => pauseStream(stream.streamId)}
                                      disabled={actionLoading === `pause-${stream.streamId}`}
                                      className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `pause-${stream.streamId}` ? '⏳' : '⏸️ Pause'}
                                    </button>
                                  )}
                                  
                                  {canResume && (
                                    <button
                                      onClick={() => resumeStream(stream.streamId)}
                                      disabled={actionLoading === `resume-${stream.streamId}`}
                                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `resume-${stream.streamId}` ? '⏳' : '▶️ Reprendre'}
                                    </button>
                                  )}
                                  
                                  {canCancel && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Êtes-vous sûr de vouloir annuler ce stream ?')) {
                                          cancelStream(stream.streamId);
                                        }
                                      }}
                                      disabled={actionLoading === `cancel-${stream.streamId}`}
                                      className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {actionLoading === `cancel-${stream.streamId}` ? '⏳' : '❌ Annuler'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600 dark:text-gray-400 mb-3">
                                <div>
                                  <div><strong>Contrepartie:</strong> {shortenAddress(isRecipient ? stream.sender : stream.recipient)}</div>
                                  <div><strong>Montant total:</strong> {parseFloat(stream.deposit).toFixed(4)} {state.tokenInfo.symbol}</div>
                                </div>
                                <div>
                                  <div><strong>Progression:</strong> {stream.progress.toFixed(1)}%</div>
                                  <div><strong>Déjà retiré:</strong> {parseFloat(stream.totalWithdrawn).toFixed(4)} {state.tokenInfo.symbol}</div>
                                </div>
                                <div>
                                  <div><strong>Taux/sec:</strong> {parseFloat(stream.ratePerSecond).toFixed(6)}</div>
                                  <div className="text-green-600"><strong>Disponible:</strong> {parseFloat(stream.withdrawable).toFixed(6)} {state.tokenInfo.symbol}</div>
                                </div>
                              </div>
                              
                              {/* Barre de progression */}
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-300 ${
                                    stream.paused ? 'bg-yellow-500' : 
                                    stream.isActive ? 'bg-green-500' : 'bg-gray-400'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, stream.progress))}%` }}
                                />
                              </div>
                              
                              {/* Détails temporels */}
                              <div className="flex justify-between text-xs text-gray-500">
                                <div>Début: {new Date(stream.startTime * 1000).toLocaleString()}</div>
                                <div>Fin: {new Date(stream.stopTime * 1000).toLocaleString()}</div>
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
                            <div>Aucun stream pour le moment</div>
                            <div className="text-sm mt-2">Créez votre premier stream !</div>
                          </>
                        ) : (
                          <>
                            <div className="text-4xl mb-2">🔍</div>
                            <div>Aucun stream ne correspond aux critères</div>
                            <div className="text-sm mt-2">Essayez de modifier les filtres</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sidebar améliorée */}
              <div className="space-y-6">
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
                      🚰 Récupérer des tokens
                    </button>
                    <button 
                      onClick={loadTokenInfo} 
                      className={`${btnSecondary} w-full text-sm`}
                    >
                      🔄 Actualiser
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">📊 Résumé</h3>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Total Streams:</span>
                      <span className="font-medium">{dashboardMetrics.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Actifs:</span>
                      <span className="font-medium text-green-600">{dashboardMetrics.active}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>En pause:</span>
                      <span className="font-medium text-yellow-600">{dashboardMetrics.paused}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Terminés:</span>
                      <span className="font-medium text-gray-600">{dashboardMetrics.completed}</span>
                    </div>
                  </div>
                </div>

                {parseFloat(dashboardMetrics.totalWithdrawable) > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-xl p-6">
                    <h3 className="font-semibold mb-2 text-green-800 dark:text-green-200">💰 Fonds disponibles</h3>
                    <div className="text-2xl font-bold text-green-600 mb-2">
                      {dashboardMetrics.totalWithdrawable} {state.tokenInfo.symbol}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">
                      Montant total que vous pouvez retirer maintenant
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">🔗 Liens utiles</h3>
                  <div className="space-y-2 text-sm">
                    <a 
                      href={`${SOMNIA_EXPLORER}/address/${TEST_TOKEN}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800"
                    >
                      📄 Contrat Token
                    </a>
                    <a 
                      href={`${SOMNIA_EXPLORER}/address/${SOMNIA_STREAM}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800"
                    >
                      🌊 Contrat Stream
                    </a>
                    <a 
                      href={`${SOMNIA_EXPLORER}/address/${state.account}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800"
                    >
                      👤 Mon compte
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🌊</div>
            <h2 className="text-2xl font-semibold mb-2">Bienvenue sur Somnia Stream</h2>
            <p className="text-gray-600 mb-6">Connectez votre wallet pour commencer.</p>
          </div>
        )}
      </div>
    </div>
  );
}