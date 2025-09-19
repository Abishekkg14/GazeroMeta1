console.log("🚀 APP.JS LOADED - VERSION 3 - NEW USDC CONTRACT");
// ---------------- CONFIG & ABIs ----------------
const PIMLICO_API_KEY = "pim_dhJ9peZUgu52XpuVsbWcQ4";
const SEPOLIA_CHAIN_ID = 11155111;
const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
// Updated Sepolia USDC contract address (verified)
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
console.log("🔧 USDC Contract Address:", USDC_ADDRESS);

const BUNDLER_URL = `https://api.pimlico.io/v1/sepolia/rpc?apikey=${PIMLICO_API_KEY}`;
const PAYMASTER_URL = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${PIMLICO_API_KEY}`;
const ETHERSCAN_BASE = "https://sepolia.etherscan.io/";

// Initialize public client only if viem is available
let publicClient = null;
console.log('Checking for viem library...', typeof viem);
if (typeof viem !== 'undefined') {
    console.log('Viem found, creating public client...');
    // Use multiple RPC endpoints for better reliability
    const sepoliaRPCs = [
        'https://rpc.sepolia.dev',
        'https://rpc.sepolia.org',
        'https://eth-sepolia.public.blastapi.io',
        'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
    ];
    
    publicClient = viem.createPublicClient({
        chain: viem.sepolia,
        transport: viem.http(sepoliaRPCs[0]) // Start with the most reliable one
    });
    console.log('Public client created successfully with RPC:', sepoliaRPCs[0]);
} else {
    console.warn('Viem library not found - some features will be disabled');
}

const USDC_ABI = [
    {
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" }
        ],
        name: "transfer",
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [{ name: "owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ type: "uint8" }],
        stateMutability: "view",
        type: "function"
    }
];

// ---------------- GLOBALS ----------------
let walletClient;
let smartAccountClient;
let bundlerClient;
let paymasterClient;
let currentAccount;
let transactionHistory = [];

// ---------------- DOM ELEMENTS ----------------
const connectBtn = document.getElementById('connectBtn');
const status = document.getElementById('status');
const addressDiv = document.getElementById('addressDiv');
const error = document.getElementById('error');
const sendButton = document.getElementById('sendButton');
const recipientInput = document.getElementById('recipient');
const amountInput = document.getElementById('amount');
const balanceSection = document.getElementById('balanceSection');
const networkSection = document.getElementById('networkSection');
const transactionSection = document.getElementById('transactionSection');
const txLinks = document.getElementById('txLinks');
const paymentStatus = document.getElementById('paymentStatus');

// ---------------- EVENT LISTENERS ----------------
window.addEventListener('load', init);
connectBtn.addEventListener('click', connectWallet);
sendButton?.addEventListener('click', sendUSDC);

// Quick amount buttons handler
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('quick-amt')) {
        const amt = e.target.getAttribute('data-amt');
        if (amt && document.getElementById('amount')) document.getElementById('amount').value = amt;
    }
});

// Auto-estimate when recipient or amount change (debounced)
let estimateTimer = null;
function scheduleEstimate() {
    if (estimateTimer) clearTimeout(estimateTimer);
    estimateTimer = setTimeout(() => {
        estimateTimer = null;
        const to = recipientInput?.value?.trim();
        const amount = amountInput?.value?.toString();
        if (to && amount) estimateAndShow(to, amount);
    }, 600);
}

if (recipientInput) recipientInput.addEventListener('input', scheduleEstimate);
if (amountInput) amountInput.addEventListener('input', scheduleEstimate);

async function estimateAndShow(to, amount) {
    try {
        const estResp = await fetch('/estimate-gas', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ to, amount })
        });
        if (!estResp.ok) return;
        const est = await estResp.json();
        paymentStatus.style.display = 'block';
        paymentStatus.textContent = `Estimated gas: ${est.estimatedGas} units (@ ${est.gasPriceGwei} Gwei) ≈ ${est.gasCostEth} ETH ($${est.gasCostUsd})`;
    } catch (e) {
        console.warn('Estimate-gas failed', e);
    }
}

// Initialize
async function init() {
    if (typeof window.ethereum === 'undefined') {
        showError('Please install MetaMask!');
        return;
    }
    setupEventListeners();
    checkConnection();
}

// Runtime library checks (viem & permissionless are optional for a basic MetaMask connect)
function checkLibraries() {
    console.log('Checking libraries...');
    console.log('viem available:', typeof viem !== 'undefined');
    console.log('permissionless available:', typeof permissionless !== 'undefined');
    
    const missing = [];
    if (typeof viem === 'undefined') missing.push('viem');
    if (typeof permissionless === 'undefined') missing.push('permissionless');
    if (missing.length) {
        // Don't fail — just inform the user that advanced features will be unavailable
        console.warn('Missing libraries:', missing.join(', '));
        const msg = `Warning: ${missing.join(', ')} not loaded. Smart-account and gasless features will be disabled.`;
        // show non-blocking message in UI
        status.textContent = msg;
        return false;
    }
    console.log('All libraries available');
    return true;
}

// Setup MetaMask Event Listeners
function setupEventListeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
        window.ethereum.on('disconnect', handleDisconnect);
    }
}

// Connect Wallet
async function connectWallet() {
    try {
        hideError();
        status.textContent = 'Connecting...';
        console.log('Starting wallet connection...');

        if (!window.ethereum) {
            console.error('MetaMask not detected');
            throw new Error('MetaMask is not installed');
        }
        console.log('MetaMask detected, requesting accounts...');

        // Basic EIP-1193 connection (works with MetaMask reliably)
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) throw new Error('No accounts returned');
        currentAccount = accounts[0];

        // get chainId via provider
        const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainHex, 16);
        console.log('Current chain ID:', chainId, 'Expected:', SEPOLIA_CHAIN_ID);
        
        if (chainId !== SEPOLIA_CHAIN_ID) {
            status.textContent = 'Switching to Sepolia...';
            console.log('Switching to Sepolia network...');
            try {
                await switchToSepolia();
                console.log('Successfully switched to Sepolia');
            } catch (swErr) {
                console.warn('Switch chain failed', swErr);
                showError('Failed to switch to Sepolia. Please switch manually in MetaMask.');
                // continue — user can manually switch in MetaMask
            }
        } else {
            console.log('Already on Sepolia network');
        }

    // Update UI immediately with wallet address
    await updateUI();

        // Skip smart account setup for now - use simple MetaMask transactions
        status.textContent = 'Connected (wallet ready)';
        console.log('Using simple MetaMask transactions (no smart account)');

    } catch (err) {
        console.error('Connection error:', err);
        showError(err.message || String(err));
    }
}

// Switch to Sepolia Network
async function switchToSepolia() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // Sepolia chainId
        });
    } catch (err) {
        if (err.code === 4902) {
            await addSepoliaNetwork();
        } else {
            throw err;
        }
    }
}

// Add Sepolia Network
async function addSepoliaNetwork() {
    console.log('Adding Sepolia network to MetaMask...');
    try {
        await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: '0xaa36a7', // 11155111 in hex
                chainName: 'Sepolia Test Network',
                nativeCurrency: {
                    name: 'SepoliaETH',
                    symbol: 'SepoliaETH',
                    decimals: 18
                },
                rpcUrls: [
                    'https://rpc.sepolia.dev',
                    'https://rpc.sepolia.org',
                    'https://eth-sepolia.public.blastapi.io'
                ],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
            }]
        });
        console.log('Sepolia network added successfully');
    } catch (error) {
        console.error('Failed to add Sepolia network:', error);
        throw error;
    }
}

// Handle Account Changes
async function handleAccountsChanged(accounts) {
    if (!accounts || accounts.length === 0) {
        handleDisconnect();
    } else {
        currentAccount = accounts[0];
        if (walletClient) await connectWallet();
    }
}

// Handle Disconnect
function handleDisconnect() {
    currentAccount = null;
    walletClient = null;
    smartAccountClient = null;
    bundlerClient = null;
    paymasterClient = null;
    
    status.textContent = 'Disconnected';
    addressDiv.style.display = 'none';
    connectBtn.textContent = 'Connect Wallet';
    sendButton.disabled = true;
    
    document.querySelector('.transaction-section').style.display = 'none';
    balanceSection.style.display = 'none';
    networkSection.style.display = 'none';
    transactionSection.style.display = 'none';
}

// Check Initial Connection
async function checkConnection() {
    if (!window.ethereum) return;
    
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
            await connectWallet();
        }
    } catch (err) {
        console.error('Error checking wallet connection:', err);
    }
}

// Update UI
async function updateUI() {
    if (!currentAccount) return handleDisconnect();

    try {
        // Update connection status
        status.textContent = 'Connected to Sepolia';
        connectBtn.textContent = 'Connected';
        
        // Display addresses (smart account optional)
        addressDiv.style.display = 'block';
        let smartAccountAddress = null;
        try {
            if (smartAccountClient) {
                // account may be an object or a function depending on implementation
                if (typeof smartAccountClient.account === 'function') {
                    const acc = await smartAccountClient.account();
                    smartAccountAddress = acc?.address || null;
                } else if (smartAccountClient.account && smartAccountClient.account.address) {
                    smartAccountAddress = smartAccountClient.account.address;
                }
            }
        } catch (addrErr) {
            console.warn('Error reading smart account address:', addrErr);
            smartAccountAddress = null;
        }

        addressDiv.innerHTML = `Wallet: ${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`;
        if (smartAccountAddress) addressDiv.innerHTML += `<br>Smart Account: ${smartAccountAddress.slice(0,6)}...${smartAccountAddress.slice(-4)}`;

        // Enable USDC transfers UI
        document.querySelector('.transaction-section').style.display = 'block';
        sendButton.disabled = false;

        // Show balances section (use viem if available, otherwise use window.ethereum RPC)
        balanceSection.style.display = 'block';
        try {
            // Wallet ETH balance
            if (publicClient && typeof viem !== 'undefined') {
                const balance = await publicClient.getBalance({ address: currentAccount });
                const balanceInEth = viem.formatEther(balance);
                document.getElementById('yourBalance').innerHTML = `Wallet Balance: ${parseFloat(balanceInEth).toFixed(4)} ETH`;
                
                // Check USDC balance
                try {
                    const usdcBalance = await publicClient.readContract({
                        address: USDC_ADDRESS,
                        abi: USDC_ABI,
                        functionName: 'balanceOf',
                        args: [currentAccount]
                    });
                    const usdcFormatted = viem.formatUnits(usdcBalance, 6);
                    document.getElementById('yourBalance').innerHTML += `<br>USDC Balance: ${parseFloat(usdcFormatted).toFixed(2)} USDC`;
                } catch (usdcErr) {
                    console.warn('Failed to fetch USDC balance:', usdcErr);
                    document.getElementById('yourBalance').innerHTML += `<br>USDC Balance: Error fetching`;
                }
            } else if (window.ethereum) {
                const balHex = await window.ethereum.request({ method: 'eth_getBalance', params: [currentAccount, 'latest'] });
                const balanceInEth = parseInt(balHex, 16) / 1e18;
                document.getElementById('yourBalance').innerHTML = `Wallet Balance: ${parseFloat(balanceInEth).toFixed(4)} ETH`;
                
                // Try to get USDC balance via direct contract call
                try {
                    const usdcBalanceHex = await window.ethereum.request({
                        method: 'eth_call',
                        params: [{
                            to: USDC_ADDRESS,
                            data: '0x70a08231' + currentAccount.slice(2).padStart(64, '0')
                        }, 'latest']
                    });
                    const usdcBalance = parseInt(usdcBalanceHex, 16) / 1000000; // USDC has 6 decimals
                    document.getElementById('yourBalance').innerHTML += `<br>USDC Balance: ${usdcBalance.toFixed(2)} USDC`;
                } catch (usdcErr) {
                    console.warn('Failed to fetch USDC balance via RPC:', usdcErr);
                    document.getElementById('yourBalance').innerHTML += `<br>USDC Balance: Error fetching`;
                }
            }

            // Recipient info (show address if filled)
            const recipient = document.getElementById('recipient')?.value;
            if (recipient) {
                document.getElementById('recipientBalance').innerHTML = `Recipient: ${recipient}`;
            } else {
                document.getElementById('recipientBalance').innerHTML = '';
            }

            // USDC Contract info
            document.getElementById('paymasterBalance').innerHTML = `USDC Contract: ${USDC_ADDRESS.slice(0,6)}...${USDC_ADDRESS.slice(-4)}`;

            // Network gas price
            networkSection.style.display = 'block';
            try {
                if (publicClient && typeof viem !== 'undefined') {
                    const gasPrice = await publicClient.getGasPrice();
                    const gasPriceGwei = viem.formatGwei(gasPrice);
                    document.getElementById('gasInfo').innerHTML = `Current Gas Price: ${parseFloat(gasPriceGwei).toFixed(2)} Gwei`;
                } else if (window.ethereum) {
                    const gpHex = await window.ethereum.request({ method: 'eth_gasPrice' });
                    const gp = parseInt(gpHex, 16) / 1e9;
                    document.getElementById('gasInfo').innerHTML = `Current Gas Price: ${parseFloat(gp).toFixed(2)} Gwei`;
                } else {
                    // Fallback: fetch from backend
                    try {
                        const gasResp = await fetch('/calculate-gas-cost');
                        if (gasResp.ok) {
                            const gasData = await gasResp.json();
                            document.getElementById('gasInfo').innerHTML = `Current Gas Price: ${parseFloat(gasData.gasPriceGwei).toFixed(2)} Gwei`;
                        } else {
                            document.getElementById('gasInfo').innerHTML = `Current Gas Price: Unable to fetch`;
                        }
                    } catch (e) {
                        document.getElementById('gasInfo').innerHTML = `Current Gas Price: Unable to fetch`;
                    }
                }
            } catch (gasErr) {
                console.warn('Gas price fetch error:', gasErr);
                document.getElementById('gasInfo').innerHTML = `Current Gas Price: Error fetching`;
            }
        } catch (balErr) {
            console.warn('Balance/gas fetch error:', balErr);
        }

        // Populate transaction history
        if (transactionHistory.length > 0) {
            transactionSection.style.display = 'block';
            txLinks.innerHTML = transactionHistory.map(t => {
                const statusIcon = t.status === 'Pending' ? '⏳' : '✅';
                const timeAgo = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '';
                return `
                    <div class="mt-2" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin: 4px 0;">
                        ${statusIcon} <strong>${t.status}</strong> - ${t.amount} USDC to ${t.to.slice(0,6)}...${t.to.slice(-4)} 
                        ${timeAgo ? `(${timeAgo})` : ''}
                        <br><a href="${ETHERSCAN_BASE}tx/${t.hash}" target="_blank" style="color: #007bff;">View on Etherscan</a>
                    </div>
                `;
            }).join('');
        }

    } catch (err) {
        console.error('Error updating UI:', err);
        showError(err.message);
    }
}

// Send USDC Function - Simple MetaMask ERC20 transfer
async function sendUSDC() {
    if (!currentAccount) {
        showError('Please connect your wallet first');
        return;
    }

    try {
        hideError();
        status.textContent = 'Preparing USDC transfer...';
        console.log('Starting USDC transfer...');

        const to = recipientInput.value?.trim();
        const amount = amountInput.value?.toString();

        if (!to || !amount) {
            showError('Please fill in both recipient and amount');
            return;
        }

        // Validate address
        if (typeof viem !== 'undefined') {
            if (!viem.isAddress(to)) {
                showError('Invalid recipient address');
                return;
            }
        } else {
            // Basic address validation if viem is not available
            if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
                showError('Invalid recipient address format');
                return;
            }
        }

        if (!window.ethereum) {
            showError('MetaMask not available');
            return;
        }

        // Get gas estimate first
        status.textContent = 'Estimating gas...';
        let gasEstimate = null;
        try {
            const estResp = await fetch('/estimate-gas', {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ to, amount })
            });
            if (estResp.ok) {
                const est = await estResp.json();
                gasEstimate = est;
                paymentStatus.style.display = 'block';
                paymentStatus.textContent = `Estimated gas: ${est.estimatedGas} units (@ ${est.gasPriceGwei} Gwei) ≈ ${est.gasCostEth} ETH ($${est.gasCostUsd})`;
            }
        } catch (e) {
            console.warn('Gas estimation failed:', e);
        }

        // Prepare the transaction
        status.textContent = 'Preparing transaction...';
        console.log(`Preparing USDC transfer: ${amount} USDC to ${to}`);
        
        const sendResp = await fetch('/send-usdc', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ to, amount, mode: 'client' })
        });

        if (!sendResp.ok) {
            const err = await sendResp.json().catch(()=>({error:'Failed to prepare transaction'}));
            console.error('Backend error:', err);
            throw new Error(err.error || 'Failed to prepare transaction');
        }

        const { prepared } = await sendResp.json();
        if (!prepared) {
            throw new Error('No prepared transaction returned');
        }

        console.log('Transaction prepared:', prepared);
        console.log('🔧 USDC Contract from frontend:', USDC_ADDRESS);
        console.log('🔧 Transaction target from backend:', prepared.to);
        
        if (prepared.to !== USDC_ADDRESS) {
            console.error('❌ MISMATCH! Backend returned wrong contract address!');
            console.error('Expected:', USDC_ADDRESS);
            console.error('Got:', prepared.to);
        } else {
            console.log('✅ Contract addresses match!');
        }
        
        if (typeof viem !== 'undefined') {
            console.log('Amount in wei:', viem.parseUnits(amount, 6).toString());
        } else {
            console.log('Amount in wei:', (parseFloat(amount) * 1000000).toString());
        }

        // Send transaction via MetaMask
        status.textContent = 'Sending transaction via MetaMask...';
        const txParams = { 
            from: currentAccount, 
            to: prepared.to, 
            data: prepared.data, 
            value: '0x0'
        };

        // Add gas limit if we have an estimate
        if (gasEstimate) {
            txParams.gas = '0x' + parseInt(gasEstimate.estimatedGas).toString(16);
        }

        console.log('Sending transaction with params:', txParams);
        const txHash = await window.ethereum.request({ 
            method: 'eth_sendTransaction', 
            params: [txParams] 
        });

        console.log('Transaction sent:', txHash);

        // Update UI immediately
        transactionHistory.unshift({ 
            to, 
            amount, 
            hash: txHash, 
            status: 'Pending',
            timestamp: new Date().toISOString()
        });

        status.textContent = 'Transaction sent! Waiting for confirmation...';
        paymentStatus.style.display = 'block';
        paymentStatus.textContent = `Transaction sent: ${txHash}`;

        // Clear inputs
        recipientInput.value = '';
        amountInput.value = '';

        // Update UI
        await updateUI();

        // Show transaction link
        status.innerHTML = `Transaction sent! <br>
            <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank">View on Etherscan</a>`;

        // Report to backend
        try {
            await fetch('/report-tx', { 
                method: 'POST', 
                headers: {'Content-Type':'application/json'}, 
                body: JSON.stringify({ 
                    hash: txHash, 
                    from: currentAccount, 
                    to, 
                    amount,
                    status: 'sent'
                }) 
            });
        } catch (reportErr) {
            console.warn('Failed to report transaction to backend:', reportErr);
        }

    } catch (err) {
        console.error('USDC transfer error:', err);
        showError(err.message || String(err));
        status.textContent = 'Transaction failed';
    }
}

// Error Handling
function showError(message) {
    error.textContent = message;
    error.style.display = 'block';
}

function hideError() {
    error.style.display = 'none';
}

console.log("✅ Wallet connection script loaded");