const TelegramBot = require('node-telegram-bot-api');
const Web3 = require('web3');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const web3 = new Web3(process.env.RPC_URL);

const MINT_ABI = [
  {
    "inputs": [],
    "name": "mint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

let isMinting = false;
let lastMintTime = 0;

async function executeMint() {
  try {
    if (isMinting) {
      return { error: 'Already minting!' };
    }

    isMinting = true;
    const startTime = Date.now();
    
    console.log('⚡ MINT INITIATED');

    const account = web3.eth.accounts.privateKeyToAccount(
      process.env.PRIVATE_KEY.startsWith('0x') 
        ? process.env.PRIVATE_KEY 
        : '0x' + process.env.PRIVATE_KEY
    );

    const contract = new web3.eth.Contract(MINT_ABI, process.env.CONTRACT_ADDRESS);

    const [gasPrice, nonce] = await Promise.all([
      web3.eth.getGasPrice(),
      web3.eth.getTransactionCount(account.address)
    ]);

    console.log(`⛽ Gas Price: ${web3.utils.fromWei(gasPrice, 'gwei')} gwei`);

    const tx = {
      from: account.address,
      to: process.env.CONTRACT_ADDRESS,
      data: contract.methods.mint().encodeABI(),
      gas: 150000,
      maxFeePerGas: Math.floor(gasPrice * 2.0),
maxPriorityFeePerGas: Math.floor(gasPrice * 0.2),
      nonce: nonce,
      value: web3.utils.toWei(process.env.MINT_VALUE || '0', 'ether')
    };

    try {
      const estimatedGas = await web3.eth.estimateGas(tx);
      tx.gas = Math.ceil(estimatedGas * 2.0);
    } catch (e) {
      console.log('Gas estimate warning:', e.message);
    }

    console.log('🔐 Signing transaction...');
    const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);

    console.log('📤 Sending transaction...');
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    lastMintTime = Date.now() - startTime;
    isMinting = false;

    console.log(`✅ MINT SUCCESS in ${lastMintTime}ms`);

    return {
      success: true,
      hash: receipt.transactionHash,
      time: lastMintTime,
      blockNumber: receipt.blockNumber
    };

  } catch (error) {
    console.error('❌ Mint error:', error);
    isMinting = false;
    return { error: error.message };
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `⚡ *Fast Mint Bot*\n\n` +
    `Commands:\n` +
    `/mint - Mint NFT\n` +
    `/balance - Check wallet\n` +
    `/status - Check status\n` +
    `/speed - Last mint speed`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/mint/, async (msg) => {
  bot.sendMessage(msg.chat.id, '⚡ *Minting...*');
  
  const result = await executeMint();
  
  if (result.success) {
    bot.sendMessage(msg.chat.id,
      `✅ *MINTED!*\n\n` +
      `Hash: \`${result.hash}\`\n` +
      `Speed: ${result.time}ms\n` +
      `Block: ${result.blockNumber}`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(msg.chat.id, `❌ Error: ${result.error}`);
  }
});

bot.onText(/\/balance/, async (msg) => {
  try {
    bot.sendMessage(msg.chat.id, '⏳ Checking...');
    const balance = await web3.eth.getBalance(process.env.WALLET_ADDRESS);
    const eth = web3.utils.fromWei(balance, 'ether');
    bot.sendMessage(msg.chat.id, `💰 Balance: ${eth} ETH`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

bot.onText(/\/status/, (msg) => {
  const status = isMinting ? '🟢 Minting in progress...' : '⚪ Ready to mint';
  bot.sendMessage(msg.chat.id, status);
});

bot.onText(/\/speed/, (msg) => {
  const speed = lastMintTime > 0 ? `${lastMintTime}ms` : 'No data yet';
  bot.sendMessage(msg.chat.id, `⚡ Last mint speed: ${speed}`);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('✅ Bot ready for minting!');
