
import { promises as dns } from 'dns';
import https from 'https';

// ssl-checker doesn't have types, so we use require
let sslChecker: any;
try {
    sslChecker = require('ssl-checker');
} catch (e) {
    console.warn('ssl-checker module not available:', e);
    sslChecker = null;
}

export interface TechnicalAnalysis {
    ssl: {
        valid: boolean;
        issuedTo?: string;
        issuedBy?: string;
        expires?: string;
        daysRemaining?: number;
        error?: string;
    };
    dns: {
        aRecords: string[];
        mxRecords: string[];
        hasEmailServer: boolean;
    };
    server: {
        ip?: string;
        location?: string;
        headers?: Record<string, string>;
    };
}

export async function performTechnicalAnalysis(domain: string): Promise<TechnicalAnalysis> {
    const result: TechnicalAnalysis = {
        ssl: { valid: false },
        dns: { aRecords: [], mxRecords: [], hasEmailServer: false },
        server: {},
    };

    // 1. SSL Check
    try {
        if (!sslChecker) throw new Error('ssl-checker not loaded');
        const sslData = await sslChecker(domain, { method: 'GET', port: 443 });

        const issuedTo = (sslData as any).issuedTo || (sslData as any).commonName || undefined;
        const issuedBy = (sslData as any).issuer?.O || (sslData as any).issuer?.CN || undefined;

        result.ssl = {
            valid: sslData.valid,
            issuedTo,
            issuedBy,
            expires: sslData.validTo,
            daysRemaining: sslData.daysRemaining,
        };
    } catch (e: any) {
        result.ssl.error = e.message || 'SSL/TLS Connection Failed';
    }

    // 2. DNS Checks
    try {
        const [aRecords, mxRecords] = await Promise.allSettled([
            dns.resolve4(domain),
            dns.resolveMx(domain),
        ]);

        if (aRecords.status === 'fulfilled') {
            result.dns.aRecords = aRecords.value;
            if (aRecords.value.length > 0) result.server.ip = aRecords.value[0];
        }

        if (mxRecords.status === 'fulfilled') {
            result.dns.mxRecords = mxRecords.value.map(r => r.exchange);
            result.dns.hasEmailServer = mxRecords.value.length > 0;
        }
    } catch (e) {
        // DNS failures expected
    }

    // 3. Header Analysis (HEAD request)
    try {
        await new Promise<void>((resolve) => {
            const req = https.request({
                hostname: domain,
                port: 443,
                method: 'HEAD',
                timeout: 3000,
            }, (res) => {
                const headers: Record<string, string> = {};

                // Extract interesting headers
                if (res.headers['server']) headers['Server'] = Array.isArray(res.headers['server']) ? res.headers['server'][0] : res.headers['server'];
                if (res.headers['x-powered-by']) headers['X-Powered-By'] = Array.isArray(res.headers['x-powered-by']) ? res.headers['x-powered-by'][0] : res.headers['x-powered-by'];
                if (res.headers['strict-transport-security']) headers['HSTS'] = 'Yes';

                if (Object.keys(headers).length > 0) {
                    result.server.headers = headers;
                }
                resolve();
            });

            req.on('error', () => resolve());
            req.on('timeout', () => { req.destroy(); resolve(); });
            req.end();
        });
    } catch (e) {
        // Header check failed
    }

    return result;
}
