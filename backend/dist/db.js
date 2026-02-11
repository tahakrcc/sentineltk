"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initDb = initDb;
const sqlite3_1 = __importDefault(require("sqlite3"));
exports.db = new sqlite3_1.default.Database('./sentinel.db');
function initDb() {
    exports.db.serialize(() => {
        // Domains Table
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT UNIQUE,
        risk_score INTEGER,
        category TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Reports Table
        exports.db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        reason TEXT,
        ip_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    });
    console.log('Database initialized');
}
