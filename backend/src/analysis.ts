
import sslChecker from 'ssl-checker';
import { promises as dns } from 'dns';

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
    };
}

export async function performTechnicalAnalysis(domain: string): Promise<TechnicalAnalysis> {
    const result: TechnicalAnalysis = {
        ssl: { valid: false },
        dns: { aRecords: [], mxRecords: [], hasEmailServer: false },
        server: {},
    };

    try {
        // 1. SSL Check (timeout 3s to not block too long)
        // ssl-checker returns { valid, validFrom, validTo, daysRemaining, issuer, ... }
        const sslData = await sslChecker(domain, { method: 'GET', port: 443 });

        // Safety check for properties
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
        // SSL failures are common for some domains or if blocked
        result.ssl.error = e.message || 'SSL/TLS Connection Failed';
    }

    try {
        // 2. DNS Checks
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
        // DNS errors ignored
    }

    return result;
}
