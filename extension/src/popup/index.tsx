import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TabState, ScoreFactor, TechnicalAnalysis } from '../shared/types';
import { BACKEND_URL } from '../shared/constants';

const Popup: React.FC = () => {
    const [tabState, setTabState] = useState<TabState | null>(null);
    const [technicalDetails, setTechnicalDetails] = useState<TechnicalAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [techLoading, setTechLoading] = useState(false);
    const [reported, setReported] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [showReportForm, setShowReportForm] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [techExpanded, setTechExpanded] = useState(false);

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;
            if (!tabId) { setLoading(false); return; }

            chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', tabId }, (response) => {
                if (response?.data) {
                    setTabState(response.data);
                    if (response.data.hostname) {
                        fetchTechnicalDetails(response.data.hostname);
                    }
                }
                setLoading(false);
            });
        });
    }, []);

    const fetchTechnicalDetails = async (domain: string) => {
        setTechLoading(true);
        try {
            const res = await fetch(`${BACKEND_URL}/analyze-details`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });
            const data = await res.json();
            if (data.analysis) {
                setTechnicalDetails(data.analysis);
            }
        } catch (e) {
            console.error('Failed to fetch technical details', e);
        } finally {
            setTechLoading(false);
        }
    };

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
            case 'suspicious': return 'Bu site şüpheli işaretler taşıyor.';
            case 'danger': return 'Bu site yüksek risk taşıyor!';
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
        return '📌';
    };

    // Helper to render factor with extra details
    const renderFactor = (f: ScoreFactor, color: string) => {
        // Collect extra details for specific signals
        let details: string[] = [];

        if (f.signal === 'fake_badge' && tabState?.signals.fakeBadgeNames?.length) {
            details = tabState.signals.fakeBadgeNames;
        } else if (f.signal === 'urgency_text' && tabState?.signals.urgencyKeywords?.length) {
            details = tabState.signals.urgencyKeywords;
        } else if (f.signal === 'suspicious_contact') {
            if (tabState?.signals.contactInfo?.emails.length) details.push(...tabState.signals.contactInfo.emails);
            if (tabState?.signals.contactInfo?.phones.length) details.push(...tabState.signals.contactInfo.phones);
        }

        return (
            <div key={f.signal} style={{ ...styles.factor, borderLeftColor: color }}>
                <span style={styles.factorIcon}>{getFactorIcon(f.signal)}</span>
                <div style={styles.factorContent}>
                    <span style={styles.factorDesc}>{f.description}</span>
                    {details.length > 0 && (
                        <div style={styles.factorDetails}>
                            {details.map((d, i) => <span key={i} style={styles.detailTag}>{d}</span>)}
                        </div>
                    )}
                </div>
                <span style={{ ...styles.factorWeight, color }}>{f.weight > 0 ? `+${f.weight}` : f.weight}</span>
            </div>
        );
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={styles.logo}>🛡️</span>
                        <h2 style={styles.title}>SentinelTK</h2>
                    </div>
                </div>
                <div style={styles.emptyState}>
                    <span style={{ fontSize: 32 }}>🔍</span>
                    <p style={styles.noData}>Bu sayfa henüz analiz edilmedi.</p>
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
                <span style={styles.version}>v1.2</span>
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

            {/* Factors Section */}
            <div style={styles.factorsSection}>
                <div style={styles.factorsHeader} onClick={() => setExpanded(!expanded)}>
                    <h4 style={styles.factorsTitle}>📊 Risk Analizi ({score.factors.length})</h4>
                    <span style={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
                </div>

                {expanded && (
                    <div style={styles.factorsList}>
                        {neutralFactors.map(f => renderFactor(f, '#22c55e'))}
                        {positiveFactors.map(f => renderFactor(f, '#22c55e'))}
                        {negativeFactors.map(f => renderFactor(f, getScoreColor(f.weight > 10 ? 50 : 20)))}
                    </div>
                )}
            </div>

            {/* Technical Analysis Section */}
            <div style={styles.factorsSection}>
                <div style={styles.factorsHeader} onClick={() => setTechExpanded(!techExpanded)}>
                    <h4 style={styles.factorsTitle}>🔒 Sunucu & Teknik Analiz</h4>
                    <span style={styles.expandIcon}>{techExpanded ? '▼' : '▶'}</span>
                </div>

                {techExpanded && (
                    <div style={styles.factorsList}>
                        {techLoading ? (
                            <div style={styles.miniLoading}>
                                <div style={{ ...styles.spinner, width: 16, height: 16, borderWidth: 2 }}></div>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Sunucu taranıyor...</span>
                            </div>
                        ) : technicalDetails ? (
                            <>
                                {/* SSL Info */}
                                <div style={styles.techItem}>
                                    <span style={styles.techLabel}>SSL Sertifikası</span>
                                    <span style={{ color: technicalDetails.ssl.valid ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                        {technicalDetails.ssl.valid ? '✅ Geçerli' : '❌ Geçersiz/Yok'}
                                    </span>
                                </div>
                                {technicalDetails.ssl.valid && (
                                    <>
                                        {technicalDetails.ssl.issuedTo && (
                                            <div style={styles.techSubItem}>
                                                <span style={styles.techSubLabel}>Kime:</span>
                                                <span style={styles.techValue}>{technicalDetails.ssl.issuedTo}</span>
                                            </div>
                                        )}
                                        {technicalDetails.ssl.issuedBy && (
                                            <div style={styles.techSubItem}>
                                                <span style={styles.techSubLabel}>Veren:</span>
                                                <span style={styles.techValue}>{technicalDetails.ssl.issuedBy}</span>
                                            </div>
                                        )}
                                        {technicalDetails.ssl.daysRemaining !== undefined && (
                                            <div style={styles.techSubItem}>
                                                <span style={styles.techSubLabel}>Kalan Gün:</span>
                                                <span style={{ color: technicalDetails.ssl.daysRemaining < 30 ? '#f59e0b' : '#d1d5db' }}>
                                                    {technicalDetails.ssl.daysRemaining} gün
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* DNS Info */}
                                <div style={{ ...styles.techItem, marginTop: 12 }}>
                                    <span style={styles.techLabel}>Altyapı & DNS</span>
                                </div>
                                <div style={styles.techSubItem}>
                                    <span style={styles.techSubLabel}>E-posta (MX):</span>
                                    <span>
                                        {technicalDetails.dns.hasEmailServer ? '✅ Var' : '⚠️ Yok (Şüpheli)'}
                                    </span>
                                </div>
                                {technicalDetails.server.ip && (
                                    <div style={styles.techSubItem}>
                                        <span style={styles.techSubLabel}>IP Adresi:</span>
                                        <span style={{ fontFamily: 'monospace' }}>{technicalDetails.server.ip}</span>
                                    </div>
                                )}

                                {/* Server Headers (New) */}
                                {technicalDetails.server.headers && (
                                    <>
                                        {technicalDetails.server.headers['Server'] && (
                                            <div style={styles.techSubItem}>
                                                <span style={styles.techSubLabel}>Sunucu Yazılımı:</span>
                                                <span style={styles.techValue}>{technicalDetails.server.headers['Server']}</span>
                                            </div>
                                        )}
                                        {technicalDetails.server.headers['X-Powered-By'] && (
                                            <div style={styles.techSubItem}>
                                                <span style={styles.techSubLabel}>Teknoloji:</span>
                                                <span style={styles.techValue}>{technicalDetails.server.headers['X-Powered-By']}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        ) : (
                            <p style={styles.noFactors}>Teknik veriler alınamadı.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={styles.actions}>
                {!showReportForm ? (
                    <>
                        {score.level === 'danger' && !tabState.userOverride && (
                            <button style={styles.overrideBtn} onClick={handleOverride}>🔓 Yine de Devam Et</button>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button style={styles.reportBtn} onClick={() => setShowReportForm(true)} disabled={reported}>
                                {reported ? '✓ Gönderildi' : '🚩 Rapor Et'}
                            </button>
                            {score.score > 0 && (
                                <button style={styles.whitelistBtn} onClick={handleWhitelist}>Güvenli Ekle</button>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={styles.reportForm}>
                        <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={styles.select}>
                            <option value="">Sebep seçin...</option>
                            <option value="phishing">Kimlik Avı</option>
                            <option value="scam">Dolandırıcılık</option>
                        </select>
                        <div style={styles.reportActions}>
                            <button style={styles.reportSubmit} onClick={handleReport} disabled={!reportReason}>Gönder</button>
                            <button style={styles.reportCancel} onClick={() => setShowReportForm(false)}>İptal</button>
                        </div>
                    </div>
                )}
            </div>

            <div style={styles.footer}>🔒 Verileriniz güvende</div>
        </div>
    );
};

// ── Styles (Detailed Update) ──
const styles: Record<string, React.CSSProperties> = {
    container: {
        width: 360, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)', color: '#e5e7eb', fontSize: 13,
        overflow: 'hidden', minHeight: 400,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0' },
    logo: { fontSize: 20 },
    title: { margin: 0, fontSize: 15, color: '#fff', fontWeight: 700, letterSpacing: '0.5px' },
    version: { fontSize: 10, color: '#6b7280', background: '#1f2937', padding: '2px 6px', borderRadius: 4 },
    scoreSection: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px' },
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

    // Factors with details
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
    factorsList: { padding: '0 8px 8px', maxHeight: 220, overflowY: 'auto' as const },
    factor: {
        display: 'flex', gap: 8, padding: '6px 8px', marginBottom: 4,
        background: 'rgba(15, 23, 42, 0.4)', borderRadius: 5,
        alignItems: 'flex-start', borderLeft: '3px solid transparent',
    },
    factorIcon: { fontSize: 14, marginTop: 2 },
    factorContent: { flex: 1 },
    factorDesc: { color: '#cbd5e1', fontSize: 12, display: 'block' },
    factorDetails: { marginTop: 4, display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
    detailTag: {
        fontSize: 10, background: 'rgba(255,255,255,0.1)', color: '#94a3b8',
        padding: '2px 6px', borderRadius: 4,
    },
    factorWeight: { fontWeight: 700, fontSize: 12, minWidth: 24, textAlign: 'right' as const },
    noFactors: { color: '#64748b', fontSize: 11, textAlign: 'center' as const, padding: 8 },

    // Tech items
    techItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#e2e8f0', marginBottom: 4 },
    techLabel: { color: '#94a3b8', fontWeight: 600 },
    techSubItem: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', paddingLeft: 8, marginBottom: 3 },
    techSubLabel: { color: '#64748b' },
    techValue: { maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },

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
    loadingContainer: { padding: 40, textAlign: 'center' as const },
    spinner: {
        width: 32, height: 32, border: '3px solid #374151', borderTop: '3px solid #6366f1',
        borderRadius: '50%', margin: '0 auto 12px',
        animation: 'spin 1s linear infinite',
    },
    loadingText: { color: '#9ca3af', fontSize: 13 },
    emptyState: { textAlign: 'center' as const, padding: '24px 16px' },
    noData: { color: '#6b7280', fontSize: 13, margin: '8px 0 4px' },
    footer: {
        textAlign: 'center' as const, color: '#475569', fontSize: 10,
        padding: '6px 16px 10px', borderTop: '1px solid rgba(71, 85, 105, 0.2)',
    },
    miniLoading: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: 12, gap: 6 },
};

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

ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);
