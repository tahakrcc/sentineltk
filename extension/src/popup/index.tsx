import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TabState, ScoreFactor } from '../shared/types';

const Popup: React.FC = () => {
    const [tabState, setTabState] = useState<TabState | null>(null);
    const [loading, setLoading] = useState(true);
    const [reported, setReported] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [showReportForm, setShowReportForm] = useState(false);
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (!tabId) { setLoading(false); return; }

            chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', tabId }, (response) => {
                if (response?.data) setTabState(response.data);
                setLoading(false);
            });
        });
    }, []);

    const handleReport = () => {
        if (!tabState || !reportReason) return;
        chrome.runtime.sendMessage({
            type: 'REPORT_SITE',
            domain: tabState.hostname,
            reason: reportReason,
        });
        setReported(true);
        setShowReportForm(false);
    };

    const handleWhitelist = () => {
        if (!tabState) return;
        chrome.runtime.sendMessage({ type: 'ADD_WHITELIST', domain: tabState.hostname });
        setTabState({ ...tabState, score: { ...tabState.score!, score: 0, level: 'safe', factors: [{ signal: 'whitelisted', weight: 0, description: 'Kullanıcı beyaz listesinde' }], timestamp: Date.now() } });
    };

    const handleOverride = () => {
        if (!tabState) return;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (tabId) {
                chrome.runtime.sendMessage({ type: 'USER_OVERRIDE', tabId });
                setTabState({ ...tabState, userOverride: true });
            }
        });
    };

    const getScoreColor = (score: number) => {
        if (score <= 39) return '#22c55e';
        if (score <= 69) return '#f59e0b';
        return '#ef4444';
    };

    const getScoreGradient = (score: number) => {
        if (score <= 39) return 'linear-gradient(135deg, #22c55e, #16a34a)';
        if (score <= 69) return 'linear-gradient(135deg, #f59e0b, #d97706)';
        return 'linear-gradient(135deg, #ef4444, #dc2626)';
    };

    const getLevelText = (level: string) => {
        switch (level) {
            case 'safe': return '✅ Güvenli';
            case 'suspicious': return '⚠️ Şüpheli';
            case 'danger': return '🚨 Tehlikeli';
            default: return '❓ Bilinmiyor';
        }
    };

    const getLevelDesc = (level: string) => {
        switch (level) {
            case 'safe': return 'Bu site güvenli görünüyor.';
            case 'suspicious': return 'Bu site şüpheli işaretler taşıyor. Kişisel bilgilerinizi paylaşırken dikkatli olun.';
            case 'danger': return 'Bu site yüksek risk taşıyor! Kişisel bilgilerinizi kesinlikle paylaşmayın.';
            default: return '';
        }
    };

    const getFactorIcon = (signal: string) => {
        if (signal.includes('trusted') || signal.includes('whitelist')) return '🟢';
        if (signal.includes('typosquat') || signal.includes('homograph')) return '🔤';
        if (signal.includes('subdomain')) return '🌐';
        if (signal.includes('keyword')) return '🔍';
        if (signal.includes('badge')) return '🏷️';
        if (signal.includes('urgency')) return '⏰';
        if (signal.includes('countdown')) return '⏳';
        if (signal.includes('sensitive') || signal.includes('cc') || signal.includes('id')) return '💳';
        if (signal.includes('redirect')) return '↩️';
        if (signal.includes('contact') || signal.includes('email')) return '📧';
        if (signal.includes('right_click') || signal.includes('paste') || signal.includes('scroll')) return '🚫';
        if (signal.includes('focus') || signal.includes('popup')) return '⚠️';
        if (signal.includes('hosting')) return '🏠';
        if (signal.includes('backend') || signal.includes('reputation')) return '🌍';
        if (signal.includes('frequent') || signal.includes('visit')) return '🔄';
        if (signal.includes('tr_tld')) return '🇹🇷';
        if (signal.includes('country')) return '🗺️';
        return '📌';
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.spinner}></div>
                    <p style={styles.loadingText}>Analiz ediliyor...</p>
                </div>
            </div>
        );
    }

    if (!tabState || !tabState.score) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.logo}>🛡️</span>
                    <h2 style={styles.title}>SentinelTK</h2>
                </div>
                <div style={styles.emptyState}>
                    <span style={{ fontSize: 32 }}>🔍</span>
                    <p style={styles.noData}>Bu sayfa henüz analiz edilmedi.</p>
                    <p style={styles.noDataSub}>Bir web sayfasına gidin ve tekrar kontrol edin.</p>
                </div>
            </div>
        );
    }

    const { score } = tabState;
    const positiveFactors = score.factors.filter(f => f.weight < 0);
    const negativeFactors = score.factors.filter(f => f.weight > 0);
    const neutralFactors = score.factors.filter(f => f.weight === 0);

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.logo}>🛡️</span>
                    <h2 style={styles.title}>SentinelTK</h2>
                </div>
                <span style={styles.version}>v1.0</span>
            </div>

            {/* Score Circle */}
            <div style={styles.scoreSection}>
                <div style={{ ...styles.scoreCircle, background: getScoreGradient(score.score) }}>
                    <span style={styles.scoreNumber}>{score.score}</span>
                    <span style={styles.scoreLabel}>/100</span>
                </div>
                <div style={styles.scoreInfo}>
                    <span style={{ ...styles.levelBadge, color: getScoreColor(score.score) }}>
                        {getLevelText(score.level)}
                    </span>
                    <span style={styles.domain}>{tabState.hostname}</span>
                    <span style={styles.levelDesc}>{getLevelDesc(score.level)}</span>
                </div>
            </div>

            {/* Safe Start indicator */}
            {tabState.safeStartActive && (
                <div style={styles.safeStartBanner}>
                    🔒 Güvenli Başlangıç aktif — ağ istekleri engelleniyor
                </div>
            )}

            {/* User Override indicator */}
            {tabState.userOverride && (
                <div style={styles.overrideBanner}>
                    ✅ Kullanıcı bu siteyi onayladı
                </div>
            )}

            {/* Factors Section */}
            <div style={styles.factorsSection}>
                <div
                    style={styles.factorsHeader}
                    onClick={() => setExpanded(!expanded)}
                >
                    <h4 style={styles.factorsTitle}>
                        📊 Analiz Detayları ({score.factors.length} sinyal)
                    </h4>
                    <span style={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
                </div>

                {expanded && (
                    <div style={styles.factorsList}>
                        {/* Neutral (trusted/whitelisted) */}
                        {neutralFactors.map((f: ScoreFactor, i: number) => (
                            <div key={`n${i}`} style={{ ...styles.factor, borderLeftColor: '#22c55e' }}>
                                <span style={styles.factorIcon}>{getFactorIcon(f.signal)}</span>
                                <span style={styles.factorDesc}>{f.description}</span>
                                <span style={{ ...styles.factorWeight, color: '#22c55e' }}>0</span>
                            </div>
                        ))}

                        {/* Negative (risk reduction) */}
                        {positiveFactors.map((f: ScoreFactor, i: number) => (
                            <div key={`p${i}`} style={{ ...styles.factor, borderLeftColor: '#22c55e' }}>
                                <span style={styles.factorIcon}>{getFactorIcon(f.signal)}</span>
                                <span style={styles.factorDesc}>{f.description}</span>
                                <span style={{ ...styles.factorWeight, color: '#22c55e' }}>{f.weight}</span>
                            </div>
                        ))}

                        {/* Positive (risk increasing) */}
                        {negativeFactors.map((f: ScoreFactor, i: number) => (
                            <div key={`r${i}`} style={{ ...styles.factor, borderLeftColor: getScoreColor(f.weight > 15 ? 70 : f.weight > 5 ? 50 : 30) }}>
                                <span style={styles.factorIcon}>{getFactorIcon(f.signal)}</span>
                                <span style={styles.factorDesc}>{f.description}</span>
                                <span style={{ ...styles.factorWeight, color: '#ef4444' }}>+{f.weight}</span>
                            </div>
                        ))}

                        {score.factors.length === 0 && (
                            <p style={styles.noFactors}>Hiçbir şüpheli sinyal tespit edilmedi.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={styles.actions}>
                {!showReportForm ? (
                    <>
                        {score.level === 'danger' && !tabState.userOverride && (
                            <button style={styles.overrideBtn} onClick={handleOverride}>
                                🔓 Yine de Devam Et
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button style={styles.reportBtn} onClick={() => setShowReportForm(true)} disabled={reported}>
                                {reported ? '✓ Gönderildi' : '🚩 Rapor Et'}
                            </button>
                            {score.score > 0 && (
                                <button style={styles.whitelistBtn} onClick={handleWhitelist}>
                                    ✓ Güvenli Listeme Ekle
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={styles.reportForm}>
                        <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={styles.select}>
                            <option value="">Sebep seçin...</option>
                            <option value="phishing">Kimlik Avı (Phishing)</option>
                            <option value="scam">Dolandırıcılık</option>
                            <option value="malware">Zararlı Yazılım</option>
                            <option value="fake_shop">Sahte Mağaza</option>
                            <option value="other">Diğer</option>
                        </select>
                        <div style={styles.reportActions}>
                            <button style={styles.reportSubmit} onClick={handleReport} disabled={!reportReason}>Gönder</button>
                            <button style={styles.reportCancel} onClick={() => setShowReportForm(false)}>İptal</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={styles.footer}>
                <span>🔒 Kişisel verileriniz asla okunmaz veya kaydedilmez.</span>
            </div>
        </div>
    );
};

// ── Styles ──
const styles: Record<string, React.CSSProperties> = {
    container: {
        width: 360, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)', color: '#e5e7eb', fontSize: 13,
        overflow: 'hidden',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 0', marginBottom: 0,
    },
    logo: { fontSize: 20 },
    title: { margin: 0, fontSize: 15, color: '#fff', fontWeight: 700, letterSpacing: '0.5px' },
    version: { fontSize: 10, color: '#6b7280', background: '#1f2937', padding: '2px 6px', borderRadius: 4 },

    // Score section
    scoreSection: {
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
    },
    scoreCircle: {
        width: 64, height: 64, borderRadius: '50%', display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
    },
    scoreNumber: { fontSize: 24, fontWeight: 800, color: '#fff', lineHeight: 1 },
    scoreLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
    scoreInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
    levelBadge: { fontSize: 15, fontWeight: 700 },
    domain: { color: '#9ca3af', fontSize: 11, wordBreak: 'break-all' as const },
    levelDesc: { color: '#6b7280', fontSize: 11, lineHeight: 1.3 },

    // Safe-Start banner
    safeStartBanner: {
        background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontSize: 11,
        padding: '6px 16px', borderTop: '1px solid rgba(245, 158, 11, 0.2)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
    },
    overrideBanner: {
        background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontSize: 11,
        padding: '6px 16px', borderTop: '1px solid rgba(34, 197, 94, 0.2)',
        borderBottom: '1px solid rgba(34, 197, 94, 0.2)',
    },

    // Factors
    factorsSection: {
        margin: '0 12px 8px', background: 'rgba(30, 41, 59, 0.6)', borderRadius: 8,
        border: '1px solid rgba(71, 85, 105, 0.3)', overflow: 'hidden',
    },
    factorsHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', cursor: 'pointer', userSelect: 'none' as const,
    },
    factorsTitle: { margin: 0, fontSize: 12, color: '#94a3b8', fontWeight: 600 },
    expandIcon: { fontSize: 10, color: '#64748b' },
    factorsList: { padding: '0 8px 8px', maxHeight: 180, overflowY: 'auto' as const },
    factor: {
        display: 'flex', gap: 6, padding: '5px 8px', marginBottom: 3,
        background: 'rgba(15, 23, 42, 0.4)', borderRadius: 5,
        alignItems: 'center', borderLeft: '3px solid transparent',
    },
    factorIcon: { fontSize: 13, flexShrink: 0 },
    factorDesc: { color: '#cbd5e1', fontSize: 11, flex: 1 },
    factorWeight: { fontWeight: 700, fontSize: 12, minWidth: 24, textAlign: 'right' as const },
    noFactors: { color: '#64748b', fontSize: 11, textAlign: 'center' as const, padding: 8 },

    // Actions
    actions: { padding: '0 12px 8px', display: 'flex', flexDirection: 'column' as const, gap: 6 },
    overrideBtn: {
        background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)',
        padding: '8px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    },
    reportBtn: {
        flex: 1, background: '#374151', color: '#e5e7eb', border: 'none', padding: '7px 12px',
        borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    },
    whitelistBtn: {
        flex: 1, background: 'transparent', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.4)',
        padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
    },
    reportForm: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
    select: {
        background: '#1e293b', color: '#e5e7eb', border: '1px solid #374151',
        padding: 8, borderRadius: 6, fontSize: 12,
    },
    reportActions: { display: 'flex', gap: 6 },
    reportSubmit: {
        flex: 1, background: '#ef4444', color: '#fff', border: 'none',
        padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    },
    reportCancel: {
        flex: 1, background: '#374151', color: '#9ca3af', border: 'none',
        padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12,
    },

    // Loading
    loadingContainer: { padding: 40, textAlign: 'center' as const },
    spinner: {
        width: 32, height: 32, border: '3px solid #374151', borderTop: '3px solid #6366f1',
        borderRadius: '50%', margin: '0 auto 12px',
        animation: 'spin 1s linear infinite',
    },
    loadingText: { color: '#9ca3af', fontSize: 13 },

    // Empty
    emptyState: { textAlign: 'center' as const, padding: '24px 16px' },
    noData: { color: '#6b7280', fontSize: 13, margin: '8px 0 4px' },
    noDataSub: { color: '#4b5563', fontSize: 11, margin: 0 },

    // Footer
    footer: {
        textAlign: 'center' as const, color: '#475569', fontSize: 10,
        padding: '6px 16px 10px', borderTop: '1px solid rgba(71, 85, 105, 0.2)',
    },
};

// Add spinner animation via style tag
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #4b5563; }
    button:hover { opacity: 0.85; }
    button:active { transform: scale(0.98); }
    body { margin: 0; padding: 0; }
`;
document.head.appendChild(styleSheet);

// Mount
ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);
