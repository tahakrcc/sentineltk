"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initDb = initDb;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const dbPath = path_1.default.join(process.cwd(), 'sentinel.db');
console.log('Database path:', dbPath);
exports.db = new sqlite3_1.default.Database(dbPath, (err) => {
    if (err)
        console.error('DB connection error:', err);
    else
        console.log('DB connected at:', dbPath);
});
function initDb() {
    exports.db.serialize(() => {
        // Domains Table (known + community-reported)
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE NOT NULL,
        risk_score INTEGER DEFAULT 0,
        category TEXT DEFAULT 'unknown',
        report_count INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Reports Table (community reports)
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        reason TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Fingerprints Table (known scam page fingerprints)
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS fingerprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        fingerprint_hash TEXT NOT NULL,
        similarity_percent REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Indexes
        exports.db.run('CREATE INDEX IF NOT EXISTS idx_reports_domain ON reports(domain)');
        exports.db.run('CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at)');
        exports.db.run('CREATE INDEX IF NOT EXISTS idx_fingerprints_domain ON fingerprints(domain)');
        // Seed some known phishing domains for demo
        const seedDomains = [
            { domain: 'garanti-guvenlik-dogrulama.com', score: 90, category: 'phishing' },
            { domain: 'akbank-hesap-guncelleme.net', score: 85, category: 'phishing' },
            { domain: 'trendyol-indirim-kampanya.site', score: 75, category: 'scam' },
            { domain: 'e-devlet-tc-dogrulama.com', score: 95, category: 'phishing' },
            { domain: 'binance-wallet-verify.io', score: 88, category: 'phishing' },
        ];
        const stmt = exports.db.prepare(`
      INSERT OR IGNORE INTO domains (domain, risk_score, category)
      VALUES (?, ?, ?)
    `);
        seedDomains.forEach(d => stmt.run(d.domain, d.score, d.category));
        stmt.finalize();
    });
    console.log('Database initialized with schema and seed data');
}
