const TelegramBot = require('node-telegram-bot-api');
const Web3 = require('web3');
require('dotenv').config();

const web3 = new Web3(process.env.RPC_URL);
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

let isMinting = false;
let lastMintTime = 0;

const MINT_ABI = [
  {
    "inputs": [],
    "name": "mint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `⚡ Fast Mint Bot\n\nCommands:\n/mint - Mint NFT\n/balance - Check wallet\n/status - Check status\n/speed - Last mint speed`);
});

bot.onText(/\/balance/, async (msg) => {
  try {
    const balance = await web3.eth.getBalance(process.env.WALLET_ADDRESS);
    const ethBalance = web3.utils.fromWei(balance, 'ether');
    bot.sendMessage(msg.chat.id, `💰 Balance: ${ethBalance} HOOD`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/status/, (msg) => {
  const status = isMinting ? '🟢 Minting in progress' : '⚪ Ready to mint';
  bot.sendMessage(msg.chat.id, status);
});

bot.onText(/\/speed/, (msg) => {
  if (lastMintTime === 0) {
    bot.sendMessage(msg.chat.id, 'No mint history yet');
  } else {
    bot.sendMessage(msg.chat.id, `⚡ Last mint: ${lastMintTime}ms`);
  }
});

bot.onText(/\/mint/, async (msg) => {
  if (isMinting) {
    bot.sendMessage(msg.chat.id, '⏳ Already minting!');
    return;
  }
  
  await executeMint(msg.chat.id);
});

async function executeMint(chatId) {
  try {
    isMinting = true;
    const startTime = Date.now();

    bot.sendMessage(chatId, '⚡ *Minting...* ', { parse_mode: 'Markdown' });
    console.log('⚡ MINT INITIATED');

    // Account from private key
    const account = web3.eth.accounts.privateKeyToAccount(
      process.env.PRIVATE_KEY.startsWith('0x') 
        ? process.env.PRIVATE_KEY 
        : '0x' + process.env.PRIVATE_KEY
    );

    const contract = new web3.eth.Contract(MINT_ABI, process.env.CONTRACT_ADDRESS);

    // Get fresh gas price
    const gasPrice = await web3.eth.getGasPrice();
    console.log(`🔥 Gas Price: ${web3.utils.fromWei(gasPrice, 'gwei')} gwei`);

    // Get fresh nonce (without 'pending' - Robinhood might not support it)
    const nonce = await web3.eth.getTransactionCount(account.address);
    console.log(`📌 Nonce: ${nonce}`);

    // Build transaction
    const tx = {
      from: account.address,
      to: process.env.CONTRACT_ADDRESS,
      data: contract.methods.mint().encodeABI(),
      gas: 300000,
      maxFeePerGas: Math.floor(gasPrice * 1.5),
      maxPriorityFeePerGas: Math.floor(gasPrice * 0.1),
      nonce: nonce,
      value: web3.utils.toWei(process.env.MINT_VALUE || '0', 'ether')
    };

    // Estimate gas
    try {
      const estimatedGas = await web3.eth.estimateGas(tx);
      tx.gas = Math.ceil(estimatedGas * 1.5);
      console.log(`⛽ Estimated Gas: ${tx.gas}`);
    } catch (e) {
      console.log('⚠️ Gas estimate warning:', e.message);
    }

    console.log('🔐 Signing transaction...');
    const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);

    console.log('🚀 Sending transaction...');
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

    const executionTime = Date.now() - startTime;
    lastMintTime = executionTime;
    isMinting = false;

    console.log(`✅ MINT SUCCESS in ${executionTime}ms`);
    bot.sendMessage(chatId, `✅ Mint success!\n\n📊 Hash: ${receipt.transactionHash}\n⏱️ Time: ${executionTime}ms`);

  } catch (error) {
    isMinting = false;
    console.error('❌ Mint error:', error.message);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}
