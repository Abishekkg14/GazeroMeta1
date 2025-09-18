// ---------------- CONFIG & ABIs ----------------
const PIMLICO_API_KEY = "pim_dhJ9peZUgu52XpuVsbWcQ4";
const SEPOLIA_CHAIN_ID = 11155111;
const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const USDC_ADDRESS = "0x744E17f0d06BA82981A1bE425236d01500984B5d";

const BUNDLER_URL = `https://api.pimlico.io/v1/sepolia/rpc?apikey=${PIMLICO_API_KEY}`;
const PAYMASTER_URL = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${PIMLICO_API_KEY}`;
const ETHERSCAN_BASE = "https://sepolia.etherscan.io/";

// Initialize public client only if viem is available
let publicClient = null;
if (typeof viem !== 'undefined') {
    publicClient = viem.createPublicClient({
        chain: viem.sepolia,
        transport: viem.http('https://rpc.sepolia.org')
    });
}

const USDC_ABI = [{
    inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
}];

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

        if (!window.ethereum) throw new Error('MetaMask is not installed');

        // Basic EIP-1193 connection (works with MetaMask reliably)
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) throw new Error('No accounts returned');
        currentAccount = accounts[0];

        // get chainId via provider
        const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainHex, 16);
        if (chainId !== SEPOLIA_CHAIN_ID) {
            status.textContent = 'Switching to Sepolia...';
            try {
                await switchToSepolia();
            } catch (swErr) {
                console.warn('Switch chain failed', swErr);
                // continue — user can manually switch in MetaMask
            }
        }

    // Update UI immediately with wallet address
    await updateUI();

        // If advanced libraries exist, try to set up smart account (optional)
        if (checkLibraries()) {
            try {
                status.textContent = 'Setting up smart account...';
                // create a viem wallet client that uses window.ethereum (if available)
                if (typeof viem !== 'undefined') {
                    walletClient = viem.createWalletClient({
                        transport: viem.custom(window.ethereum),
                        chain: viem.sepolia
                    });
                }

                bundlerClient = permissionless.createPimlicoBundlerClient({
                    chain: viem.sepolia,
                    transport: viem.http(BUNDLER_URL),
                    entryPoint: ENTRY_POINT
                });

                paymasterClient = permissionless.createPimlicoPaymasterClient({
                    chain: viem.sepolia,
                    transport: viem.http(PAYMASTER_URL),
                    entryPoint: ENTRY_POINT
                });

                if (typeof permissionless !== 'undefined') {
                    smartAccountClient = await permissionless.createSmartAccountClient({
                    account: { address: currentAccount, type: 'local' },
                    entryPoint: ENTRY_POINT,
                    chain: viem.sepolia,
                    bundlerTransport: viem.http(BUNDLER_URL),
                    middleware: {
                        gasPrice: async () => await publicClient.getGasPrice(),
                        sponsorUserOperation: paymasterClient.sponsorUserOperation
                    }
                    });
                } else {
                    throw new Error('permissionless library not available');
                }

                status.textContent = 'Connected (smart account ready)';
                await updateUI();
            } catch (saErr) {
                console.warn('Smart account setup failed:', saErr);
                // Smart-account features are optional — keep wallet connected
                status.textContent = 'Connected (wallet only)';
                showError('Smart-account setup failed — continuing with wallet-only mode.');
            }
        } else {
            status.textContent = 'Connected (wallet only)';
        }

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
    await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
            chainId: '0xaa36a7',
            chainName: 'Sepolia Test Network',
            nativeCurrency: {
                name: 'SepoliaETH',
                symbol: 'SepoliaETH',
                decimals: 18
            },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io']
        }]
    });
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
            } else if (window.ethereum) {
                const balHex = await window.ethereum.request({ method: 'eth_getBalance', params: [currentAccount, 'latest'] });
                const balanceInEth = parseInt(balHex, 16) / 1e18;
                document.getElementById('yourBalance').innerHTML = `Wallet Balance: ${parseFloat(balanceInEth).toFixed(4)} ETH`;
            }

            // Recipient info (show address if filled)
            const recipient = document.getElementById('recipient')?.value;
            if (recipient) {
                document.getElementById('recipientBalance').innerHTML = `Recipient: ${recipient}`;
            } else {
                document.getElementById('recipientBalance').innerHTML = '';
            }

            // Paymaster balance placeholder (real fetch requires paymaster RPC)
            document.getElementById('paymasterBalance').innerHTML = `Paymaster Balance: --`;

            // Network gas price
            networkSection.style.display = 'block';
            if (publicClient && typeof viem !== 'undefined') {
                const gasPrice = await publicClient.getGasPrice();
                const gasPriceGwei = viem.formatGwei(gasPrice);
                document.getElementById('gasInfo').innerHTML = `Current Gas Price: ${parseFloat(gasPriceGwei).toFixed(2)} Gwei`;
            } else if (window.ethereum) {
                const gpHex = await window.ethereum.request({ method: 'eth_gasPrice' });
                const gp = parseInt(gpHex, 16) / 1e9;
                document.getElementById('gasInfo').innerHTML = `Current Gas Price: ${parseFloat(gp).toFixed(2)} Gwei`;
            }
        } catch (balErr) {
            console.warn('Balance/gas fetch error:', balErr);
        }

        // Populate transaction history
        if (transactionHistory.length > 0) {
            transactionSection.style.display = 'block';
            txLinks.innerHTML = transactionHistory.map(t => `
                <div class="mt-2">✅ ${t.status} - ${t.amount} USDC to ${t.to.slice(0,6)}...${t.to.slice(-4)} - <a href="${ETHERSCAN_BASE}tx/${t.hash}" target="_blank">View Tx</a></div>
            `).join('');
        }

    } catch (err) {
        console.error('Error updating UI:', err);
        showError(err.message);
    }
}

// Send USDC Function (supports gasless when smart account available, otherwise wallet-only transfer)
async function sendUSDC() {
    if (!currentAccount) {
        showError('Please connect your wallet first');
        return;
    }

    try {
        hideError();
        status.textContent = 'Preparing transaction...';

        const to = recipientInput.value?.trim();
        const amount = amountInput.value?.toString();

        if (!to || !amount) {
            showError('Please fill in both recipient and amount');
            return;
        }

        // If viem exists, validate address
        if (typeof viem !== 'undefined') {
            if (!viem.isAddress(to)) {
                showError('Invalid recipient address');
                return;
            }
        }

        // Attempt gasless flow if smartAccountClient exists
        if (smartAccountClient && bundlerClient && typeof viem !== 'undefined') {
            const callData = viem.encodeFunctionData({
                abi: USDC_ABI,
                functionName: 'transfer',
                args: [to, viem.parseUnits(amount, 6)]
            });

            status.textContent = 'Creating gasless transaction...';
            const userOpHash = await smartAccountClient.sendUserOperation({
                target: USDC_ADDRESS,
                data: callData,
                value: 0n
            });

            status.innerHTML = `Transaction sent! Waiting for confirmation... <br>
                <a href="https://www.jiffyscan.xyz/userOpHash/${userOpHash}?network=sepolia" target="_blank">View on JiffyScan</a>`;

            const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
            const txHash = receipt.receipt.transactionHash;

            transactionHistory.unshift({ to, amount, hash: txHash, status: 'Confirmed (gasless)' });
            paymentStatus.style.display = 'block';
            paymentStatus.textContent = `Gasless transaction confirmed: ${txHash}`;

            // Clear inputs
            recipientInput.value = '';
            amountInput.value = '';

            await updateUI();
            return;
        }

        // Fallback: wallet-only ERC20 transfer through MetaMask
        if (!window.ethereum) {
            showError('MetaMask not available for sending a standard transaction');
            return;
        }

        status.textContent = 'Creating ERC20 transaction via wallet...';

        // Ask backend for an estimate (optional but recommended)
        try {
            const estResp = await fetch('/estimate-gas', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ to, amount })
            });
            if (estResp.ok) {
                const est = await estResp.json();
                paymentStatus.style.display = 'block';
                paymentStatus.textContent = `Estimated gas: ${est.estimatedGas} units (@ ${est.gasPriceGwei} Gwei) ≈ ${est.gasCostEth} ETH ($${est.gasCostUsd})`;
            }
        } catch (e) {
            console.warn('Estimate-gas failed', e);
        }

        // Request prepared calldata from backend (/send-usdc mode=client)
        const sendResp = await fetch('/send-usdc', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ to, amount, mode: 'client' })
        });

        if (!sendResp.ok) {
            const err = await sendResp.json().catch(()=>({error:'send prepare failed'}));
            throw new Error(err.error || 'Failed to prepare transaction');
        }

        const { prepared } = await sendResp.json();
        if (!prepared) throw new Error('No prepared transaction returned');

        const txParams = { from: currentAccount, to: prepared.to, data: prepared.data, value: '0x0' };
        const txHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [txParams] });

        // Report to backend the tx hash so server txHistory is updated
        try {
            await fetch('/report-tx', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ hash: txHash, from: currentAccount, to, amount }) });
        } catch (reportErr) {
            console.warn('report-tx failed', reportErr);
        }

    transactionHistory.unshift({ to, amount, hash: txHash, status: 'Pending (wallet)' });
    paymentStatus.style.display = 'block';
    paymentStatus.textContent = `Transaction sent via wallet: ${txHash}`;

    await updateUI();

    // Redirect to backend transaction status page after a short delay
    setTimeout(() => { window.location.href = '/tx-status'; }, 900);

    } catch (err) {
        console.error('USDC transfer error:', err);
        showError(err.message || String(err));
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