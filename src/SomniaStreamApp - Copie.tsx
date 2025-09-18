import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ethers } from "ethers";

/* ================= THEME ================= */
function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    // Removed localStorage usage - use state only
    setTheme("light");
  }, []);
  const enableDark = useCallback(() => {
    document.documentElement.classList.add("dark");
    setTheme("dark");
  }, []);
  const enableLight = useCallback(() => {
    document.documentElement.classList.remove("dark");
    setTheme("light");
  }, []);
  return { theme, enableDark, enableLight };
}

/* ================= CONFIG ================= */
const SOMNIA_RPC = "https://dream-rpc.somnia.network";
const SOMNIA_CHAIN_ID = 50312; // 0xC488
const SOMNIA_EXPLORER = "https://explorer-testnet.somnia.network";

const SOMNIA_STREAM = "0x768bB760569D506D31eE654092EfEC50941DCF88";
const TEST_TOKEN = "0xA385AF22e40cC2ee30fC50DD56ec505462518398";

/* ================= ABIs ================= */
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function faucet() external",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

const STREAM_ABI = [
  "function createStream(address recipient, uint256 deposit, uint256 ratePerSecond, address token) returns (uint256)",
  "function pauseStream(uint256 streamId)",
  "function resumeStream(uint256 streamId)",
  "function cancelStream(uint256 streamId)",
  "function withdraw(uint256 streamId, uint256 amount)",
  "function withdrawAll(uint256 streamId)",
  "function withdrawable(uint256 streamId, address who) view returns (uint256)",
  "function getStream(uint256) view returns (tuple(address sender,address recipient,uint256 deposit,address token,uint256 startTime,uint256 stopTime,uint256 ratePerSecond,uint256 remainingBalance,uint256 lastWithdrawTime,bool isPaused,uint256 pausedTime,uint256 totalWithdrawn,bool isActive))",
  "function nextStreamId() view returns (uint256)",
  "function transferStream(uint256 streamId, address newRecipient)",
  "function getStreamsAsSender(address user) view returns (uint256[])",
  "function getStreamsAsRecipient(address user) view returns (uint256[])",
  "event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed recipient, uint256 deposit, address token, uint256 ratePerSecond, uint256 startTime)",
  "event StreamPaused(uint256 indexed streamId, uint256 pausedTime)",
  "event StreamResumed(uint256 indexed streamId, uint256 resumedTime)",
  "event StreamCancelled(uint256 indexed streamId, uint256 paidToRecipient, uint256 refundedToSender, uint256 platformFee)",
  "event Withdrawal(uint256 indexed streamId, address indexed recipient, uint256 amount, address token)",
];

/* ================= Types ================= */
type BN = ethers.BigNumber;

type StreamRaw = {
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
};

type StreamInfo = {
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
};

type AppState = {
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
};

type AppAction =
  | { type: "SET_ACCOUNT"; payload: string }
  | { type: "SET_CHAIN_ID"; payload: number }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_STREAMS"; payload: StreamInfo[] }
  | { type: "SET_ACTIVE_STREAM"; payload: StreamInfo | null }
  | { type: "SET_TOKEN_INFO"; payload: Partial<AppState["tokenInfo"]> }
  | { type: "UPDATE_STREAM"; payload: StreamInfo }
  | { type: "RESET" };

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

/* ================= Utils (ethers v5) ================= */
const isTxHash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);

const fmtUnits = (bn: BN, dec = 18) => {
  try {
    return ethers.utils.formatUnits(bn, dec);
  } catch {
    return bn.toString();
  }
};
const parseUnitsSafe = (amount: string, dec = 18) => {
  return ethers.utils.parseUnits(amount || "0", dec);
};
const shortenAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "-");
const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString();
const calcProgress = (deposit: BN, remaining: BN) => {
  if (deposit.isZero()) return 0;
  const spent = deposit.sub(remaining);
  return Math.min(100, Math.max(0, spent.mul(10000).div(deposit).toNumber() / 100));
};

/* ================= Subcomponents ================= */
const LoadingSpinner = () => (
  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
);

const ErrorAlert = ({ error, onClose }: { error: string; onClose: () => void }) => (
  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <span className="text-red-600 dark:text-red-400 mr-2">⚠️</span>
        <span className="text-red-800 dark:text-red-200 text-sm">{error}</span>
      </div>
      <button onClick={onClose} className="text-red-600 dark:text-red-400 hover:text-red-800">
        ×
      </button>
    </div>
  </div>
);

const StreamCard = ({
  stream,
  onSelect,
  isActive,
}: {
  stream: StreamInfo;
  onSelect: (s: StreamInfo) => void;
  isActive: boolean;
}) => {
  // Calculate if stream is actually finished
  const now = Math.floor(Date.now() / 1000);
  const startTime = stream.startTime;
  const rate = parseFloat(stream.ratePerSecond);
  const deposit = parseFloat(stream.deposit);
  
  // Calculate when stream should end
  const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
  const calculatedEndTime = startTime + streamDuration;
  
  // Check multiple conditions for finished stream
  const timeExpired = now >= calculatedEndTime;
  const noTokensLeft = parseFloat(stream.remaining) <= 0;
  const notActive = !stream.isActive;
  const elapsedTime = now - startTime;
  const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
  
  const isStreamFinished = timeExpired || noTokensLeft || notActive || durationExceeded;
  
  // Determine display status
  let displayStatus = "Active";
  let statusClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300";
  
  if (stream.paused) {
    displayStatus = "Paused";
    statusClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300";
  } else if (isStreamFinished) {
    displayStatus = "Completed";
    statusClass = "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
  }

  return (
    <div
      className={`p-4 rounded-lg border cursor-pointer transition-all ${isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
        }`}
      onClick={() => onSelect(stream)}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-medium">Stream #{stream.streamId}</div>
        <div className={`px-2 py-1 rounded text-xs ${statusClass}`}>
          {displayStatus}
        </div>
      </div>

      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
        <div>To: {shortenAddress(stream.recipient)}</div>
        <div>Remaining: {parseFloat(stream.remaining).toFixed(4)}</div>
        <div>Withdrawable: {parseFloat(stream.withdrawable).toFixed(4)}</div>
        {isStreamFinished && streamDuration > 0 && (
          <div className="text-red-500 dark:text-red-400">
            Elapsed: {Math.floor(elapsedTime / 60)}m (Duration: {Math.floor(streamDuration / 60)}m)
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span>Progress</span>
          <span>{stream.progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${stream.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

/* ================= Main Component ================= */
export default function SomniaStreamApp() {
  const { theme, enableDark, enableLight } = useTheme();
  const [state, dispatch] = useReducer(appReducer, initialState);

  // In-memory cache for streams instead of localStorage
  const [streamCache, setStreamCache] = useState<Map<string, { streams: StreamInfo[], timestamp: number }>>(new Map());

  // Providers & contracts (ethers v5)
  const [readProvider, setReadProvider] = useState<ethers.providers.JsonRpcProvider | null>(null);
  const [writeProvider, setWriteProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    recipient: "0x46A9edae25d74e3c9816574e3850Bda91DF0b836",
    amount: "1",
    duration: "60", // Changed to 60 minutes by default
  });
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [streamIdInput, setStreamIdInput] = useState("");

  // UI states
  const [activeTab, setActiveTab] = useState<"create" | "manage" | "sent" | "received">("create");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Contracts
  const tokenRead = useMemo(
    () => (readProvider ? new ethers.Contract(TEST_TOKEN, ERC20_ABI, readProvider) : null),
    [readProvider]
  );
  const tokenWrite = useMemo(
    () => (signer ? new ethers.Contract(TEST_TOKEN, ERC20_ABI, signer) : null),
    [signer]
  );
  const streamRead = useMemo(
    () => (readProvider ? new ethers.Contract(SOMNIA_STREAM, STREAM_ABI, readProvider) : null),
    [readProvider]
  );
  const streamWrite = useMemo(
    () => (signer ? new ethers.Contract(SOMNIA_STREAM, STREAM_ABI, signer) : null),
    [signer]
  );

  /* ---------- Init read provider ---------- */
  useEffect(() => {
    const rp = new ethers.providers.JsonRpcProvider(SOMNIA_RPC, { name: "somnia", chainId: SOMNIA_CHAIN_ID });
    setReadProvider(rp);
  }, []);

  /* ---------- Connect wallet ---------- */
  const connectWallet = useCallback(async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error("MetaMask not detected. Please install MetaMask browser extension.");
      }

      // Create provider
      const provider = new ethers.providers.Web3Provider(ethereum, "any");
      
      // Request account access
      await provider.send("eth_requestAccounts", []);
      
      // Get network info
      let network = await provider.getNetwork();
      
      // Check if we're on the correct network
      if (network.chainId !== SOMNIA_CHAIN_ID) {
        try {
          // Try to switch to Somnia network
          await ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xC488" }],
          });
        } catch (switchError: any) {
          // If the network doesn't exist, add it
          if (switchError.code === 4902) {
            await ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0xC488",
                  chainName: "Somnia Testnet",
                  rpcUrls: [SOMNIA_RPC],
                  nativeCurrency: { 
                    name: "SOMNIA", 
                    symbol: "SOMNIA", 
                    decimals: 18 
                  },
                  blockExplorerUrls: [SOMNIA_EXPLORER],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
        
        // Refresh network info after switch/add
        network = await provider.getNetwork();
      }

      // Get signer and address
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      // Update state
      setWriteProvider(provider);
      setSigner(signer);
      dispatch({ type: "SET_ACCOUNT", payload: address });
      dispatch({ type: "SET_CHAIN_ID", payload: network.chainId });
      dispatch({ type: "SET_CONNECTED", payload: true });

      // Set up event listeners (only once)
      if (!(ethereum as any).__somniaListeners) {
        (ethereum as any).__somniaListeners = true;
        ethereum.on("accountsChanged", (accounts: string[]) => {
          if (accounts.length === 0) {
            // User disconnected
            dispatch({ type: "SET_CONNECTED", payload: false });
            dispatch({ type: "SET_ACCOUNT", payload: "" });
            setWriteProvider(null);
            setSigner(null);
          } else {
            // Account changed, reload to avoid state issues
            window.location.reload();
          }
        });
        ethereum.on("chainChanged", () => {
          // Chain changed, reload to avoid state issues
          window.location.reload();
        });
      }

    } catch (error: any) {
      console.error("Wallet connection error:", error);
      let errorMessage = "Failed to connect wallet";
      
      if (error?.code === 4001) {
        errorMessage = "Connection rejected by user";
      } else if (error?.code === -32002) {
        errorMessage = "Connection request already pending";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: "SET_ERROR", payload: errorMessage });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  /* ---------- Load token info with proper decimal formatting ---------- */
  const loadTokenInfo = useCallback(async () => {
    if (!tokenRead || !state.account) return;
    try {
      const [dec, sym, name, bal, allowance] = await Promise.all([
        tokenRead.decimals(),
        tokenRead.symbol(),
        tokenRead.name(),
        tokenRead.balanceOf(state.account),
        tokenRead.allowance(state.account, SOMNIA_STREAM),
      ]);
      
      const decimals = Number(dec);
      const balanceFormatted = fmtUnits(bal, decimals);
      const allowanceFormatted = fmtUnits(allowance, decimals);
      
      // Format numbers properly - handle display vs internal values separately
      const formatForDisplay = (numStr: string) => {
        const num = parseFloat(numStr);
        if (num > 1e20) {
          return "Unlimited";
        } else if (num >= 1e12) {
          return (num / 1e12).toFixed(2).replace(/\.?0+$/, '') + "T";
        } else if (num >= 1e9) {
          return (num / 1e9).toFixed(2).replace(/\.?0+$/, '') + "B";
        } else if (num >= 1e6) {
          return (num / 1e6).toFixed(2).replace(/\.?0+$/, '') + "M";
        } else if (num >= 1e3) {
          return (num / 1e3).toFixed(2).replace(/\.?0+$/, '') + "K";
        } else {
          // For normal numbers, show up to 4 decimal places but remove trailing zeros
          return Number(num.toFixed(4)).toString();
        }
      };
      
      dispatch({
        type: "SET_TOKEN_INFO",
        payload: {
          decimals: decimals,
          symbol: sym,
          name,
          balance: formatForDisplay(balanceFormatted),
          allowance: formatForDisplay(allowanceFormatted),
          // Store raw values for calculations
          _rawBalance: balanceFormatted,
          _rawAllowance: allowanceFormatted,
        },
      });
    } catch (e) {
      console.error("Failed to load token info:", e);
    }
  }, [tokenRead, state.account]);

  /* ---------- Helpers: load single stream ---------- */
  const shapeStream = useCallback(
    async (id: BN | string): Promise<StreamInfo | null> => {
      if (!streamRead) return null;
      try {
        const idBN = ethers.BigNumber.isBigNumber(id) ? (id as BN) : ethers.BigNumber.from(id);
        const s: StreamRaw = await streamRead.getStream(idBN);
        
        // Get current account for withdrawable calculation
        let withdrawable = ethers.BigNumber.from(0);
        let currentAccount = "";
        
        if (signer) {
          try {
            currentAccount = await signer.getAddress();
            withdrawable = await streamRead.withdrawable(idBN, currentAccount);
          } catch {
            // If signer fails, still return stream info without withdrawable
          }
        }

        const dec = state.tokenInfo.decimals || 18;
        
        // Calculate real-time progress and withdrawable based on actual time progression
        const now = Math.floor(Date.now() / 1000);
        const startTime = Number(s.startTime);
        let stopTime = Number(s.stopTime);
        
        // Fix invalid stopTime (common issue with this contract)
        if (stopTime <= startTime || stopTime === 0) {
          if (!s.ratePerSecond.isZero()) {
            const durationSeconds = s.deposit.div(s.ratePerSecond);
            stopTime = startTime + durationSeconds.toNumber();
          } else {
            stopTime = startTime + 3600; // Default 1 hour if rate is 0
          }
        }
        
        let actualProgress = 0;
        let calculatedWithdrawable = ethers.BigNumber.from(0);
        
        if (!s.ratePerSecond.isZero() && startTime > 0) {
          if (now <= startTime) {
            // Stream hasn't started yet
            actualProgress = 0;
            calculatedWithdrawable = ethers.BigNumber.from(0);
          } else if (now >= stopTime) {
            // Stream should be completed
            actualProgress = 100;
            calculatedWithdrawable = s.deposit.sub(s.totalWithdrawn);
            if (calculatedWithdrawable.lt(0)) calculatedWithdrawable = ethers.BigNumber.from(0);
          } else {
            // Stream is active - calculate based on elapsed time
            const elapsedTime = now - startTime;
            const totalDuration = stopTime - startTime;
            
            // Calculate progress as percentage of time elapsed
            actualProgress = Math.min(100, (elapsedTime / totalDuration) * 100);
            
            // Calculate tokens that should be available based on elapsed time
            const elapsedTokens = s.ratePerSecond.mul(elapsedTime);
            const maxTokens = s.deposit;
            
            // Don't exceed deposit amount
            const actualElapsedTokens = elapsedTokens.gt(maxTokens) ? maxTokens : elapsedTokens;
            
            // Subtract what's already been withdrawn
            calculatedWithdrawable = actualElapsedTokens.sub(s.totalWithdrawn);
            if (calculatedWithdrawable.lt(0)) calculatedWithdrawable = ethers.BigNumber.from(0);
          }
          
          // Handle paused streams
          if (s.isPaused && Number(s.pausedTime) > 0) {
            const pausedTime = Number(s.pausedTime);
            const activeTime = Math.min(pausedTime - startTime, stopTime - startTime);
            if (activeTime > 0) {
              actualProgress = Math.min(100, (activeTime / (stopTime - startTime)) * 100);
              const activeTokens = s.ratePerSecond.mul(activeTime);
              calculatedWithdrawable = activeTokens.sub(s.totalWithdrawn);
              if (calculatedWithdrawable.lt(0)) calculatedWithdrawable = ethers.BigNumber.from(0);
            }
          }
        }
        
        // Use calculated value if contract returns obviously wrong data
        let finalWithdrawable = withdrawable;
        
        // If contract withdrawable seems wrong (e.g., full deposit when stream just started)
        if (withdrawable.eq(s.deposit) && s.totalWithdrawn.isZero() && now < stopTime) {
          finalWithdrawable = calculatedWithdrawable;
        } else if (withdrawable.gt(calculatedWithdrawable.add(parseUnitsSafe("0.01", dec)))) {
          // Contract value is significantly higher than calculated - use calculated
          finalWithdrawable = calculatedWithdrawable;
        }

        const info: StreamInfo = {
          streamId: idBN.toString(),
          sender: s.sender,
          recipient: s.recipient,
          token: s.token,
          deposit: fmtUnits(s.deposit, dec),
          ratePerSecond: fmtUnits(s.ratePerSecond, dec),
          remaining: fmtUnits(s.remainingBalance, dec),
          paused: s.isPaused,
          startTime: startTime,
          stopTime: stopTime,
          lastWithdrawTime: Number(s.lastWithdrawTime),
          progress: actualProgress,
          withdrawable: fmtUnits(finalWithdrawable, dec),
          totalWithdrawn: fmtUnits(s.totalWithdrawn, dec),
          isActive: s.isActive,
          _raw: { deposit: s.deposit, remaining: s.remainingBalance, ratePerSecond: s.ratePerSecond },
        };
        return info;
      } catch (e) {
        console.error("Error shaping stream:", e);
        return null;
      }
    },
    [streamRead, signer, state.tokenInfo.decimals]
  );

  /* ---------- Load by tx hash or id ---------- */
  const recoverIdFromTx = useCallback(
    async (txHash: string): Promise<string> => {
      if (!readProvider) throw new Error("No read provider");
      const rc = await readProvider.getTransactionReceipt(txHash);
      if (!rc) throw new Error("Receipt introuvable (tx non minée ?)");
      const iface = new ethers.utils.Interface(STREAM_ABI);
      for (const l of rc.logs) {
        if (l.address.toLowerCase() !== SOMNIA_STREAM.toLowerCase()) continue;
        try {
          const p = iface.parseLog(l);
          if (p.name === "StreamCreated") return p.args.streamId.toString();
        } catch { }
      }
      throw new Error("Event StreamCreated introuvable");
    },
    [readProvider]
  );

  const loadStreamByInput = useCallback(async () => {
    if (!streamIdInput.trim()) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      
      let id = streamIdInput.trim();
      if (isTxHash(id)) {
        id = await recoverIdFromTx(id);
      }
      
      // Check if the stream ID is valid (numeric and reasonable)
      const numericId = parseInt(id);
      if (isNaN(numericId) || numericId <= 0) {
        throw new Error("Invalid stream ID. Please enter a valid number or transaction hash.");
      }
      
      // Check if stream exists by trying to get nextStreamId
      if (streamRead) {
        try {
          const nextId = await streamRead.nextStreamId();
          if (numericId >= nextId.toNumber()) {
            throw new Error(`Stream #${numericId} does not exist yet. Latest stream ID is ${nextId.toNumber() - 1}.`);
          }
        } catch (e: any) {
          if (e.message.includes("does not exist yet")) {
            throw e;
          }
          // If we can't get nextStreamId, continue anyway
        }
      }
      
      const s = await shapeStream(id);
      if (s) {
        dispatch({ type: "SET_ACTIVE_STREAM", payload: s });
        setActiveTab("manage");
      } else {
        dispatch({ type: "SET_ERROR", payload: `Stream #${id} not found or you don't have access to it.` });
      }
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message || "Failed to load stream" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamIdInput, recoverIdFromTx, shapeStream, streamRead]);

  /* ---------- Load user streams with in-memory cache ---------- */
  const loadUserStreams = useCallback(async () => {
    if (!streamRead || !state.account) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });

      const cacheKey = `${state.account.toLowerCase()}_${SOMNIA_STREAM}`;
      const cached = streamCache.get(cacheKey);
      const ttl = 5 * 60 * 1000;
      if (cached && Date.now() - cached.timestamp < ttl) {
        dispatch({ type: "SET_STREAMS", payload: cached.streams });
        return;
      }

      let ids: string[] = [];

      try {
        const asSender: BN[] = await streamRead.getStreamsAsSender(state.account);
        const asRecipient: BN[] = await streamRead.getStreamsAsRecipient(state.account);
        const set = new Set<string>();
        asSender.forEach((bn) => set.add(bn.toString()));
        asRecipient.forEach((bn) => set.add(bn.toString()));
        ids = Array.from(set);
      } catch {
        try {
          const next = await streamRead.nextStreamId();
          const total = next.sub(1).toNumber();
          const max = Math.min(total, 50);
          for (let i = Math.max(1, total - max + 1); i <= total; i++) ids.push(String(i));
        } catch {
          ids = [];
        }
      }

      const out: StreamInfo[] = [];
      for (const id of ids) {
        const s = await shapeStream(id);
        if (!s) continue;
        const me = state.account.toLowerCase();
        if (s.sender.toLowerCase() === me || s.recipient.toLowerCase() === me) out.push(s);
      }

      out.sort((a, b) => Number(b.streamId) - Number(a.streamId));
      dispatch({ type: "SET_STREAMS", payload: out });
      setStreamCache(prev => new Map(prev).set(cacheKey, { streams: out, timestamp: Date.now() }));
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message || "Failed to load streams" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamRead, state.account, shapeStream, streamCache]);

  const clearStreamCache = useCallback(() => {
    setStreamCache(new Map());
  }, []);

  /* ---------- Faucet with forced refresh ---------- */
  const claimTokens = useCallback(async () => {
    if (!tokenWrite) {
      dispatch({ type: "SET_ERROR", payload: "Wallet not connected" });
      return;
    }
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      
      const tx = await tokenWrite.faucet();
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        // Force refresh token info after successful faucet claim
        setTimeout(async () => {
          await loadTokenInfo();
        }, 1000); // Wait 1 second for blockchain to update
        
        dispatch({ type: "SET_ERROR", payload: null });
      } else {
        throw new Error("Transaction failed");
      }
    } catch (e: any) {
      let errorMsg = "Faucet claim failed";
      if (e?.message?.includes("already claimed")) {
        errorMsg = "Faucet already claimed recently. Please wait before claiming again.";
      } else if (e?.message) {
        errorMsg = e.message;
      }
      dispatch({ type: "SET_ERROR", payload: errorMsg });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [tokenWrite, loadTokenInfo]);

  /* ---------- Parameter calculator (fixed calculation) ---------- */
  const calcParams = useCallback(() => {
    const dec = state.tokenInfo.decimals || 18;
    try {
      const amount = parseUnitsSafe(createForm.amount, dec);
      const durationSec = Math.max(60, Number(createForm.duration || "0") * 60); // Minimum 60 seconds
      
      if (amount.isZero() || durationSec === 0) {
        return null;
      }
      
      const durationBN = ethers.BigNumber.from(durationSec);
      const rps = amount.div(durationBN);
      
      // Ensure rps is not zero
      if (rps.isZero()) {
        return null;
      }
      
      const depositAdjusted = rps.mul(durationBN);
      const dust = amount.sub(depositAdjusted);
      
      return {
        rps,
        depositAdjusted,
        durationSec,
        human: {
          rps: fmtUnits(rps, dec),
          rpm: fmtUnits(rps.mul(60), dec),
          rph: fmtUnits(rps.mul(3600), dec),
          dust: fmtUnits(dust, dec),
        },
      };
    } catch {
      return null;
    }
  }, [createForm.amount, createForm.duration, state.tokenInfo.decimals]);

  const [streamParams, setStreamParams] = useState<ReturnType<typeof calcParams> | null>(null);

  useEffect(() => {
    const p = calcParams();
    setStreamParams(p);
  }, [calcParams]);

  /* ---------- Create stream (with proper validation) ---------- */
  const createStream = useCallback(async () => {
    if (!streamWrite || !tokenWrite || !signer || !streamParams) {
      dispatch({ type: "SET_ERROR", payload: "Wallet not connected or params invalid" });
      return;
    }
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });

      const account = await signer.getAddress();
      const rec = createForm.recipient.trim();
      
      // Validation
      if (!rec || !ethers.utils.isAddress(rec)) {
        throw new Error("Invalid recipient address");
      }
      if (rec.toLowerCase() === account.toLowerCase()) {
        throw new Error("Cannot stream to yourself");
      }
      if (streamParams.rps.isZero()) {
        throw new Error("Rate per second is zero (amount too small for duration)");
      }
      if (streamParams.durationSec < 60) {
        throw new Error("Duration must be at least 60 seconds (1 minute)");
      }

      // Check balance using raw balance value
      const bal: BN = await tokenWrite.balanceOf(account);
      if (bal.lt(streamParams.depositAdjusted)) {
        const rawBalance = state.tokenInfo._rawBalance || state.tokenInfo.balance;
        const availableAmount = parseFloat(rawBalance);
        const requiredAmount = parseFloat(fmtUnits(streamParams.depositAdjusted, state.tokenInfo.decimals));
        throw new Error(`Insufficient balance. Have: ${availableAmount.toFixed(4)}, Need: ${requiredAmount.toFixed(4)}`);
      }

      // Check and approve if needed
      const allowance: BN = await tokenWrite.allowance(account, SOMNIA_STREAM);
      if (allowance.lt(streamParams.depositAdjusted)) {
        dispatch({ type: "SET_ERROR", payload: "Approving tokens..." });
        const txA = await tokenWrite.approve(SOMNIA_STREAM, ethers.constants.MaxUint256);
        await txA.wait();
        await loadTokenInfo();
      }

      // Create stream with proper gas estimation
      let gasEstimate;
      try {
        gasEstimate = await streamWrite.estimateGas.createStream(
          rec, 
          streamParams.depositAdjusted, 
          streamParams.rps, 
          TEST_TOKEN
        );
      } catch (e: any) {
        throw new Error(`Gas estimation failed: ${e.message}`);
      }

      const tx = await streamWrite.createStream(
        rec, 
        streamParams.depositAdjusted, 
        streamParams.rps, 
        TEST_TOKEN,
        {
          gasLimit: gasEstimate.mul(120).div(100), // Add 20% buffer
        }
      );
      
      const rc = await tx.wait();

      // Find the stream ID from events
      let newId: string | null = null;
      for (const log of rc.logs) {
        try {
          const parsed = streamWrite.interface.parseLog(log);
          if (parsed.name === "StreamCreated") {
            newId = parsed.args.streamId.toString();
            break;
          }
        } catch { }
      }

      if (newId) {
        const s = await shapeStream(newId);
        if (s) {
          dispatch({ type: "SET_ACTIVE_STREAM", payload: s });
          setActiveTab("manage");
        }
      }

      await loadUserStreams();
      await loadTokenInfo();
      
      // Reset form
      setCreateForm({
        recipient: "",
        amount: "1",
        duration: "60",
      });

    } catch (e: any) {
      let msg = e?.message || "Create failed";
      if (e?.code === "UNPREDICTABLE_GAS_LIMIT") {
        msg = "Transaction would fail. Check your balance and allowance.";
      } else if (e?.message?.includes("insufficient funds")) {
        msg = "Insufficient funds for transaction fees.";
      } else if (e?.message?.includes("execution reverted")) {
        msg = "Contract execution failed. Check parameters.";
      }
      dispatch({ type: "SET_ERROR", payload: msg });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, tokenWrite, signer, createForm.recipient, streamParams, shapeStream, loadUserStreams, loadTokenInfo, state.tokenInfo.decimals, state.tokenInfo._rawBalance]);

  /* ---------- Actions (pause/resume/cancel/withdraw/transfer) ---------- */
  const isUserSender =
    state.activeStream && state.account && state.activeStream.sender.toLowerCase() === state.account.toLowerCase();
  const isUserRecipient =
    state.activeStream && state.account && state.activeStream.recipient.toLowerCase() === state.account.toLowerCase();

  const refreshActive = useCallback(async () => {
    if (!state.activeStream) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const s = await shapeStream(state.activeStream.streamId);
      if (s) {
        dispatch({ type: "SET_ACTIVE_STREAM", payload: s });
      }
    } catch (e) {
      console.warn("Failed to refresh active stream:", e);
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [state.activeStream, shapeStream]);

  const pauseStream = useCallback(async () => {
    if (!streamWrite || !state.activeStream) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const tx = await streamWrite.pauseStream(state.activeStream.streamId);
      await tx.wait();
      // Force refresh after pause
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refreshActive();
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message || "Pause failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, state.activeStream, refreshActive]);

  const resumeStream = useCallback(async () => {
    if (!streamWrite || !state.activeStream) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const tx = await streamWrite.resumeStream(state.activeStream.streamId);
      await tx.wait();
      // Force refresh after resume
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refreshActive();
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message || "Resume failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, state.activeStream, refreshActive]);

  const cancelStream = useCallback(async () => {
    if (!streamWrite || !state.activeStream) return;
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });

      // Validation avant annulation
      if (!state.activeStream.isActive) {
        throw new Error("Stream is not active and cannot be cancelled");
      }
      
      if (parseFloat(state.activeStream.remaining) <= 0) {
        throw new Error("Stream is already completed and cannot be cancelled");
      }

      // Vérifier si l'utilisateur est bien le sender
      const account = await signer!.getAddress();
      if (state.activeStream.sender.toLowerCase() !== account.toLowerCase()) {
        throw new Error("Only the stream sender can cancel the stream");
      }

      // Essayer d'abord avec callStatic pour diagnostiquer
      try {
        await streamWrite.callStatic.cancelStream(state.activeStream.streamId);
      } catch (e: any) {
        let errorMsg = "Cannot cancel stream: ";
        if (e.message.includes("0x13c872ee")) {
          errorMsg += "Stream may already be cancelled, completed, or you don't have permission";
        } else {
          errorMsg += e.message;
        }
        throw new Error(errorMsg);
      }

      // Exécuter la transaction avec gas limit plus élevé
      const tx = await streamWrite.cancelStream(state.activeStream.streamId, {
        gasLimit: 300000, // Gas limit plus élevé pour l'annulation
      });
      
      await tx.wait();
      await refreshActive();
      await loadTokenInfo();
      
    } catch (e: any) {
      let msg = e?.message || "Cancel failed";
      if (e?.code === "UNPREDICTABLE_GAS_LIMIT") {
        msg = "Cannot cancel stream. It may already be cancelled, completed, or you don't have permission.";
      }
      dispatch({ type: "SET_ERROR", payload: msg });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, state.activeStream, signer, refreshActive, loadTokenInfo]);

  const withdrawFromStream = useCallback(
    async (amt?: string) => {
      if (!streamWrite || !state.activeStream) return;
      try {
        dispatch({ type: "SET_LOADING", payload: true });
        dispatch({ type: "SET_ERROR", payload: null });
        
        const dec = state.tokenInfo.decimals || 18;
        const account = await signer!.getAddress();
        
        // Vérifier que l'utilisateur est le recipient
        if (state.activeStream.recipient.toLowerCase() !== account.toLowerCase()) {
          throw new Error("Only the stream recipient can withdraw");
        }

        // Obtenir le montant withdrawable actuel
        const withdrawableBN = await streamRead!.withdrawable(state.activeStream.streamId, account);
        const withdrawableAmount = parseFloat(fmtUnits(withdrawableBN, dec));
        
        if (withdrawableAmount <= 0) {
          throw new Error("No tokens available to withdraw");
        }

        let tx;
        if (amt && amt.trim()) {
          const requestedAmount = parseFloat(amt.trim());
          
          // Validation du montant demandé
          if (requestedAmount <= 0) {
            throw new Error("Withdrawal amount must be greater than 0");
          }
          
          if (requestedAmount > withdrawableAmount) {
            throw new Error(`Cannot withdraw ${requestedAmount.toFixed(6)} ${state.tokenInfo.symbol}. Maximum available: ${withdrawableAmount.toFixed(6)} ${state.tokenInfo.symbol}`);
          }
          
          const bn = parseUnitsSafe(amt.trim(), dec);
          
          // Vérifier que le montant en BN n'est pas supérieur au withdrawable
          if (bn.gt(withdrawableBN)) {
            throw new Error(`Amount exceeds withdrawable balance`);
          }
          
          tx = await streamWrite.withdraw(state.activeStream.streamId, bn);
        } else {
          // Retrait de tout le disponible
          if (withdrawableBN.isZero()) {
            throw new Error("No tokens available to withdraw");
          }
          
          try {
            tx = await streamWrite.withdrawAll(state.activeStream.streamId);
          } catch {
            // Fallback au retrait manuel du montant exact
            tx = await streamWrite.withdraw(state.activeStream.streamId, withdrawableBN);
          }
        }
        
        await tx.wait();
        
        // Force refresh after withdrawal with delay
        await new Promise(resolve => setTimeout(resolve, 3000));
        await refreshActive();
        await loadTokenInfo();
        setWithdrawAmount(""); // Clear the input after successful withdrawal
        
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e?.message || "Withdraw failed" });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    [streamWrite, state.activeStream, state.tokenInfo.decimals, signer, streamRead, refreshActive, loadTokenInfo]
  );

  const transferStream = useCallback(async () => {
    if (!streamWrite || !state.activeStream) return;
    try {
      if (!transferTo || !ethers.utils.isAddress(transferTo)) throw new Error("Invalid new recipient");
      dispatch({ type: "SET_LOADING", payload: true });
      const tx = await streamWrite.transferStream(state.activeStream.streamId, transferTo);
      await tx.wait();
      setTransferTo("");
      await refreshActive();
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message || "Transfer failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [streamWrite, state.activeStream, transferTo, refreshActive]);

  /* ---------- Load on connect ---------- */
  useEffect(() => {
    if (state.connected) {
      loadTokenInfo();
      loadUserStreams();
    }
  }, [state.connected, loadTokenInfo, loadUserStreams]);

  /* ---------- Auto refresh with adjustable interval ---------- */
  useEffect(() => {
    if (!autoRefresh || !state.connected) return;
    
    const refreshData = async () => {
      try {
        if (state.activeStream) {
          const updated = await shapeStream(state.activeStream.streamId);
          if (updated) {
            dispatch({ type: "SET_ACTIVE_STREAM", payload: updated });
          }
        }
        // Refresh token info more frequently
        if (state.account) {
          loadTokenInfo();
        }
      } catch (e) {
        // Silent fail for auto-refresh to avoid spam
        console.warn("Auto-refresh failed:", e);
      }
    };
    
    // Refresh every 2 seconds when auto-refresh is on for more real-time updates
    const interval = setInterval(refreshData, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, state.connected, state.activeStream, state.account, shapeStream, loadTokenInfo]);

  /* ---------- UI helpers ---------- */
  const inputClass =
    "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const btn = "px-4 py-2 rounded-lg font-medium transition-colors";
  const btnPrimary = `${btn} bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed`;
  const btnSecondary = `${btn} bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100`;

  /* ================= RENDER ================= */
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Somnia Stream</h1>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
              Testnet
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button onClick={theme === "light" ? enableDark : enableLight} className={btnSecondary} title="Toggle theme">
              {theme === "light" ? "🌙" : "☀️"}
            </button>

            {state.connected ? (
              <div className="flex items-center space-x-3">
                <div className="text-sm">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {shortenAddress(state.account)}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {state.tokenInfo.balance} {state.tokenInfo.symbol}
                  </div>
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <button 
                  onClick={() => {
                    // Disconnect wallet
                    setWriteProvider(null);
                    setSigner(null);
                    dispatch({ type: "RESET" });
                    // Clear any cached data
                    setStreamCache(new Map());
                    // Optionally reload page for clean state
                    window.location.reload();
                  }}
                  className={`${btnSecondary} text-xs px-3 py-1`}
                  title="Disconnect wallet"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button onClick={connectWallet} disabled={state.loading} className={btnPrimary}>
                {state.loading ? <LoadingSpinner /> : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {state.error && (
          <ErrorAlert error={state.error} onClose={() => dispatch({ type: "SET_ERROR", payload: null })} />
        )}

        {state.connected ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Tabs */}
              <div className="flex space-x-1 bg-gray-200 dark:bg-gray-800 p-1 rounded-lg">
                {(["create", "manage", "sent", "received"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab
                        ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                      }`}
                  >
                    {tab === "sent" ? "Sent Streams" : tab === "received" ? "Received Streams" : tab}
                  </button>
                ))}
              </div>

              {/* Create */}
              {activeTab === "create" && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Create New Stream</h2>

                  {/* Faucet */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-blue-900 dark:text-blue-200">Need Test Tokens?</h3>
                      <button onClick={claimTokens} disabled={state.loading} className={btnPrimary}>
                        {state.loading ? <LoadingSpinner /> : "Claim 1000 TEST"}
                      </button>
                    </div>
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      Get free test tokens to try the streaming functionality.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Recipient Address
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={createForm.recipient}
                          onChange={(e) => setCreateForm((p) => ({ ...p, recipient: e.target.value }))}
                          placeholder="0x…"
                          className={inputClass}
                        />
                        <button
                          onClick={() => setCreateForm((p) => ({ ...p, recipient: state.account }))}
                          className={btnSecondary}
                        >
                          Self
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Amount ({state.tokenInfo.symbol})
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={createForm.amount}
                          onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
                          placeholder="1"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Duration (minutes)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={createForm.duration}
                          onChange={(e) => setCreateForm((p) => ({ ...p, duration: e.target.value }))}
                          placeholder="60"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Important notice about stream timing */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 mb-4">
                      <div className="flex items-start">
                        <span className="text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5">⚠️</span>
                        <div className="text-sm text-yellow-800 dark:text-yellow-200">
                          <div className="font-medium mb-1">Important:</div>
                          <div>Streams may take 3-5 minutes to activate after creation due to blockchain confirmation times. The withdrawable amount updates every few seconds once active.</div>
                        </div>
                      </div>
                    </div>

                    {/* Validation + Params */}
                    {(() => {
                      const p = streamParams;
                      if (!p) return null;
                      const issues: string[] = [];
                      
                      if (!createForm.recipient || !ethers.utils.isAddress(createForm.recipient)) {
                        issues.push("Invalid recipient address");
                      }
                      if (createForm.recipient && state.account && createForm.recipient.toLowerCase() === state.account.toLowerCase()) {
                        issues.push("Cannot stream to yourself");
                      }
                      if (p.rps.isZero()) {
                        issues.push("Amount too small for duration - rate per second would be zero");
                      }
                      if (p.durationSec < 60) {
                        issues.push("Duration must be at least 1 minute (60 seconds)");
                      }

                      const needsApproval = parseFloat(state.tokenInfo.allowance) < parseFloat(fmtUnits(p.depositAdjusted, state.tokenInfo.decimals));
                                                const hasInsufficientBalance = (() => {
                            const rawBalance = state.tokenInfo._rawBalance || state.tokenInfo.balance;
                            const numericBalance = parseFloat(rawBalance);
                            const requiredAmount = parseFloat(fmtUnits(p.depositAdjusted, state.tokenInfo.decimals));
                            return numericBalance < requiredAmount;
                          })();

                      return (
                        <div className="mt-3 space-y-2">
                          {issues.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-3">
                              <h4 className="text-sm font-medium text-red-900 dark:text-red-200 mb-1">
                                Issues to fix:
                              </h4>
                              <ul className="text-xs text-red-800 dark:text-red-300 space-y-1">
                                {issues.map((issue, i) => (
                                  <li key={i}>• {issue}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {hasInsufficientBalance && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-3">
                              <h4 className="text-sm font-medium text-red-900 dark:text-red-200 mb-1">
                                Insufficient Balance
                              </h4>
                              <p className="text-xs text-red-800 dark:text-red-300">
                                Need: {parseFloat(fmtUnits(p.depositAdjusted, state.tokenInfo.decimals)).toFixed(4)} {state.tokenInfo.symbol}
                                <br />
                                Have: {(() => {
                                  const rawBalance = state.tokenInfo._rawBalance || state.tokenInfo.balance;
                                  return parseFloat(rawBalance).toFixed(4);
                                })()} {state.tokenInfo.symbol}
                              </p>
                            </div>
                          )}

                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-200">
                            <div>Rate/sec: {parseFloat(p.human.rps).toFixed(8)} {state.tokenInfo.symbol}</div>
                            <div>Rate/min: {parseFloat(p.human.rpm).toFixed(6)} {state.tokenInfo.symbol}</div>
                            <div>Rate/hour: {parseFloat(p.human.rph).toFixed(4)} {state.tokenInfo.symbol}</div>
                            <div>Duration: {p.durationSec} seconds ({(p.durationSec / 60).toFixed(1)} minutes)</div>
                            <div>Actual deposit: {parseFloat(fmtUnits(p.depositAdjusted, state.tokenInfo.decimals)).toFixed(6)} {state.tokenInfo.symbol}</div>
                            {parseFloat(p.human.dust) > 0 && (
                              <div className="mt-1 text-amber-600 dark:text-amber-400">
                                Note: {parseFloat(p.human.dust).toFixed(6)} {state.tokenInfo.symbol} will be ignored to ensure deposit = rate × duration
                              </div>
                            )}
                            {needsApproval && (
                              <div className="mt-1 text-blue-600 dark:text-blue-400">
                                Note: Token approval will be required before creating the stream
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2">
                      <button
                        onClick={createStream}
                        disabled={
                          state.loading || 
                          !createForm.recipient || 
                          !createForm.amount || 
                          !createForm.duration || 
                          Number(createForm.duration || "0") < 1 ||
                          !streamParams ||
                          streamParams.rps.isZero()
                        }
                        className={`${btnPrimary} flex-1 flex items-center justify-center gap-2`}
                      >
                        {state.loading ? <LoadingSpinner /> : "Create Stream"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Manage */}
              {activeTab === "manage" && (
                <div className="space-y-6">
                  {/* Loader */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Load Stream</h2>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={streamIdInput}
                        onChange={(e) => setStreamIdInput(e.target.value)}
                        placeholder="Stream ID (e.g. 1, 2, 3...) or Tx Hash"
                        className={inputClass}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            loadStreamByInput();
                          }
                        }}
                      />
                      <button 
                        onClick={loadStreamByInput} 
                        disabled={!streamIdInput.trim() || state.loading} 
                        className={btnPrimary}
                      >
                        {state.loading ? <LoadingSpinner /> : "Load"}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Enter a stream ID number or transaction hash to load stream details
                    </p>
                  </div>

                  {/* Active Card */}
                  {state.activeStream && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                          Stream #{state.activeStream.streamId}
                        </h2>
                        <button
                          onClick={() => setAutoRefresh((v) => !v)}
                          className={`px-3 py-1 rounded-md text-xs ${autoRefresh
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                        >
                          {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                        </button>
                      </div>

                      {/* Info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Sender</div>
                          <div className="font-mono text-sm">{shortenAddress(state.activeStream.sender)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Recipient</div>
                          <div className="font-mono text-sm">{shortenAddress(state.activeStream.recipient)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Remaining</div>
                          <div className="font-medium">
                            {parseFloat(state.activeStream.remaining).toFixed(4)} {state.tokenInfo.symbol}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Withdrawable</div>
                          <div className="font-medium text-green-600">
                            {parseFloat(state.activeStream.withdrawable).toFixed(4)} {state.tokenInfo.symbol}
                          </div>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="mb-6">
                        <div className="flex justify-between text-sm mb-2">
                          <span>Progress (by tokens spent)</span>
                          <span>{state.activeStream.progress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, state.activeStream.progress))}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span>Spent: {(parseFloat(state.activeStream.deposit) - parseFloat(state.activeStream.remaining)).toFixed(4)} {state.tokenInfo.symbol}</span>
                          <span>Total: {state.activeStream.deposit} {state.tokenInfo.symbol}</span>
                        </div>
                      </div>

                      {/* Sender actions */}
                      {isUserSender && (
                        <div className="mb-6">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Sender Actions</h3>
                          <div className="flex flex-wrap gap-2">
                            {(() => {
                              // Check if stream is finished
                              const now = Math.floor(Date.now() / 1000);
                              const startTime = state.activeStream.startTime;
                              const rate = parseFloat(state.activeStream.ratePerSecond);
                              const deposit = parseFloat(state.activeStream.deposit);
                              
                              // Calculate when stream should end
                              const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
                              const calculatedEndTime = startTime + streamDuration;
                              
                              // Check multiple conditions for finished stream
                              const timeExpired = now >= calculatedEndTime;
                              const noTokensLeft = parseFloat(state.activeStream.remaining) <= 0;
                              const notActive = !state.activeStream.isActive;
                              const elapsedTime = now - startTime;
                              const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
                              
                              const isStreamFinished = timeExpired || noTokensLeft || notActive || durationExceeded;

                              if (isStreamFinished) {
                                return (
                                  <div className="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                                    Stream is completed ({elapsedTime > streamDuration ? 'time expired' : 'no tokens left'}) - no actions available
                                  </div>
                                );
                              }

                              return (
                                <>
                                  <button
                                    onClick={state.activeStream.paused ? resumeStream : pauseStream}
                                    disabled={state.loading}
                                    className={btnSecondary}
                                  >
                                    {state.loading ? <LoadingSpinner /> : (state.activeStream.paused ? "Resume" : "Pause")}
                                  </button>
                                  <button 
                                    onClick={cancelStream} 
                                    disabled={state.loading} 
                                    className="px-4 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                                  >
                                    {state.loading ? <LoadingSpinner /> : "Cancel Stream"}
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Recipient actions */}
                      {isUserRecipient && (
                        <div className="mb-6">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Recipient Actions</h3>
                          <div className="space-y-3">
                            {parseFloat(state.activeStream.withdrawable) > 0 ? (
                              <>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Withdraw Amount (Max: {parseFloat(state.activeStream.withdrawable).toFixed(6)} {state.tokenInfo.symbol})
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      step="0.000001"
                                      max={parseFloat(state.activeStream.withdrawable)}
                                      value={withdrawAmount}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const maxWithdrawable = parseFloat(state.activeStream.withdrawable);
                                        if (value === '' || parseFloat(value) <= maxWithdrawable) {
                                          setWithdrawAmount(value);
                                        }
                                      }}
                                      placeholder={`Max: ${parseFloat(state.activeStream.withdrawable).toFixed(6)}`}
                                      className={inputClass}
                                    />
                                    <button
                                      onClick={() => setWithdrawAmount(parseFloat(state.activeStream.withdrawable).toFixed(6))}
                                      className={btnSecondary}
                                      title="Set maximum withdrawable amount"
                                    >
                                      Max
                                    </button>
                                    <button
                                      onClick={() => withdrawFromStream(withdrawAmount)}
                                      disabled={state.loading || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                                      className={btnPrimary}
                                    >
                                      {state.loading ? <LoadingSpinner /> : "Withdraw"}
                                    </button>
                                  </div>
                                  {withdrawAmount && parseFloat(withdrawAmount) > parseFloat(state.activeStream.withdrawable) && (
                                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                      Amount exceeds maximum withdrawable ({parseFloat(state.activeStream.withdrawable).toFixed(6)} {state.tokenInfo.symbol})
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => withdrawFromStream()}
                                  disabled={state.loading}
                                  className={`w-full ${btnPrimary}`}
                                >
                                  {state.loading ? <LoadingSpinner /> : `Withdraw All Available (${parseFloat(state.activeStream.withdrawable).toFixed(6)} ${state.tokenInfo.symbol})`}
                                </button>
                              </>
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                                No tokens currently available to withdraw
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Transfer stream (sender) - only if stream is still active */}
                      {isUserSender && (
                        (() => {
                          const now = Math.floor(Date.now() / 1000);
                          const startTime = state.activeStream.startTime;
                          const rate = parseFloat(state.activeStream.ratePerSecond);
                          const deposit = parseFloat(state.activeStream.deposit);
                          
                          // Calculate when stream should end
                          const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
                          const calculatedEndTime = startTime + streamDuration;
                          
                          // Check multiple conditions for finished stream
                          const timeExpired = now >= calculatedEndTime;
                          const noTokensLeft = parseFloat(state.activeStream.remaining) <= 0;
                          const notActive = !state.activeStream.isActive;
                          const elapsedTime = now - startTime;
                          const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
                          
                          const isStreamFinished = timeExpired || noTokensLeft || notActive || durationExceeded;

                          if (isStreamFinished) {
                            return null; // Don't show transfer option for finished streams
                          }

                          return (
                            <div className="mb-6">
                              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Transfer Stream</h3>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={transferTo}
                                  onChange={(e) => setTransferTo(e.target.value)}
                                  placeholder="New recipient 0x…"
                                  className={inputClass}
                                />
                                <button 
                                  onClick={transferStream} 
                                  disabled={state.loading || !transferTo.trim()} 
                                  className={btnSecondary}
                                >
                                  {state.loading ? <LoadingSpinner /> : "Transfer"}
                                </button>
                              </div>
                            </div>
                          );
                        })()
                      )}

                      {/* Details */}
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Details</h3>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Deposit:</span>
                            <span>
                              {parseFloat(state.activeStream.deposit).toFixed(6)} {state.tokenInfo.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Rate/second:</span>
                            <span>
                              {parseFloat(state.activeStream.ratePerSecond).toFixed(8)} {state.tokenInfo.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Started:</span>
                            <span>{formatTime(state.activeStream.startTime)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Calculated End:</span>
                            <span>
                              {(() => {
                                const rate = parseFloat(state.activeStream.ratePerSecond);
                                const deposit = parseFloat(state.activeStream.deposit);
                                if (rate > 0) {
                                  const duration = Math.floor(deposit / rate);
                                  const calculatedEnd = state.activeStream.startTime + duration;
                                  return formatTime(calculatedEnd);
                                }
                                return "N/A";
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span>
                              {(() => {
                                const rate = parseFloat(state.activeStream.ratePerSecond);
                                const deposit = parseFloat(state.activeStream.deposit);
                                if (rate > 0) {
                                  const duration = Math.floor(deposit / rate);
                                  const hours = Math.floor(duration / 3600);
                                  const minutes = Math.floor((duration % 3600) / 60);
                                  const seconds = duration % 60;
                                  return `${hours}h ${minutes}m ${seconds}s`;
                                }
                                return "N/A";
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Elapsed Time:</span>
                            <span>
                              {(() => {
                                const now = Math.floor(Date.now() / 1000);
                                const elapsed = Math.max(0, now - state.activeStream.startTime);
                                const minutes = Math.floor(elapsed / 60);
                                const seconds = elapsed % 60;
                                return `${minutes}m ${seconds}s`;
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Should be Available:</span>
                            <span className="text-blue-600 dark:text-blue-400">
                              {(() => {
                                const now = Math.floor(Date.now() / 1000);
                                const elapsed = Math.max(0, now - state.activeStream.startTime);
                                const rate = parseFloat(state.activeStream.ratePerSecond);
                                const deposit = parseFloat(state.activeStream.deposit);
                                const maxDuration = deposit / rate;
                                const effectiveElapsed = Math.min(elapsed, maxDuration);
                                const shouldBeAvailable = effectiveElapsed * rate;
                                const withdrawn = parseFloat(state.activeStream.totalWithdrawn);
                                const net = Math.max(0, shouldBeAvailable - withdrawn);
                                return `${net.toFixed(6)} ${state.tokenInfo.symbol}`;
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Status:</span>
                            <span
                              className={`px-2 py-1 rounded text-xs ${(() => {
                                // Calculate if stream is finished for status display
                                const now = Math.floor(Date.now() / 1000);
                                const startTime = state.activeStream.startTime;
                                const rate = parseFloat(state.activeStream.ratePerSecond);
                                const deposit = parseFloat(state.activeStream.deposit);
                                
                                const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
                                const elapsedTime = now - startTime;
                                const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
                                const noTokensLeft = parseFloat(state.activeStream.remaining) <= 0;
                                const isStreamFinished = durationExceeded || noTokensLeft || !state.activeStream.isActive;
                                
                                if (state.activeStream.paused) {
                                  return "bg-yellow-100 text-yellow-800";
                                } else if (isStreamFinished) {
                                  return "bg-gray-100 text-gray-800";
                                } else {
                                  return "bg-green-100 text-green-800";
                                }
                              })()}`}
                            >
                              {(() => {
                                const now = Math.floor(Date.now() / 1000);
                                const startTime = state.activeStream.startTime;
                                const rate = parseFloat(state.activeStream.ratePerSecond);
                                const deposit = parseFloat(state.activeStream.deposit);
                                
                                const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
                                const elapsedTime = now - startTime;
                                const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
                                const noTokensLeft = parseFloat(state.activeStream.remaining) <= 0;
                                const isStreamFinished = durationExceeded || noTokensLeft || !state.activeStream.isActive;
                                
                                if (state.activeStream.paused) {
                                  return "Paused";
                                } else if (isStreamFinished) {
                                  return "Completed";
                                } else {
                                  return "Active";
                                }
                              })()}
                            </span>
                          </div>
                          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Contract vs Calculated:</div>
                            <div className="text-xs space-y-1">
                              <div>Contract Withdrawable: <span className="text-red-600">{parseFloat(state.activeStream.withdrawable).toFixed(8)} {state.tokenInfo.symbol}</span></div>
                              <div>Contract StopTime: <span className="text-red-600">{state.activeStream.stopTime === 0 ? "INVALID (0)" : formatTime(state.activeStream.stopTime)}</span></div>
                              <div>Total Withdrawn: {state.activeStream.totalWithdrawn} {state.tokenInfo.symbol}</div>
                              <div>Remaining Balance: {state.activeStream.remaining} {state.tokenInfo.symbol}</div>
                              <div>Stream Active: {state.activeStream.isActive ? 'Yes' : 'No'}</div>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <a
                              className={btnSecondary}
                              href={`${SOMNIA_EXPLORER}/address/${SOMNIA_STREAM}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Contract ↗
                            </a>
                            <a
                              className={btnSecondary}
                              href={`${SOMNIA_EXPLORER}/address/${state.activeStream.token}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Token ↗
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sent Streams */}
              {activeTab === "sent" && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Streams You Created</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Streams where you are the sender</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={loadUserStreams} disabled={state.loading} className={btnSecondary}>
                        {state.loading ? <LoadingSpinner /> : "Refresh"}
                      </button>
                      <button onClick={clearStreamCache} className={btnSecondary}>
                        Clear Cache
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const sentStreams = state.streams.filter(s => 
                      s.sender.toLowerCase() === state.account.toLowerCase()
                    );
                    
                    if (sentStreams.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <div className="text-4xl mb-2">📤</div>
                          <div>No streams created yet</div>
                          <div className="text-sm mt-1">Create your first stream in the "Create" tab</div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {sentStreams.map((s) => (
                          <StreamCard
                            key={s.streamId}
                            stream={s}
                            onSelect={(x) => {
                              dispatch({ type: "SET_ACTIVE_STREAM", payload: x });
                              setActiveTab("manage");
                            }}
                            isActive={state.activeStream?.streamId === s.streamId}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Received Streams */}
              {activeTab === "received" && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Streams You Receive</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Streams where you are the recipient</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={loadUserStreams} disabled={state.loading} className={btnSecondary}>
                        {state.loading ? <LoadingSpinner /> : "Refresh"}
                      </button>
                      <button onClick={clearStreamCache} className={btnSecondary}>
                        Clear Cache
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const receivedStreams = state.streams.filter(s => 
                      s.recipient.toLowerCase() === state.account.toLowerCase()
                    );
                    
                    if (receivedStreams.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <div className="text-4xl mb-2">📥</div>
                          <div>No streams received yet</div>
                          <div className="text-sm mt-1">Ask someone to create a stream to your address</div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {receivedStreams.map((s) => (
                          <StreamCard
                            key={s.streamId}
                            stream={s}
                            onSelect={(x) => {
                              dispatch({ type: "SET_ACTIVE_STREAM", payload: x });
                              setActiveTab("manage");
                            }}
                            isActive={state.activeStream?.streamId === s.streamId}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Right Panel */}
            <div className="space-y-6">
              {/* Account overview with better formatting */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Account Overview</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Balance:</span>
                    <span className="font-medium">
                      {(() => {
                        const balance = state.tokenInfo.balance;
                        if (balance.includes('K') || balance.includes('M') || balance.includes('B') || balance.includes('T')) {
                          return balance;
                        }
                        return Number(parseFloat(balance)).toString();
                      })()} {state.tokenInfo.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Allowance:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {state.tokenInfo.allowance}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                    Note: Allowance is the amount pre-approved for the contract to spend
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total Streams:</span>
                    <span className="font-medium">{state.streams.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Active Streams:</span>
                    <span className="font-medium text-green-600">
                      {(() => {
                        const now = Math.floor(Date.now() / 1000);
                        return state.streams.filter((s) => {
                          const rate = parseFloat(s.ratePerSecond);
                          const deposit = parseFloat(s.deposit);
                          const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
                          const elapsedTime = now - s.startTime;
                          const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
                          const noTokensLeft = parseFloat(s.remaining) <= 0;
                          const isStreamFinished = durationExceeded || noTokensLeft || !s.isActive;
                          
                          return !s.paused && !isStreamFinished;
                        }).length;
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Paused Streams:</span>
                    <span className="font-medium text-yellow-600">
                      {state.streams.filter((s) => s.paused).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Completed Streams:</span>
                    <span className="font-medium text-gray-600">
                      {(() => {
                        const now = Math.floor(Date.now() / 1000);
                        return state.streams.filter((s) => {
                          const rate = parseFloat(s.ratePerSecond);
                          const deposit = parseFloat(s.deposit);
                          const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
                          const elapsedTime = now - s.startTime;
                          const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;
                          const noTokensLeft = parseFloat(s.remaining) <= 0;
                          const isStreamFinished = durationExceeded || noTokensLeft || !s.isActive;
                          
                          return isStreamFinished && !s.paused;
                        }).length;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Links</h3>
                <div className="space-y-3">
                  <a
                    href={`${SOMNIA_EXPLORER}/address/${SOMNIA_STREAM}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${btnSecondary} block text-center`}
                  >
                    View Stream Contract
                  </a>
                  <a
                    href={`${SOMNIA_EXPLORER}/address/${TEST_TOKEN}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${btnSecondary} block text-center`}
                  >
                    View Token
                  </a>
                </div>
              </div>

              {/* Network */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Network</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Chain ID:</span>
                    <span>{state.chainId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Network:</span>
                    <span>Somnia Testnet</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className="text-green-600">Connected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Disconnected */
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4">🔌</div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Connect Your Wallet</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Connect your wallet to start creating and managing payment streams on Somnia.
              </p>
              <button onClick={connectWallet} disabled={state.loading} className={`${btnPrimary} text-lg px-8 py-3`}>
                {state.loading ? <LoadingSpinner /> : "Connect Wallet"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}