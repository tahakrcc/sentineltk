import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TabState, ScoreFactor } from '../shared/types';

const Popup: React.FC = () => {
    const [tabState, setTabState] = useState<TabState | null>(null);
    const [loading, setLoading] = useState(true);
    const [reported, setReported] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [showReportForm, setShowReportForm] = useState(false);

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (!tabId) { setLoading(false); return; }

            chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' }, (response) => {
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
        setTabState({ ...tabState, score: { ...tabState.score!, score: 0, level: 'safe', factors: [], timestamp: Date.now() } });
    };

    const getScoreColor = (score: number) => {
        if (score <= 39) return '#22c55e';
        if (score <= 69) return '#f59e0b';
        return '#ef4444';
    };

    const getLevelText = (level: string) => {
        switch (level) {
            case 'safe': return '✅ Güvenli';
            case 'suspicious': return '⚠️ Şüpheli';
            case 'danger': return '🚨 Tehlikeli';
            default: return '❓ Bilinmiyor';
        }
    };

    if (loading) {
        return <div style={styles.container}><p style={styles.loading}>Analiz ediliyor...</p></div>;
    }

    if (!tabState || !tabState.score) {
        return (
            <div style={styles.container}>
                <h2 style={styles.title}>🛡️ SentinelTK</h2>
                <p style={styles.noData}>Bu sayfa henüz analiz edilmedi.</p>
            </div>
        );
    }

    const { score } = tabState;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h2 style={styles.title}>🛡️ SentinelTK</h2>
                <span style={{ ...styles.badge, background: getScoreColor(score.score) }}>
                    {score.score}
                </span>
            </div>

            {/* Domain */}
            <p style={styles.domain}>{tabState.hostname}</p>

            {/* Status */}
            <div style={{ ...styles.statusBar, borderColor: getScoreColor(score.score) }}>
                <span style={styles.statusText}>{getLevelText(score.level)}</span>
                {tabState.safeStartActive && (
                    <span style={styles.safeStart}>🔒 Güvenli Başlangıç Aktif</span>
                )}
            </div>

            {/* Factors */}
            {score.factors.length > 0 && (
                <div style={styles.factorsSection}>
                    <h4 style={styles.factorsTitle}>Tespit Edilen Sinyaller:</h4>
                    {score.factors.map((f: ScoreFactor, i: number) => (
                        <div key={i} style={styles.factor}>
                            <span style={styles.factorWeight}>+{f.weight}</span>
                            <span style={styles.factorDesc}>{f.description}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div style={styles.actions}>
                {!showReportForm ? (
                    <>
                        <button style={styles.reportBtn} onClick={() => setShowReportForm(true)} disabled={reported}>
                            {reported ? '✓ Rapor Gönderildi' : '🚩 Siteyi Rapor Et'}
                        </button>
                        {score.score > 0 && (
                            <button style={styles.whitelistBtn} onClick={handleWhitelist}>
                                ✓ Güvenli Listeme Ekle
                            </button>
                        )}
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
            <p style={styles.footer}>Kişisel verileriniz asla okunmaz veya kaydedilmez.</p>
        </div>
    );
};

// ── Styles ──
const styles: Record<string, React.CSSProperties> = {
    container: {
        width: 340, padding: 16, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: '#111827', color: '#e5e7eb', fontSize: 13,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { margin: 0, fontSize: 16, color: '#fff' },
    badge: {
        color: '#fff', fontWeight: 'bold', fontSize: 18, width: 40, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
    },
    domain: { color: '#9ca3af', fontSize: 12, margin: '0 0 10px', wordBreak: 'break-all' as const },
    statusBar: {
        padding: '8px 12px', borderRadius: 6, background: '#1f2937',
        borderLeft: '3px solid', marginBottom: 10,
    },
    statusText: { fontWeight: 600, fontSize: 14 },
    safeStart: { display: 'block', color: '#f59e0b', fontSize: 11, marginTop: 4 },
    factorsSection: { background: '#1f2937', borderRadius: 6, padding: 10, marginBottom: 10, maxHeight: 150, overflowY: 'auto' as const },
    factorsTitle: { margin: '0 0 6px', fontSize: 12, color: '#9ca3af' },
    factor: { display: 'flex', gap: 8, marginBottom: 4, fontSize: 12, alignItems: 'flex-start' },
    factorWeight: { color: '#ef4444', fontWeight: 'bold', minWidth: 28 },
    factorDesc: { color: '#d1d5db' },
    actions: { display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 8 },
    reportBtn: {
        background: '#374151', color: '#e5e7eb', border: 'none', padding: '8px 12px',
        borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    },
    whitelistBtn: {
        background: 'transparent', color: '#22c55e', border: '1px solid #22c55e',
        padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
    },
    reportForm: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
    select: {
        background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151',
        padding: 8, borderRadius: 6, fontSize: 12,
    },
    reportActions: { display: 'flex', gap: 6 },
    reportSubmit: {
        flex: 1, background: '#ef4444', color: '#fff', border: 'none',
        padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    },
    reportCancel: {
        flex: 1, background: '#374151', color: '#9ca3af', border: 'none',
        padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12,
    },
    loading: { textAlign: 'center' as const, color: '#9ca3af' },
    noData: { textAlign: 'center' as const, color: '#6b7280' },
    footer: { textAlign: 'center' as const, color: '#4b5563', fontSize: 10, margin: 0 },
};

// Mount
ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);
