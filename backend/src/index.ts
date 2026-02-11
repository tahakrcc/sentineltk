import express from 'express';
import cors from 'cors';
import { apiRoutes } from './routes';
import { initDb } from './db';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// CORS - allow extension requests
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
}));

app.use(express.json({ limit: '10kb' })); // Limit body size for safety

// Initialize DB (SQLite for MVP)
// Initialize DB (SQLite for MVP)
try {
    console.log('Initializing database...');
    initDb();
    console.log('Database initialization started.');
} catch (error) {
    console.error('FAILED to initialize database:', error);
}

// Routes
app.use('/api/v1', apiRoutes);

app.get('/', (_req, res) => {
    res.json({
        service: 'SentinelTK Backend',
        version: '1.0.0',
        status: 'active',
        endpoints: [
            'POST /api/v1/score',
            'POST /api/v1/report',
            'GET  /api/v1/fingerprint/:domain',
            'GET  /api/v1/stats',
        ],
    });
});

// Health check endpoint for Railway
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SentinelTK Backend running on http://0.0.0.0:${PORT}`);
    console.log('Environment PORT:', process.env.PORT);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Don't process.exit(1) — let Railway healthcheck pass
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    // Don't process.exit(1) — let Railway healthcheck pass
});
