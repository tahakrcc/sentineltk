"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRoutes = void 0;
const express_1 = require("express");
const db_1 = require("./db");
exports.apiRoutes = (0, express_1.Router)();
// POST /score - Get risk score for a domain
exports.apiRoutes.post('/score', async (req, res) => {
    const { domain, signals } = req.body;
    if (!domain) {
        return res.status(400).json({ error: 'Domain required' });
    }
    // 1. Check DB for existing score
    db_1.db.get('SELECT * FROM domains WHERE domain = ?', [domain], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'DB Error' });
        }
        if (row) {
            return res.json({
                domain,
                score: row.risk_score,
                category: row.category,
                source: 'cached'
            });
        }
        // 2. If not found, Calculate defaults (Stub for MVP)
        const defaultScore = 50; // Unknown/Neutral
        res.json({
            domain,
            score: defaultScore,
            source: 'calculated_default'
        });
    });
});
// POST /report - Community Reporting
exports.apiRoutes.post('/report', (req, res) => {
    const { domain, reason } = req.body;
    // Rate limiting would go here (middleware)
    db_1.db.run('INSERT INTO reports (domain, reason, ip_hash) VALUES (?, ?, ?)', [domain, reason, 'anon_ip'], (err) => {
        if (err)
            return res.status(500).json({ error: 'Failed' });
        res.json({ success: true });
    });
});
