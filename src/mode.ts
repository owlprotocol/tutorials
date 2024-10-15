/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
// Load environment variables
import dotenv from "dotenv";
dotenv.config();

// Viem imports
import {
    Address,
    Chain,
    createPublicClient,
    formatEther,
    http,
    parseEther,
    PublicClient,
    encodeFunctionData,
    Hex,
    formatUnits,
    WalletClient,
    Transport,
    Account,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";

// Permissionless imports
import { getUserOperationGasPrice } from "permissionless/actions/pimlico";
import { createSmartAccountClient } from "permissionless/clients";
import { toSimpleSmartAccount } from "permissionless/accounts";

// Owl Protocol imports
import { balanceOf, allowance, approve } from "@owlprotocol/contracts-diamond/artifacts/IERC20";
import {
    balancePortfolio,
    getERC20ApprovalTransaction,
    getSwapExactInputTransaction,
} from "@owlprotocol/contracts-algebra-integral";
import { mainnet, sepolia, mode, modeTestnet } from "@owlprotocol/chains";
import {
    createOwlBundlerClient,
    createOwlPaymasterClient,
    createUserManagedAccount,
    getBundlerUrl,
    getPublicUrl,
} from "@owlprotocol/clients";
import { createClient } from "@owlprotocol/core-trpc/client";
import { topupAddressL2 } from "@owlprotocol/viem-utils";
import { publicActionsL2, WalletActionsL1, walletActionsL1 } from "viem/op-stack";
import { existsSync, writeFileSync } from "fs";

//Hello World
console.log("Welcome to Owl Protocol!");

//Create .env file if it doesn't exist
if (!existsSync(".env")) {
    console.debug(
        ".env file did not exist so creating one right now with example envvars. Please add your API_KEY_SECRET to that file.",
    );
    writeFileSync(".env", "API_KEY_SECRET=YOUR_API_KEY_SECRET");
}

//Load API Key from .env file
const { API_KEY_SECRET } = process.env;
if (!API_KEY_SECRET || API_KEY_SECRET === "YOUR_API_KEY_SECRET") {
    throw new Error(`API_KEY_SECRET = ${API_KEY_SECRET}! Ensure it's correctly set in your .env file.`);
}

/***** Create Clients *****/

// Initialize the Owl Protocol client with your API key
const baseUrl = "http://localhost:3000/api";
// const baseUrl = "https://api-staging.owl.build/api";
const trpcUrl = `${baseUrl}/trpc`;

const client = createClient({ apiKey: API_KEY_SECRET }, trpcUrl);

/***** Create a user *****/
//We use an external id to for idempotence
const user = await client.admin.user.Managed.create.mutate({ externalId: "my-user" });
console.debug(user);

//Run the tutorial in testnet / mainnet mode
const environment: "testnet" | "mainnet" = "mainnet";
const config = {
    testnet: {
        chainL1: { ...sepolia, id: sepolia.chainId },
        chainL2: { ...modeTestnet, id: modeTestnet.chainId },
        l1StandardBridge: "0xbC5C679879B2965296756CD959C3C739769995E2", //https://docs.mode.network/general-info/mainnet-contract-addresses/l1-l2-contracts
        USDC_L1: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", //mint some at https://faucet.circle.com/
        USDC_L2: "0x514832A97F0b440567055A73fe03AA160017b990", //deployed using L2_OptimismMintableERC20Factory
        MODE_L2: "0x0000000000000000000000000000000000000000", //unknown
        WETH_L2: "0x4200000000000000000000000000000000000006",
        //kim.exchange not deployed on testnet
        poolInitCodeHash: "0x" as Hex,
        poolDeployer: "0x0000000000000000000000000000000000000000",
        swapRouter: "0x0000000000000000000000000000000000000000",
        quoterV2: "0x0000000000000000000000000000000000000000",
    },
    mainnet: {
        chainL1: { ...mainnet, id: mainnet.chainId },
        chainL2: { ...mode, id: mode.chainId },
        l1StandardBridge: "0x735aDBbE72226BD52e818E7181953f42E3b0FF21",
        USDC_L1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDC_L2: "0xd988097fb8612cc24eeC14542bC03424c656005f",
        MODE_L2: "0xDfc7C877a950e49D2610114102175A06C2e3167a",
        WETH_L2: "0x4200000000000000000000000000000000000006",
        poolInitCodeHash: "0xf96d2474815c32e070cd63233f06af5413efc5dcb430aee4ff18cc29007c562d" as Hex,
        poolDeployer: "0x6414A461B19726410E52488d9D5ff33682701635",
        quoterV2: "0x7c5aaa464f736740156fd69171505d344855d1e5",
        swapRouter: "0xAc48FcF1049668B285f3dC72483DF5Ae2162f7e8",
    },
} as const;

// constants
const {
    chainL1,
    chainL2,
    l1StandardBridge,
    USDC_L1,
    USDC_L2,
    MODE_L2,
    WETH_L2,
    poolInitCodeHash,
    poolDeployer,
    quoterV2,
    swapRouter,
} = config[environment];

// clients
const chainIdL1 = chainL1.chainId;
const rpcL1 = getPublicUrl({ chainId: chainIdL1, baseUrl }); //chainL1.rpcUrls.default.http[0];
const blockExplorerL1 = chainL1.blockExplorers?.default.url!;

const chainIdL2 = chainL2.chainId;
const rpcL2 = getPublicUrl({ chainId: chainIdL2, baseUrl }); //chainL2.rpcUrls.default.http[0]
const blockExplorerL2 = chainL2.blockExplorers?.default.url!;

// Create public viem client to read data from blockchain
// Learn more at https://viem.sh/docs/clients/public
const publicClientL1 = createPublicClient({ chain: chainL1 as Chain, transport: http(rpcL1) });
const publicClientL2 = createPublicClient({
    chain: chainL2 as Chain,
    transport: http(rpcL2),
}).extend(publicActionsL2());

// Sanity check RPC working
console.debug({
    blockHeightL1: await publicClientL1.getBlockNumber(),
    blockHeightL2: await publicClientL2.getBlockNumber(),
});

// Create paymaster viem client to sponsor UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/pimlicoPaymasterClient
const paymasterClientL1 = createOwlPaymasterClient({ chainId: chainIdL1, baseUrl });
const paymasterClientL2 = createOwlPaymasterClient({ chainId: chainIdL2, baseUrl });

// Create bundler viem client to submit UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/bundlerClient
const bundlerUrlL1 = getBundlerUrl({ chainId: chainIdL1, baseUrl });
const bundlerClientL1 = createOwlBundlerClient({ chainId: chainIdL1, baseUrl });
const bundlerUrlL2 = getBundlerUrl({ chainId: chainIdL2, baseUrl });
const bundlerClientL2 = createOwlBundlerClient({ chainId: chainIdL2, baseUrl });

/***** Create Smart Wallet Owner *****/
// Owner of the smart account
const userId = user.userId;
const owner = await createUserManagedAccount({ apiKey: API_KEY_SECRET, userId, owlApiRestBaseUrl: baseUrl });
console.debug(`Externally owned account address: ${blockExplorerL1}/address/${owner.address}`);
console.debug(`Externally owned account address: ${blockExplorerL2}/address/${owner.address}`);

/***** Create Smart Account *****/
// Simple smart account owned by signer
const smartAccountL1 = await toSimpleSmartAccount({
    client: publicClientL1,
    owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
    },
});

const smartAccountL2 = await toSimpleSmartAccount({
    client: publicClientL2,
    owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
    },
});

console.log(`Smart account address: ${blockExplorerL1}/address/${smartAccountL1.address}`);
console.log(`Smart account address: ${blockExplorerL2}/address/${smartAccountL2.address}`);

/***** Create Smart Account Client *****/
const smartAccountClientL1 = createSmartAccountClient({
    account: smartAccountL1,
    chain: chainL1 as Chain,
    bundlerTransport: http(bundlerUrlL1),
    paymaster: paymasterClientL1,
    userOperation: {
        estimateFeesPerGas: async () => {
            return (await getUserOperationGasPrice(bundlerClientL1)).fast;
        },
    },
    //Extend with L1 actions
}).extend(walletActionsL1());

const smartAccountClientL2 = createSmartAccountClient({
    account: smartAccountL2,
    chain: chainL2 as Chain,
    bundlerTransport: http(bundlerUrlL2),
    paymaster: paymasterClientL2,
    userOperation: {
        estimateFeesPerGas: async () => {
            return (await getUserOperationGasPrice(bundlerClientL2)).fast;
        },
    },
});

export async function bridgeEthTutorial({ amount }: { amount: bigint }) {
    const balanceL1Initial = await publicClientL1.getBalance({ address: smartAccountL1.address });
    const balanceL2Initial = await publicClientL2.getBalance({ address: smartAccountL2.address });

    if (balanceL2Initial > 0n) {
        //bridgeEthTutorial was completed
        console.log(
            `${chainL1.name} ${smartAccountL1.address} ${formatEther(balanceL1Initial)} ${chainL1.nativeCurrency.name}`,
        );
        console.log(
            `${chainL2.name} ${smartAccountL2.address} ${formatEther(balanceL2Initial)} ${chainL2.nativeCurrency.name}`,
        );
        return;
    }

    //Bridge L1 funds to L2
    if (balanceL1Initial === 0n) {
        throw new Error(
            `Please send ${formatEther(amount + parseEther("0.001"))} ETH to ${smartAccountL1.address} on ${
                chainL1.name
            } to start the tutorial`,
        );
    }

    //Simple utility to bridge L1 -> L2 to target balance
    //Also see https://viem.sh/op-stack/guides/deposits for more low-level info
    const {
        balance: balanceL2,
        l1DepositReceipt,
        l2DepositReceipt,
    } = await topupAddressL2({
        publicClientL1,
        publicClientL2,
        walletClientL1: smartAccountClientL1 as unknown as WalletClient<Transport, Chain, Account> &
            WalletActionsL1<Chain, Account>,
        address: smartAccountL2.address,
        minBalance: 0n,
        targetBalance: amount,
        l1Gas: null,
    });

    if (l1DepositReceipt) {
        console.log(
            `${chainL1.name} bridge transaction input ${blockExplorerL1}/tx/${l1DepositReceipt.transactionHash}`,
        );
    }
    if (l2DepositReceipt) {
        console.log(
            `${chainL2.name} bridge transaction output ${blockExplorerL2}/tx/${l2DepositReceipt.transactionHash}`,
        );
    }

    //Updated L1 balance
    const balanceL1 = await publicClientL1.getBalance({ address: smartAccountL1.address });
    console.log(`${chainL1.name} ${smartAccountL1.address} ${formatEther(balanceL1)} ${chainL1.nativeCurrency.name}`);
    console.log(`${chainL2.name} ${smartAccountL2.address} ${formatEther(balanceL2)} ${chainL2.nativeCurrency.name}`);
}

//2. Bridge ERC20
//We will be using the same as https://docs.mode.network/tools/bridges programmatically
export interface BridgeERC20L1toL2Params {
    /** Bridge params */
    l1Token: Address;
    l2Token: Address;
    amount: bigint;
    from: Address;
    to?: Address;
    /** Network params */
    publicClientL1: PublicClient;
    l1StandardBridge: Address;
}

/**
 * Get transactions to bridge ERC20 token from optimism L1 to L2
 * @param params
 * @return necessary transactions to complete bridging
 */
export async function getBridgeERC20L1toL2Transactions(params: BridgeERC20L1toL2Params): Promise<{
    approval?: { account: Address; to: Address; data: Hex };
    bridge: { account: Address; to: Address; data: Hex };
}> {
    const { from, l1Token, l2Token, amount, publicClientL1, l1StandardBridge } = params;
    const to = params.to ?? from; //default bridge to self

    // Check balance
    const balanceL1 = await publicClientL1.readContract({
        address: l1Token,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [from],
    });
    if (balanceL1 < amount) {
        throw new Error(`${from} has insufficient ${l1Token} token balance ${balanceL1} < ${amount}`);
    }

    // Check Allowance & Approve ERC20 for standard bridge
    let approval: { account: Address; to: Address; data: Hex } | undefined;
    const amountApproved = await publicClientL1.readContract({
        address: l1Token,
        abi: [allowance],
        functionName: "allowance",
        args: [from, l1StandardBridge],
    });

    if (amountApproved < amount) {
        const data = await encodeFunctionData({
            abi: [approve],
            functionName: "approve",
            args: [l1StandardBridge, amount],
        });
        approval = { account: from, to: l1Token, data };
    }

    // Bridge to L1 => L2
    // Bridge ERC20
    const bridgeERC20ToAbi = [
        {
            inputs: [
                { name: "_localToken", type: "address" },
                { name: "_remoteToken", type: "address" },
                { name: "_to", type: "address" },
                { name: "_amount", type: "uint256" },
                { name: "_minGasLimit", type: "uint32" },
                { name: "_extraData", type: "bytes" },
            ],
            name: "bridgeERC20To",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
        },
    ] as const;

    const data = encodeFunctionData({
        abi: bridgeERC20ToAbi,
        functionName: "bridgeERC20To",
        args: [l1Token, l2Token, to, amount, 20_000, "0x"],
    });

    return {
        approval,
        bridge: {
            account: from,
            to: l1StandardBridge,
            data,
        },
    };
}

export async function bridgeUSDCTutorial({ amount }: { amount: bigint }) {
    const l1Token = USDC_L1;
    const l2Token = USDC_L2;

    const balanceL1Initial = await publicClientL1.readContract({
        address: l1Token,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL1.address],
    });
    const balanceL2Initial = await publicClientL2.readContract({
        address: l2Token,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL2.address],
    });

    if (balanceL2Initial > 0n) {
        //bridgeUSDCTutorial was completed
        console.log(`${chainL1.name} ${smartAccountL1.address} ${balanceL1Initial / 1_000_000n} USDC`);
        console.log(`${chainL2.name} ${smartAccountL2.address} ${balanceL2Initial / 1_000_000n} USDC`);
        return;
    }

    //Bridge L1 USDC funds to L2
    if (balanceL1Initial === 0n) {
        throw new Error(
            `Please send ${amount / 1_000_000n} USDC to ${smartAccountL1.address} on ${
                chainL1.name
            } to start the tutorial`,
        );
    }

    const { approval, bridge } = await getBridgeERC20L1toL2Transactions({
        l1Token,
        l2Token,
        amount,
        from: smartAccountL1.address,
        /** Network params */
        publicClientL1,
        l1StandardBridge,
    });

    const transactions: { to: Address; value: bigint; data: Hex }[] = [];
    if (approval) {
        transactions.push({ to: approval.to, value: 0n, data: approval.data });
    }
    transactions.push({ to: bridge.to, value: 0n, data: bridge.data });

    const hash = await smartAccountClientL1.sendTransaction({
        calls: transactions,
    });

    console.log(`${chainL1.name} -> ${chainL2.name} bridge USDC transaction ${blockExplorerL1}/tx/${hash}`);

    //Updated L1 balance
    const balanceL1 = await publicClientL1.readContract({
        address: l1Token,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL1.address],
    });
    const balanceL2 = await publicClientL2.readContract({
        address: l2Token,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL2.address],
    });
    console.log(`${chainL1.name} ${smartAccountL1.address} ${balanceL1 / 1_000_000n} USDC`);
    console.log(`${chainL2.name} ${smartAccountL2.address} ${balanceL2 / 1_000_000n} USDC`);
}

export async function swapERC20Tutorial({ amount }: { amount: bigint }) {
    const balanceL2Initial = await publicClientL2.readContract({
        address: USDC_L2,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL2.address],
    });
    if (balanceL2Initial < amount) {
        throw new Error(`Please complete the bridgeUSDCTutorial first`);
    }

    const { transaction: approval } = await getERC20ApprovalTransaction({
        publicClient: publicClientL2,
        address: USDC_L2,
        owner: smartAccountL2.address,
        spender: swapRouter,
        amount,
    });
    const swap = getSwapExactInputTransaction({
        path: [USDC_L2, WETH_L2],
        amountIn: amount,
        amountOutMinimum: 0n,
        recipient: smartAccountL2.address,
        swapRouter,
        weth: WETH_L2,
    });

    const transactions: { to: Address; value: bigint; data: Hex }[] = [];
    if (approval) {
        transactions.push(approval);
    }
    transactions.push(swap);

    const hash = await smartAccountClientL2.sendTransaction({
        calls: transactions,
    });

    console.log(`${chainL2.name} USDC/WETH swap transaction ${blockExplorerL2}/tx/${hash}`);
}

export async function balancePortfolioTutorial() {
    //TODO: bruteforce if some combinatiosn of weights break?
    //Note: Slippage can impact success / failure of trade
    const portfolio = await balancePortfolio({
        publicClient: publicClientL2,
        quoterV2,
        poolInitCodeHash,
        poolDeployer,
        swapRouter,
        account: smartAccountL2.address,
        assets: [
            { address: USDC_L2, weight: 1 },
            { address: WETH_L2, weight: 0 },
            { address: MODE_L2, weight: 0 },
        ],
        slippagePercent: 2,
    });

    const symbol = "ETH";
    const units = 18;

    console.debug(portfolio);
    console.debug(`Total Holding Value ${symbol} ${formatUnits(portfolio.totalValue, units)}`);
    console.debug(`Total Trade Value ${symbol} ${formatUnits(portfolio.totalTradeValue, units)}`);

    return portfolio;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
async function main() {
    //~2$ worth of Eth
    // bridgeEthTutorial({ amount: parseEther("0.001") });
    // 1 USDC
    // bridgeUSDCTutorial({ amount: 1_000_000n });
    // Swap USDC for ETH
    // swapERC20Tutorial({ amount: 1_000_000n });
    // Balance portfolio
    const portfolio = await balancePortfolioTutorial();

    const hash = await smartAccountClientL2.sendTransaction({
        calls: portfolio.transactions,
    });
    console.debug({ hash });

    const receipt = await publicClientL2.waitForTransactionReceipt({ hash });
    console.debug({ receipt });
}

await main();
