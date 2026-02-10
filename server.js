import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import nacl from 'https://esm.sh/tweetnacl@1.0.3';
import bs58 from 'https://esm.sh/bs58@5.0.0';

// ==========================================
// 1. THEME
// ==========================================
const THEME = {
  bg: '#030303',
  glass: 'rgba(20, 20, 25, 0.6)',
  glassHover: 'rgba(30, 30, 40, 0.8)',
  border: 'rgba(255, 255, 255, 0.08)',
  primary: '#00f0ff',
  secondary: '#7000ff',
  success: '#00ff9d',
  error: '#ff2a6d',
  text: '#ffffff',
  textDim: '#888899',
  fontMono: '"JetBrains Mono", "Fira Code", monospace',
  fontSans: '"Inter", -apple-system, sans-serif',
};

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

    body {
      background-color: ${THEME.bg};
      background-image:
        radial-gradient(circle at 15% 15%, rgba(112, 0, 255, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 85% 85%, rgba(0, 240, 255, 0.05) 0%, transparent 40%);
      margin: 0;
      font-family: ${THEME.fontSans};
      color: ${THEME.text};
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    * { box-sizing: border-box; outline: none; }
    a { text-decoration: none; color: inherit; transition: color 0.2s; }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: ${THEME.primary}; }

    .glass-panel {
      background: ${THEME.glass};
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid ${THEME.border};
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .glass-input {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid ${THEME.border};
      color: white;
      font-family: ${THEME.fontMono};
      transition: all 0.3s ease;
    }
    .glass-input:focus {
      border-color: ${THEME.primary};
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.15);
    }

    .card-hover { transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease; }
    .card-hover:hover {
      transform: translateY(-2px);
      border-color: rgba(0, 240, 255, 0.3);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 240, 255, 0.05);
    }

    .btn-primary {
      background: linear-gradient(135deg, rgba(0, 240, 255, 0.1), rgba(112, 0, 255, 0.1));
      border: 1px solid ${THEME.border};
      color: ${THEME.primary};
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(112, 0, 255, 0.2));
      border-color: ${THEME.primary};
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.2);
      text-shadow: 0 0 8px ${THEME.primary};
    }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }

    .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

    .social-icon { fill: ${THEME.textDim}; transition: all 0.2s ease-out; cursor: pointer; }
    .social-icon:hover {
      fill: ${THEME.primary};
      transform: scale(1.15);
      filter: drop-shadow(0 0 4px ${THEME.primary}) drop-shadow(0 0 10px ${THEME.primary});
    }
  `}</style>
);

// --- Icons ---
const Icons = {
  X: () => (
    <svg className="social-icon" width="20" height="20" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  Telegram: () => (
    <svg className="social-icon" width="20" height="20" viewBox="0 0 24 24">
      <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
    </svg>
  ),
  Discord: () => (
    <svg className="social-icon" width="20" height="20" viewBox="0 0 24 24">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.118.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.64 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.9 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={THEME.success} strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Lock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={THEME.textDim} strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  LogOut: () => (
    <svg className="social-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

// ==========================================
// 2) CONFIG
// ==========================================
const CONFIG = {
  telegramBotName: "sanamesolbot",
  backendUrl: (import.meta as any).env?.VITE_BACKEND_URL || "https://sanamesolbot-backend-1.onrender.com",
  heliusApiKey: "88b636d4-ece3-452e-bd1c-aebfecdced19",
  rpcUrl: "https://mainnet.helius-rpc.com/?api-key=88b636d4-ece3-452e-bd1c-aebfecdced19",
  pollBalanceMs: 60_000,
  limits: { free: 2, premium: 20 }
};

const SOCIAL = {
  x: "https://x.com/watchsola",
  telegram: "https://t.me/+ipHwV-4m_qk3MjI0",
  discord: "https://discord.gg/uW6uM56g"
};

interface UserSettings {
  telegramChatId: string;
  privacyMode: boolean;
}

interface WalletAlertConfig {
  incomingSol: boolean;
  outgoingSol: boolean;
  nftMint: boolean;
}

interface WalletData {
  address: string;
  balance: number | null;
  isLoading: boolean;
  alerts: WalletAlertConfig;
}

interface NotificationLog {
  id: string;
  time: number;
  message: string;
  type: 'info' | 'success' | 'alert';
}

// ==========================================
// 3) API client (backend)
// ==========================================
async function apiPost(path: string, body: any) {
  const url = `${CONFIG.backendUrl}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

async function apiGet(path: string) {
  const url = `${CONFIG.backendUrl}${path}`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

const BackendService = {
  // ✅ end-to-end: salva chatId + invia messaggio Telegram
  async activate(chatId: string) {
    return apiPost("/api/activate", { chatId });
  },
  async addWallet(chatId: string, wallet: string) {
    return apiPost("/api/add-wallet", { chatId, wallet });
  },
  async removeWallet(chatId: string, wallet: string) {
    return apiPost("/api/remove-wallet", { chatId, wallet });
  },
  async listWallets(chatId: string) {
    return apiGet(`/api/list-wallets?chatId=${encodeURIComponent(chatId)}`);
  },
  async testNotify(chatId: string, text: string) {
    return apiPost("/notify", { chatId, text });
  }
};

// ==========================================
// 4) Helius balance (solo UI)
// ==========================================
const HeliusUi = {
  async getBalance(address: string): Promise<number | null> {
    try {
      const response = await fetch(CONFIG.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'get-bal', method: 'getBalance', params: [address] })
      });
      const data = await response.json();
      const v = (data.result?.value || 0) / 1_000_000_000;
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }
};

// ==========================================
// 5) UI styles
// ==========================================
const styles: any = {
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0 clamp(16px, 4vw, 40px)', height: '80px', position: 'sticky', top: 0, zIndex: 100,
  },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px',
    padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  btnMain: {
    background: 'transparent', border: `1px solid ${THEME.primary}`, color: THEME.primary,
    padding: '10px 24px', borderRadius: '4px', cursor: 'pointer', fontFamily: THEME.fontMono,
    fontWeight: 700, fontSize: '12px', letterSpacing: '1px', transition: 'all 0.2s', textTransform: 'uppercase'
  },
  userBadge: {
    display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)',
    padding: '8px 16px', borderRadius: '20px', border: `1px solid ${THEME.border}`,
    fontSize: '12px', fontFamily: THEME.fontMono, color: THEME.text
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  modal: {
    width: '420px', maxWidth: '92%', padding: '30px', background: '#050505',
    border: `1px solid ${THEME.border}`, borderRadius: '16px', position: 'relative'
  },
  input: {
    width: '100%', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${THEME.border}`,
    background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '14px'
  },
  btnSmall: {
    background: THEME.glassHover, border: `1px solid ${THEME.border}`, color: '#fff',
    padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px'
  },
  container: {
    maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', minHeight: 'calc(100vh - 80px)'
  },
  dashHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', gap: '20px'
  },
  notifLog: {
    width: '350px', height: '160px', overflowY: 'auto', padding: '15px',
    background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: `1px solid ${THEME.border}`
  },
  hero: {
    padding: '90px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
  },
  featureItem: {
    padding: '10px 20px', borderRadius: '30px', background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${THEME.border}`, fontSize: '13px', fontFamily: THEME.fontMono, color: THEME.textDim
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '30px'
  },
  card: {
    padding: '30px', borderRadius: '16px', position: 'relative'
  },
  closeBtn: {
    background: 'transparent', border: 'none', color: THEME.textDim, cursor: 'pointer', padding: '5px'
  },
  divider: {
    height: '1px', background: `linear-gradient(90deg, transparent, ${THEME.border}, transparent)`, margin: '20px 0'
  }
};

// ==========================================
// 6) APP
// ==========================================
const App = () => {
  const [provider, setProvider] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [settings, setSettings] = useState<UserSettings>({ telegramChatId: "", privacyMode: false });
  const [watchedWallets, setWatchedWallets] = useState<WalletData[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [inputAddress, setInputAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const walletsRef = useRef<WalletData[]>([]);
  useEffect(() => { walletsRef.current = watchedWallets; }, [watchedWallets]);

  const addNotification = (msg: string, type: NotificationLog['type']) => {
    setNotifications(prev => [
      { id: Math.random().toString(36), time: Date.now(), message: msg, type },
      ...prev
    ].slice(0, 10));
  };

  // load local + phantom + load wallets from backend if chatId exists
  useEffect(() => {
    const saved = localStorage.getItem('solwatcher_data');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.settings) setSettings(data.settings);
    }

    if ('solana' in window) {
      const sol = (window as any).solana;
      if (sol?.isPhantom) setProvider(sol);
    }
  }, []);

  // persist local
  useEffect(() => {
    const dataToSave = { settings };
    localStorage.setItem('solwatcher_data', JSON.stringify(dataToSave));
  }, [settings]);

  // whenever chatId changes: load wallets list from backend
  useEffect(() => {
    const cid = settings.telegramChatId?.trim();
    if (!cid) {
      setWatchedWallets([]);
      return;
    }

    (async () => {
      try {
        const res = await BackendService.listWallets(cid);
        const wallets: string[] = res.wallets || [];
        setWatchedWallets(wallets.map(w => ({
          address: w,
          balance: null,
          isLoading: true,
          alerts: { incomingSol: true, outgoingSol: true, nftMint: true }
        })));
        addNotification("Wallet caricati dal backend ✅", "success");
      } catch (e: any) {
        console.error(e);
        addNotification("Errore caricando wallet dal backend", "alert");
      }
    })();
  }, [settings.telegramChatId]);

  // Poll UI balances
  useEffect(() => {
    let timer: any = null;
    let cancelled = false;

    const loop = async () => {
      try {
        const cur = walletsRef.current;
        if (!cur.length) {
          timer = setTimeout(loop, CONFIG.pollBalanceMs);
          return;
        }

        const results = await Promise.all(cur.map(async (w) => {
          const bal = await HeliusUi.getBalance(w.address);
          return { ...w, balance: bal, isLoading: false };
        }));

        if (!cancelled) setWatchedWallets(results);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) timer = setTimeout(loop, CONFIG.pollBalanceMs);
      }
    };

    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Wallet auth (Phantom)
  const connect = async () => {
    if (!provider) return window.open('https://phantom.app', '_blank');
    try {
      const resp = await provider.connect();
      setWalletAddress(resp.publicKey.toString());
    } catch (e) { console.error(e); }
  };

  const login = async () => {
    if (!provider || !walletAddress) return;
    setLoading(true);
    try {
      const msg = new TextEncoder().encode(`Login WatchSol: ${Date.now()}`);
      const signed = await provider.signMessage(msg, "utf8");
      const verified = nacl.sign.detached.verify(msg, signed.signature, bs58.decode(walletAddress));
      if (verified) {
        setIsAuthenticated(true);
        addNotification(`Login OK: ${walletAddress.slice(0, 4)}...`, 'success');
      } else {
        addNotification("Login failed", 'alert');
      }
    } catch {
      addNotification("Login failed", 'alert');
    }
    setLoading(false);
  };

  const disconnect = async () => {
    if (provider) {
      try { await provider.disconnect(); } catch (e) { console.error(e); }
    }
    setWalletAddress(null);
    setIsAuthenticated(false);
    addNotification("Wallet disconnected", 'info');
  };

  // Add wallet
  const addWallet = async () => {
    const cid = settings.telegramChatId?.trim();
    if (!cid) return addNotification("Prima collega Telegram (⚙️) e salva chat_id", "alert");
    if (!inputAddress.trim()) return;

    setLoading(true);
    try {
      const res = await BackendService.addWallet(cid, inputAddress.trim());
      const wallets: string[] = res.wallets || [];
      setWatchedWallets(wallets.map(w => ({
        address: w,
        balance: null,
        isLoading: true,
        alerts: { incomingSol: true, outgoingSol: true, nftMint: true }
      })));
      setInputAddress('');
      addNotification("Wallet salvato nel backend ✅", "success");
    } catch (e: any) {
      console.error(e);
      addNotification(e?.message || "Errore aggiungendo wallet", "alert");
    }
    setLoading(false);
  };

  // Remove wallet
  const removeWallet = async (addr: string) => {
    const cid = settings.telegramChatId?.trim();
    if (!cid) return;

    try {
      const res = await BackendService.removeWallet(cid, addr);
      const wallets: string[] = res.wallets || [];
      setWatchedWallets(wallets.map(w => ({
        address: w,
        balance: null,
        isLoading: true,
        alerts: { incomingSol: true, outgoingSol: true, nftMint: true }
      })));
      addNotification("Wallet rimosso ✅", "info");
    } catch (e: any) {
      console.error(e);
      addNotification(e?.message || "Errore rimuovendo wallet", "alert");
    }
  };

  const Nav = () => (
    <nav style={styles.nav} className="glass-panel">
      <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start', lineHeight:1}}>
          <div style={{
            fontFamily: THEME.fontMono,
            fontSize: 'clamp(24px, 6vw, 32px)',
            fontWeight: 900,
            letterSpacing: '-2px',
            color: '#fff',
            textShadow: '0 0 20px rgba(0, 240, 255, 0.2)'
          }}>
            WATCH<span style={{
              color: 'transparent',
              background: `linear-gradient(to right, ${THEME.primary}, ${THEME.secondary})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              filter: `drop-shadow(0 0 10px ${THEME.primary}) drop-shadow(0 0 25px ${THEME.secondary})`
            }}>SOL</span>
          </div>
          <div style={{fontSize: '10px', color: THEME.textDim, letterSpacing: '3px', marginTop:'5px', fontWeight: 600, opacity:0.8}}>
            WATCHSOL.COM
          </div>
        </div>
      </div>

      <div style={{display:'flex', gap:'20px', alignItems:'center'}}>
        <div style={{display:'flex', gap:'15px', paddingRight:'15px', borderRight:`1px solid ${THEME.border}`}}>
          <a href={SOCIAL.x} target="_blank" rel="noreferrer"><Icons.X /></a>
          <a href={SOCIAL.telegram} target="_blank" rel="noreferrer"><Icons.Telegram /></a>
          <a href={SOCIAL.discord} target="_blank" rel="noreferrer"><Icons.Discord /></a>
        </div>

        {isAuthenticated && (
          <>
            <button
              style={styles.iconBtn}
              onClick={() => setSettings(s => ({...s, privacyMode: !s.privacyMode}))}
              title="Privacy Mode"
            >
              {settings.privacyMode ? '🙈' : '👁️'}
            </button>
            <button style={styles.iconBtn} onClick={() => setShowSettingsModal(true)} title="Settings">⚙️</button>
          </>
        )}

        {!isAuthenticated ? (
          !walletAddress ? (
            <button onClick={connect} style={styles.btnMain}>Connect Wallet</button>
          ) : (
            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
              <button onClick={login} disabled={loading} style={styles.btnMain}>{loading ? 'Signing...' : 'Sign to Login'}</button>
              <button onClick={disconnect} style={{...styles.iconBtn, width:'36px', height:'36px', border:`1px solid ${THEME.border}`, borderRadius:'4px'}} title="Disconnect">
                ✕
              </button>
            </div>
          )
        ) : (
          <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
            <div style={styles.userBadge}>
              <div style={{
                width:8, height:8, borderRadius:'50%',
                background: THEME.success,
                boxShadow:`0 0 10px ${THEME.success}`
              }}/>
              <span>{walletAddress?.slice(0,4)}...</span>
            </div>

            <button
              onClick={disconnect}
              style={{...styles.iconBtn, width:'36px', height:'36px', border:`1px solid ${THEME.border}`, borderRadius:'4px', color:THEME.textDim}}
              title="Disconnect"
            >
              <Icons.LogOut />
            </button>
          </div>
        )}
      </div>
    </nav>
  );

  const SettingsModal = () => {
    const [tempId, setTempId] = useState(settings.telegramChatId || "");
    const [busy, setBusy] = useState(false);

    // ✅ feedback visibile in modale
    const [uiMsg, setUiMsg] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

    const handleActivate = async () => {
      const cid = tempId.trim();
      if (!cid) return;

      setBusy(true);
      setUiMsg({ type: "info", text: "Connecting…" });

      try {
        console.log("ACTIVATE ->", CONFIG.backendUrl, cid);

        const res = await BackendService.activate(cid);

        setSettings(s => ({ ...s, telegramChatId: cid }));
        addNotification("Telegram collegato ✅", "success");

        if (res?.telegramOk === false) {
          setUiMsg({ type: "err", text: "Salvato, ma Telegram non ha inviato. Controlla BOT_TOKEN / chat_id." });
        } else {
          setUiMsg({ type: "ok", text: "✅ Telegram collegato! Messaggio di conferma inviato." });
        }
      } catch (e: any) {
        console.error(e);
        setUiMsg({ type: "err", text: e?.message || "Errore collegando Telegram" });
        addNotification(e?.message || "Errore collegando Telegram", "alert");
      }

      setBusy(false);
    };

    const handleDisconnectTg = () => {
      setSettings(s => ({ ...s, telegramChatId: "" }));
      setTempId("");
      setUiMsg(null);
      addNotification("Telegram scollegato", "info");
    };

    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modal} className="glass-panel animate-fade-in">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
            <h3 style={{margin:0, color: THEME.primary, letterSpacing:'-0.5px'}}>TELEGRAM</h3>
            <button onClick={() => setShowSettingsModal(false)} style={styles.closeBtn}>✕</button>
          </div>

          <div style={{textAlign:'center'}}>
            <div style={{
              width:'60px', height:'60px', borderRadius:'50%',
              background: settings.telegramChatId ? 'rgba(0, 255, 157, 0.1)' : 'rgba(0, 240, 255, 0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px auto',
              border: `1px solid ${settings.telegramChatId ? THEME.success : THEME.primary}`
            }}>
              <Icons.Telegram />
            </div>

            {!settings.telegramChatId ? (
              <>
                <p style={{color: THEME.textDim, fontSize:'13px', lineHeight:'1.5', margin:'0 0 14px 0'}}>
                  1) Apri il bot e premi <b>Start</b><br/>
                  2) Il bot ti risponde con il <b>chat_id</b><br/>
                  3) Incollalo qui e premi <b>ACTIVATE</b>
                </p>

                <button
                  style={{...styles.btnMain, width:'100%', padding:'12px', marginBottom:'12px', fontSize:'12px'}}
                  onClick={() => window.open(`https://t.me/${CONFIG.telegramBotName}?start=connect`, '_blank')}
                >
                  OPEN BOT ↗
                </button>

                <div style={{display:'flex', gap:'10px'}}>
                  <input
                    style={styles.input}
                    className="glass-input"
                    placeholder="Paste chat_id (es: 7395949949)"
                    value={tempId}
                    onChange={(e) => setTempId(e.target.value)}
                  />
                  <button onClick={handleActivate} style={styles.btnSmall} disabled={!tempId.trim() || busy}>
                    {busy ? "..." : "ACTIVATE"}
                  </button>
                </div>

                {uiMsg && (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    border: `1px solid ${uiMsg.type === "ok" ? THEME.success : uiMsg.type === "err" ? THEME.error : THEME.border}`,
                    color: uiMsg.type === "ok" ? THEME.success : uiMsg.type === "err" ? THEME.error : THEME.textDim,
                    background: "rgba(0,0,0,0.25)",
                    textAlign: "left"
                  }}>
                    {uiMsg.text}
                  </div>
                )}

                <div style={{marginTop: 12}}>
                  <button
                    style={{...styles.btnMain, width:'100%', padding:'10px', fontSize:'11px', opacity: tempId.trim() ? 1 : 0.5}}
                    disabled={!tempId.trim()}
                    onClick={async () => {
                      try {
                        await BackendService.testNotify(tempId.trim(), "✅ TEST FROM APP (via backend)");
                        addNotification("Test inviato ✅", "success");
                        setUiMsg({ type: "ok", text: "✅ Test inviato. Controlla Telegram." });
                      } catch (e: any) {
                        setUiMsg({ type: "err", text: e?.message || "Test fallito" });
                        addNotification(e?.message || "Test fallito", "alert");
                      }
                    }}
                  >
                    TEST TELEGRAM
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{color: THEME.textDim, fontSize:'13px', lineHeight:'1.5', margin:'0 0 16px 0'}}>
                  Collegato a:<br/>
                  <code style={{background:'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:'4px'}}>
                    {settings.telegramChatId}
                  </code>
                </p>

                <button
                  style={{...styles.btnMain, width:'100%', padding:'12px', fontSize:'12px', borderColor: THEME.error, color: THEME.error, display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}
                  onClick={handleDisconnectTg}
                >
                  <Icons.Trash /> DISCONNECT
                </button>

                <div style={{marginTop: 12}}>
                  <button
                    style={{...styles.btnMain, width:'100%', padding:'10px', fontSize:'11px'}}
                    onClick={async () => {
                      try {
                        await BackendService.testNotify(settings.telegramChatId, "✅ TEST FROM APP (via backend)");
                        addNotification("Test inviato ✅", "success");
                        setUiMsg({ type: "ok", text: "✅ Test inviato. Controlla Telegram." });
                      } catch (e: any) {
                        setUiMsg({ type: "err", text: e?.message || "Test fallito" });
                        addNotification(e?.message || "Test fallito", "alert");
                      }
                    }}
                  >
                    TEST TELEGRAM
                  </button>
                </div>

                {uiMsg && (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    border: `1px solid ${uiMsg.type === "ok" ? THEME.success : uiMsg.type === "err" ? THEME.error : THEME.border}`,
                    color: uiMsg.type === "ok" ? THEME.success : uiMsg.type === "err" ? THEME.error : THEME.textDim,
                    background: "rgba(0,0,0,0.25)",
                    textAlign: "left"
                  }}>
                    {uiMsg.text}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <GlobalStyles />
      <Nav />
      {showSettingsModal && <SettingsModal />}

      <main style={styles.container}>
        {isAuthenticated && (
          <div style={styles.dashHeader} className="animate-fade-in">
            <div>
              <h1 style={{fontSize:'2.2rem', margin:0, letterSpacing:'-2px', fontWeight:800}}>DASHBOARD</h1>
              <p style={{margin:'6px 0 0 0', color: THEME.textDim, fontFamily: THEME.fontMono, fontSize:'12px'}}>
                CHAT_ID: <span style={{color:THEME.primary}}>{settings.telegramChatId ? "SET" : "NOT SET"}</span>
              </p>
              <p style={{margin:'6px 0 0 0', color: THEME.textDim, fontFamily: THEME.fontMono, fontSize:'12px'}}>
                WATCHED: <span style={{color:THEME.primary}}>{watchedWallets.length}</span>
              </p>
            </div>

            <div style={styles.notifLog} className="glass-panel">
              <div style={{fontSize:'10px', color:THEME.textDim, marginBottom:'8px', letterSpacing:'1px', fontWeight:600}}>STATUS</div>
              {notifications.length === 0 ? (
                <span style={{color:THEME.textDim, fontSize:'12px', fontStyle:'italic'}}>Ready…</span>
              ) : (
                notifications.map(n => (
                  <div key={n.id} style={{fontSize:'12px', marginBottom:'10px', borderBottom: `1px solid ${THEME.border}`, paddingBottom:'8px'}}>
                    <div style={{color:'#eee'}}>{n.message}</div>
                    <div style={{fontSize:'10px', color:THEME.textDim}}>{new Date(n.time).toLocaleTimeString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {!isAuthenticated ? (
          <div style={styles.hero} className="animate-fade-in">
            <div style={{marginBottom:'20px', padding:'5px 15px', borderRadius:'20px', border:`1px solid ${THEME.secondary}`, color:THEME.secondary, fontSize:'11px', fontWeight:700, letterSpacing:'1px'}}>
              WEB3 WATCHDOG
            </div>
            <h1 style={{fontSize:'4rem', margin:'0', lineHeight:'1.1', fontWeight:800, letterSpacing:'-3px'}}>
              THE EYE OF <span style={{background:`linear-gradient(to right, ${THEME.primary}, ${THEME.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>SOLANA</span>
            </h1>
            <p style={{maxWidth:'600px', lineHeight:'1.8', color: THEME.textDim, fontSize:'18px', marginTop:'20px'}}>
              Wallet monitor H24 sul backend + alert Telegram.
            </p>
            <div style={{display:'flex', gap:'20px', marginTop:'35px'}}>
              <div style={styles.featureItem}>🔒 Wallet Auth</div>
              <div style={styles.featureItem}>🛰️ Backend H24</div>
              <div style={styles.featureItem}>📱 Telegram Alerts</div>
            </div>
            <button onClick={connect} style={{...styles.btnMain, marginTop:'40px', padding:'15px 40px', fontSize:'16px'}}>
              LAUNCH APP
            </button>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div style={{display:'flex', gap:'15px', marginBottom:'28px', maxWidth:'700px'}}>
              <input
                style={{...styles.input, padding:'15px 20px'}}
                className="glass-input"
                placeholder="Paste Solana Address..."
                value={inputAddress}
                onChange={(e) => setInputAddress(e.target.value)}
                disabled={loading}
              />
              <button style={{...styles.btnMain, padding:'0 30px'}} disabled={loading} onClick={addWallet}>
                {loading ? 'SAVING...' : 'TRACK'}
              </button>
            </div>

            {watchedWallets.length === 0 ? (
              <div style={{textAlign:'center', padding:'80px', color:THEME.textDim, border:`1px dashed ${THEME.border}`, borderRadius:'12px', background: 'rgba(255,255,255,0.01)'}}>
                <h3 style={{color:'#fff', marginTop:0}}>Nessun wallet salvato</h3>
                <p>Collega Telegram (⚙️), poi TRACK.</p>
              </div>
            ) : (
              <div style={styles.grid}>
                {watchedWallets.map(w => (
                  <div key={w.address} style={styles.card} className="glass-panel card-hover">
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px', alignItems:'center'}}>
                      <div style={{fontSize:'10px', color: THEME.primary, letterSpacing:'1px', fontWeight:700}}>WATCHING (H24 BACKEND)</div>
                      <button style={styles.closeBtn} onClick={() => removeWallet(w.address)}>✕</button>
                    </div>

                    <div style={{fontFamily: THEME.fontMono, fontSize:'13px', marginBottom:'10px', wordBreak:'break-all', opacity:0.8}}>
                      {settings.privacyMode ? `${w.address.slice(0,4)}...${w.address.slice(-4)}` : w.address}
                    </div>

                    <div style={{fontSize:'32px', fontWeight:800, color: '#fff', marginBottom:'10px', letterSpacing:'-1px'}}>
                      {w.isLoading ? '...' : (w.balance === null ? 'N/A' : w.balance.toFixed(4))}{' '}
                      <span style={{fontSize:'14px', color:THEME.textDim, fontWeight:400}}>SOL</span>
                    </div>

                    <div style={{marginTop:'8px', color:THEME.textDim, fontSize:'12px'}}>
                      Notifiche: Telegram (backend) ✅
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
