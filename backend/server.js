const express = require('express');
const { ethers } = require('ethers');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const port = 3000;

// Sepolia RPC endpoint with Alchemy API key
const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/oLDxlphD2jE42u5Z3Ip0J";
// Fallback RPC URLs in case the primary one fails
const FALLBACK_RPCS = [
    "https://eth-sepolia.g.alchemy.com/v2/oLDxlphD2jE42u5Z3Ip0J",
    "https://rpc.sepolia.org",
    "https://eth-sepolia.public.blastapi.io"
];

// Initialize provider with debug logging
console.log("Initializing provider with Alchemy RPC URL...");

let provider;
async function initializeProvider() {
    try {
        provider = new ethers.JsonRpcProvider(RPC_URL);
        // Test the connection
        const network = await provider.getNetwork();
        console.log("Successfully connected to network:", network.name);
        return true;
    } catch (error) {
        console.error("Failed to connect to primary RPC:", error.message);
        console.log("Trying fallback RPCs...");
        
        for (const rpc of FALLBACK_RPCS) {
            try {
                provider = new ethers.JsonRpcProvider(rpc);
                // Test the connection
                const network = await provider.getNetwork();
                console.log("Successfully connected to fallback RPC on network:", network.name);
                return true;
            } catch (e) {
                console.error("Failed to connect to fallback RPC:", rpc);
            }
        }
        return false;
    }
}

// Initialize provider immediately
initializeProvider().then(success => {
    if (success) {
        console.log("Provider initialized successfully");
    } else {
        console.error("Failed to initialize any provider");
    }
});

// Middleware to handle CORS and security headers
app.use((req, res, next) => {
    // Set Content-Security-Policy header allowing CDNs needed for local dev
    // We explicitly allow script/style elements from the CDNs used by the frontend
    // (unpkg, cdn.jsdelivr.net, cdn.ethers.io) and the Pimlico API for bundler/paymaster.
    res.header(
        'Content-Security-Policy',
        "default-src 'self'; " +
        // Allow loading scripts from the app itself and the CDNs we rely on
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://cdn.ethers.io; " +
        // Allow script elements to be loaded from CDNs
        "script-src-elem 'self' https://unpkg.com https://cdn.jsdelivr.net https://cdn.ethers.io; " +
        // Allow XHR/websocket connections to RPCs, APIs and Pimlico
        "connect-src 'self' https://api.coingecko.com https://eth-sepolia.g.alchemy.com https://api.pimlico.io ws://localhost:* http://localhost:* chrome-devtools://* chrome-extension://*; " +
        "img-src 'self' data: blob:; " +
        // Allow styles from our site and the CDN used for Bootstrap
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "style-src-elem 'self' https://cdn.jsdelivr.net; " +
        "font-src 'self' data:; " +
        "frame-src 'self';"
    );

    // CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', '*');

    // For preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// JSON body parser for API endpoints
app.use(express.json());

// In-memory transaction history (simple demo store)
const txHistory = [];

// Minimal ERC20 ABI for transfer
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)"
];

// USDC address used by the frontend (Sepolia/test address)
const USDC_ADDRESS = "0x744E17f0d06BA82981A1bE425236d01500984B5d";

// POST endpoint to receive send requests from frontend
// Body: { to: string, amount: string, mode?: 'server'|'client' }
app.post('/send-usdc', async (req, res) => {
    try {
        const { to, amount, mode } = req.body || {};
        if (!to || !amount) return res.status(400).json({ error: 'Missing to or amount' });

        // Parse amount in USDC (6 decimals)
        const amountUnits = ethers.parseUnits(String(amount), 6);

        // If mode=server, attempt to send from server wallet (requires PRIVATE_KEY env var)
        if (mode === 'server') {
            const pk = process.env.PRIVATE_KEY;
            if (!pk) return res.status(400).json({ error: 'Server transfer requested but PRIVATE_KEY not set on server. Use client mode or set PRIVATE_KEY.' });

            const wallet = new ethers.Wallet(pk, provider);
            const contract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

            console.log(`Server sending ${amount} USDC to ${to} from ${wallet.address}`);
            const tx = await contract.transfer(to, amountUnits);
            // wait for confirmation
            const receipt = await tx.wait();

            const entry = {
                time: new Date().toISOString(),
                mode: 'server',
                from: wallet.address,
                to,
                amount,
                hash: receipt.transactionHash,
                status: receipt.status === 1 ? 'confirmed' : 'failed'
            };
            txHistory.unshift(entry);

            return res.json({ ok: true, mode: 'server', tx: entry });
        }

        // Otherwise prepare a client-side transaction (return call data for frontend to sign/send)
        const iface = new ethers.Interface(ERC20_ABI);
        const data = iface.encodeFunctionData('transfer', [to, amountUnits]);

        const prepared = {
            to: USDC_ADDRESS,
            data,
            value: 0
        };

        // store a queued entry (client will actually send)
        txHistory.unshift({ time: new Date().toISOString(), mode: 'client', to, amount, prepared, status: 'queued' });

        return res.json({ ok: true, mode: 'client', prepared });

    } catch (err) {
        console.error('Error in /send-usdc:', err);
        return res.status(500).json({ error: 'Internal error', details: err.message });
    }
});

// Simple status page showing recent transactions
app.get('/tx-status', (req, res) => {
    const list = txHistory.map(t => `
        <div style="margin-bottom:12px;padding:8px;border:1px solid #eee;border-radius:6px;">
            <div><strong>Time:</strong> ${t.time}</div>
            <div><strong>Mode:</strong> ${t.mode}</div>
            <div><strong>From:</strong> ${t.from || '—'}</div>
            <div><strong>To:</strong> ${t.to}</div>
            <div><strong>Amount:</strong> ${t.amount} USDC</div>
            <div><strong>Status:</strong> ${t.status}</div>
            <div>${t.hash ? `<a href="https://sepolia.etherscan.io/tx/${t.hash}" target="_blank">View on Etherscan</a>` : ''}</div>
        </div>
    `).join('');

    res.send(`
        <html><head><title>Transaction Status</title></head><body>
        <h1>Transaction History</h1>
        <div>${list || '<em>No transactions yet</em>'}</div>
        <p><a href="/">Back to app</a></p>
        </body></html>
    `);
});

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Helper function to retry failed requests
async function retryOperation(operation, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.log(`Attempt ${attempt} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
    }
    throw lastError;
}

// API endpoint for gas calculations
app.get('/calculate-gas-cost', async (req, res) => {
    try {
        if (!provider) {
            throw new Error("No RPC provider available");
        }

        // Get gas data with retry
        const feeData = await retryOperation(async () => {
            const data = await provider.getFeeData();
            if (!data || !data.gasPrice) {
                throw new Error("Invalid fee data received");
            }
            return data;
        });

        const gasPrice = feeData.gasPrice;

        // Fetch ETH price with retry
        const ethPriceData = await retryOperation(async () => {
            const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data || !data.ethereum || !data.ethereum.usd) {
                throw new Error("Invalid price data received");
            }
            return data;
        });

        const ethPriceInUsd = ethPriceData.ethereum.usd;

        // Gas estimation for a typical transaction
        const estimatedGasUnits = 150000n;
        const gasCostInWei = estimatedGasUnits * gasPrice;
        const gasCostInEth = ethers.formatEther(gasCostInWei);
        const gasCostInUsd = parseFloat(gasCostInEth) * ethPriceInUsd;

        // Log successful calculation
        console.log("Gas calculation successful:", {
            gasPrice: ethers.formatUnits(gasPrice, "gwei") + " gwei",
            ethPrice: "$" + ethPriceInUsd,
            estimatedCost: "$" + gasCostInUsd
        });

        res.json({
            gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
            ethPriceUsd: ethPriceInUsd,
            estimatedGasLimit: estimatedGasUnits.toString(),
            gasCostEth: gasCostInEth,
            gasCostUsd: gasCostInUsd.toFixed(4)
        });
    } catch (error) {
        console.error("Error calculating gas cost:", error.message);
        res.status(500).json({ 
            error: "Failed to calculate gas cost", 
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Chrome DevTools endpoint
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    console.log('Chrome DevTools request received');
    // Remove any existing CSP headers for this endpoint
    res.removeHeader('Content-Security-Policy');
    
    // Set permissive headers for DevTools
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the response
    res.status(200).json({
        version: "1.0",
        enabled: true
    });
});

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Serve the gas calculator page
app.get('/gas', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/gas-calculator.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Frontend path: ${path.join(__dirname, '../frontend')}`);
});

// POST /estimate-gas - estimate gas & cost for a provided recipient and amount
app.post('/estimate-gas', async (req, res) => {
    try {
        const { to, amount } = req.body || {};
        if (!to || !amount) return res.status(400).json({ error: 'Missing to or amount' });

        // Prepare call data for ERC20 transfer
        const iface = new ethers.Interface(ERC20_ABI);
        const amountUnits = ethers.parseUnits(String(amount), 6);
        const data = iface.encodeFunctionData('transfer', [to, amountUnits]);

        // Prepare a call transaction object for estimation
        const tx = {
            to: USDC_ADDRESS,
            data,
            value: 0
        };

        // Estimate gas with retries
        const estimatedGas = await retryOperation(async () => {
            return await provider.estimateGas(tx);
        });

        // Get fee data
        const feeData = await retryOperation(async () => {
            const d = await provider.getFeeData();
            if (!d || !d.gasPrice) throw new Error('Fee data missing');
            return d;
        });

        // Fetch ETH price
        const ethPriceData = await retryOperation(async () => {
            const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
            if (!response.ok) throw new Error('Price fetch failed');
            return await response.json();
        });

        const gasPrice = feeData.gasPrice;
        const ethPriceInUsd = ethPriceData.ethereum.usd;

        const gasCostInWei = BigInt(estimatedGas.toString()) * BigInt(gasPrice.toString());
        const gasCostInEth = ethers.formatEther(gasCostInWei);
        const gasCostInUsd = parseFloat(gasCostInEth) * ethPriceInUsd;

        res.json({
            estimatedGas: estimatedGas.toString(),
            gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
            gasCostEth: gasCostInEth,
            gasCostUsd: gasCostInUsd.toFixed(6),
            ethPriceUsd: ethPriceInUsd
        });

    } catch (err) {
        console.error('Error in /estimate-gas:', err.message || err);
        res.status(500).json({ error: 'Failed to estimate gas', details: err.message });
    }
});

// Client reports a transaction that it sent
app.post('/report-tx', (req, res) => {
    try {
        const { hash, to, amount, from } = req.body || {};
        if (!hash) return res.status(400).json({ error: 'Missing tx hash' });
        const entry = { time: new Date().toISOString(), mode: 'client', from: from || 'client', to, amount, hash, status: 'reported' };
        txHistory.unshift(entry);
        return res.json({ ok: true, entry });
    } catch (err) {
        return res.status(500).json({ error: 'report failed', details: err.message });
    }
});