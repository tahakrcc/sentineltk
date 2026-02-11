import { Router, Request, Response } from 'express';
import { db } from './db';
import { rateLimiter } from './middleware';

export const apiRoutes = Router();

// ═══════════════════════════════════════════════════════════════
// POST /score - Get risk score for a domain
// ═══════════════════════════════════════════════════════════════
apiRoutes.post('/score', (req: Request, res: Response) => {
    const { domain } = req.body;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Domain is required and must be a string' });
    }

    // Sanitize domain
    const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.\-]/g, '');

    // 1. Check DB for existing known domain score
    db.get(
        'SELECT risk_score, category, report_count, last_updated FROM domains WHERE domain = ?',
        [cleanDomain],
        (err, row: any) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            if (row) {
                return res.json({
                    domain: cleanDomain,
                    score: row.risk_score,
                    category: row.category,
                    reportCount: row.report_count || 0,
                    source: 'database',
                    lastUpdated: row.last_updated,
                });
            }

            // 2. Check community reports
            db.get(
                'SELECT COUNT(*) as count FROM reports WHERE domain = ? AND created_at > datetime("now", "-7 days")',
                [cleanDomain],
                (err2, reportRow: any) => {
                    if (err2) return res.status(500).json({ error: 'Database error' });

                    const recentReports = reportRow?.count || 0;
                    let baseScore = 0;
                    const reasons: string[] = [];

                    // Community signal: each report adds 5 points, max 40
                    if (recentReports > 0) {
                        const communityScore = Math.min(recentReports * 5, 40);
                        baseScore += communityScore;
                        reasons.push(`${recentReports} topluluk raporu (son 7 gün)`);
                    }

                    // Default: unknown domain = 0 base (no signals)
                    return res.json({
                        domain: cleanDomain,
                        score: baseScore,
                        category: recentReports >= 3 ? 'reported' : 'unknown',
                        reportCount: recentReports,
                        reasons,
                        source: 'calculated',
                    });
                }
            );
        }
    );
});

// ═══════════════════════════════════════════════════════════════
// POST /report - Community Reporting
// ═══════════════════════════════════════════════════════════════
apiRoutes.post('/report', rateLimiter(5, 3600000), (req: Request, res: Response) => {
    const { domain, reason } = req.body;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Domain is required' });
    }

    const validReasons = ['phishing', 'scam', 'malware', 'fake_shop', 'other'];
    if (!reason || !validReasons.includes(reason)) {
        return res.status(400).json({ error: 'Valid reason is required', validReasons });
    }

    const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.\-]/g, '');
    const ipHash = hashIP(req.ip || 'unknown');

    // Anti-abuse: check if this IP already reported this domain recently
    db.get(
        'SELECT id FROM reports WHERE domain = ? AND ip_hash = ? AND created_at > datetime("now", "-1 hour")',
        [cleanDomain, ipHash],
        (err, existing: any) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            if (existing) {
                return res.status(429).json({ error: 'Bu alan adını zaten yakın zamanda raporladınız' });
            }

            db.run(
                'INSERT INTO reports (domain, reason, ip_hash) VALUES (?, ?, ?)',
                [cleanDomain, reason, ipHash],
                function (insertErr) {
                    if (insertErr) return res.status(500).json({ error: 'Insert failed' });

                    // Update domain score if heavily reported
                    updateDomainFromReports(cleanDomain);

                    return res.json({
                        success: true,
                        message: 'Rapor başarıyla gönderildi. Teşekkürler!',
                    });
                }
            );
        }
    );
});

// ═══════════════════════════════════════════════════════════════
// GET /fingerprint/:domain - Get known fingerprints
// ═══════════════════════════════════════════════════════════════
apiRoutes.get('/fingerprint/:domain', (req: Request, res: Response) => {
    const domain = req.params.domain?.toLowerCase().replace(/[^a-z0-9.\-]/g, '');

    db.get(
        'SELECT fingerprint_hash, similarity_percent FROM fingerprints WHERE domain = ?',
        [domain],
        (err, row: any) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            if (row) {
                return res.json({
                    domain,
                    fingerprintHash: row.fingerprint_hash,
                    similarityPercent: row.similarity_percent,
                });
            }

            return res.json({ domain, fingerprintHash: null, message: 'No fingerprint found' });
        }
    );
});

// ═══════════════════════════════════════════════════════════════
// GET /stats - Public statistics (anonymous)
// ═══════════════════════════════════════════════════════════════
apiRoutes.get('/stats', (_req: Request, res: Response) => {
    db.get('SELECT COUNT(*) as domainCount FROM domains', (err1, r1: any) => {
        db.get('SELECT COUNT(*) as reportCount FROM reports', (err2, r2: any) => {
            if (err1 || err2) return res.status(500).json({ error: 'Database error' });
            return res.json({
                totalDomains: r1?.domainCount || 0,
                totalReports: r2?.reportCount || 0,
            });
        });
    });
});

// ── Helpers ──

function hashIP(ip: string): string {
    // Simple hash for anonymization (not crypto-grade, but sufficient for anti-abuse)
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
        const chr = ip.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

function updateDomainFromReports(domain: string): void {
    db.get(
        'SELECT COUNT(*) as count FROM reports WHERE domain = ? AND created_at > datetime("now", "-7 days")',
        [domain],
        (err, row: any) => {
            if (err || !row) return;

            const reportCount = row.count;
            if (reportCount >= 3) {
                const score = Math.min(reportCount * 10, 80);
                db.run(
                    `INSERT INTO domains (domain, risk_score, category, report_count, last_updated)
           VALUES (?, ?, 'community_reported', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(domain) DO UPDATE SET
             risk_score = MAX(risk_score, ?),
             report_count = ?,
             last_updated = CURRENT_TIMESTAMP`,
                    [domain, score, reportCount, score, reportCount]
                );
            }
        }
    );
}
