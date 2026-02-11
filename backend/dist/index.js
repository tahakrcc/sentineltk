"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = require("./routes");
const db_1 = require("./db");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Initialize DB (SQLite for MVP)
(0, db_1.initDb)();
// Routes
app.use('/api/v1', routes_1.apiRoutes);
app.get('/', (req, res) => {
    res.send('SentinelTK Backend Active');
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
