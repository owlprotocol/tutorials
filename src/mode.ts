/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
// Load environment variables
import dotenv from "dotenv";
dotenv.config();

// Viem imports
import {
    Account,
    Address,
    Chain,
    createPublicClient,
    formatEther,
    http,
    parseEther,
    PublicClient,
    encodeFunctionData,
    Hex,
} from "viem";

// Permissionless imports
import { createSmartAccountClient } from "permissionless";
import type { SmartAccountClient } from "permissionless";
import { signerToSimpleSmartAccount } from "permissionless/accounts";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless/utils";

// Owl Protocol imports
import { balanceOf, allowance, approve } from "@owlprotocol/contracts-diamond/artifacts/IERC20";
import { mainnet, sepolia, mode, modeTestnet } from "@owlprotocol/chains";
import {
    createOwlBundlerClient,
    createOwlPaymasterClient,
    createUserManagedAccount,
    getBundlerUrl,
    getPublicUrl,
} from "@owlprotocol/clients";
import { createClient } from "@owlprotocol/core-trpc";
import { topupAddressL2 } from "@owlprotocol/viem-utils";
import { publicActionsL2, walletActionsL1 } from "viem/op-stack";
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types";
import { existsSync, writeFileSync } from "fs";
import { SwapRouterAbi } from "./abis/SwapRouter.js";

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
const client = createClient({ apiKey: API_KEY_SECRET });

/***** Create a user *****/
//We use an external id to for idempotence
const user = await client.admin.user.Managed.create.mutate({ externalId: "my-user" });
console.debug(user);

//Run the tutorial in testnet / mainnet mode
const environment: "testnet" | "mainnet" = "testnet";
const config = {
    testnet: {
        chainL1: sepolia,
        chainL2: modeTestnet,
        l1StandardBridge: "0xbC5C679879B2965296756CD959C3C739769995E2", //https://docs.mode.network/general-info/mainnet-contract-addresses/l1-l2-contracts
        USDC_L1: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", //mint some at https://faucet.circle.com/
        USDC_L2: "0x514832A97F0b440567055A73fe03AA160017b990", //deployed using L2_OptimismMintableERC20Factory
        WETH_L2: "0x4200000000000000000000000000000000000006",
        algrebraSwapRouter: null, //kim.exchange not deployed on testnet
    },
    mainnet: {
        chainL1: mainnet,
        chainL2: mode,
        l1StandardBridge: "0x735aDBbE72226BD52e818E7181953f42E3b0FF21",
        USDC_L1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDC_L2: "0xd988097fb8612cc24eeC14542bC03424c656005f",
        WETH_L2: "0x4200000000000000000000000000000000000006",
        algebraSwapRouter: "0xAc48FcF1049668B285f3dC72483DF5Ae2162f7e8",
    },
} as const;

const chainL1 = config[environment].chainL1;
const chainL2 = config[environment].chainL2;

const chainIdL1 = chainL1.chainId;
const rpcL1 = getPublicUrl({ chainId: chainIdL1 }); //chainL1.rpcUrls.default.http[0];
const blockExplorerL1 = chainL1.blockExplorers?.default.url!;

const chainIdL2 = chainL2.chainId;
const rpcL2 = getPublicUrl({ chainId: chainIdL2 }); //chainL2.rpcUrls.default.http[0]
const blockExplorerL2 = chainL2.blockExplorers?.default.url!;

// Create public viem client to read data from blockchain
// Learn more at https://viem.sh/docs/clients/public
const publicClientL1 = createPublicClient({ chain: { ...chainL1, id: chainIdL1 } as Chain, transport: http(rpcL1) });
const publicClientL2 = createPublicClient({
    chain: { ...chainL2, id: chainIdL2 } as Chain,
    transport: http(rpcL2),
}).extend(publicActionsL2());

// Sanity check RPC working
console.debug({
    blockHeightL1: await publicClientL1.getBlockNumber(),
    blockHeightL2: await publicClientL2.getBlockNumber(),
});

// Create paymaster viem client to sponsor UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/pimlicoPaymasterClient
const paymasterClientL1 = createOwlPaymasterClient({ chainId: chainIdL1 });
const paymasterClientL2 = createOwlPaymasterClient({ chainId: chainIdL2 });

// Create bundler viem client to submit UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/bundlerClient
const bundlerUrlL1 = getBundlerUrl({ chainId: chainIdL1 });
const bundlerClientL1 = createOwlBundlerClient({ chainId: chainIdL1 });
const bundlerUrlL2 = getBundlerUrl({ chainId: chainIdL2 });
const bundlerClientL2 = createOwlBundlerClient({ chainId: chainIdL2 });

console.debug({ bundlerUrlL1, bundlerUrlL2 });

/***** Create Smart Wallet Owner *****/
// Owner of the smart account
const userId = user.userId;
const owner = await createUserManagedAccount({ apiKey: API_KEY_SECRET, userId });
console.debug(`Externally owned account address: ${blockExplorerL1}/address/${owner.address}`);
console.debug(`Externally owned account address: ${blockExplorerL2}/address/${owner.address}`);

/***** Create Smart Account *****/
// Simple smart account owned by signer
const smartAccountL1 = await signerToSimpleSmartAccount(publicClientL1, {
    signer: owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: ENTRYPOINT_ADDRESS_V07,
});

const smartAccountL2 = await signerToSimpleSmartAccount(publicClientL2, {
    signer: owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: ENTRYPOINT_ADDRESS_V07,
});

console.log(`Smart account address: ${blockExplorerL1}/address/${smartAccountL1.address}`);
console.log(`Smart account address: ${blockExplorerL2}/address/${smartAccountL2.address}`);

/***** Create Smart Account Client *****/
const smartAccountClientL1: SmartAccountClient<ENTRYPOINT_ADDRESS_V07_TYPE> = createSmartAccountClient({
    account: smartAccountL1,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    chain: chainL1,
    bundlerTransport: http(bundlerUrlL1),
    middleware: {
        gasPrice: async () => {
            return (await bundlerClientL1.getUserOperationGasPrice()).fast;
        },
        sponsorUserOperation: paymasterClientL1.sponsorUserOperation,
    },
    //Extend with L1 actions
}).extend(walletActionsL1());

const smartAccountClientL2: SmartAccountClient<ENTRYPOINT_ADDRESS_V07_TYPE> = createSmartAccountClient({
    account: smartAccountL2,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    chain: chainL2,
    bundlerTransport: http(bundlerUrlL2),
    middleware: {
        gasPrice: async () => {
            return (await bundlerClientL2.getUserOperationGasPrice()).fast;
        },
        sponsorUserOperation: paymasterClientL2.sponsorUserOperation,
    },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function bridgeEth() {
    const balanceL1Initial = await publicClientL1.getBalance({ address: smartAccountL1.address });

    //Bridge L1 funds to L2
    if (balanceL1Initial === 0n) {
        throw new Error(`Please send 0.1 ETH to ${smartAccountL1.address} on ${chainL1.name} to start the tutorial`);
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
        walletClientL1: smartAccountClientL1,
        address: smartAccountL2.address,
        minBalance: 0n,
        targetBalance: parseEther("0.05"),
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function bridgeERC20() {
    const { approval, bridge } = await getBridgeERC20L1toL2Transactions({
        l1Token: config[environment].USDC_L1,
        l2Token: config[environment].USDC_L2,
        amount: 1_000_000n, //1 USDC
        from: smartAccountL1.address,
        /** Network params */
        publicClientL1,
        l1StandardBridge: config[environment].l1StandardBridge,
    });

    const transactions: { to: Address; value: bigint; data: Hex }[] = [];
    if (approval) {
        transactions.push({ to: approval.to, value: 0n, data: approval.data });
    }
    transactions.push({ to: bridge.to, value: 0n, data: bridge.data });

    //TODO: Update viem & pimlico versions for new interface
    return smartAccountClientL1.sendTransactions({
        transactions,
    });
}

export interface AlgebraSwapERC20Params {
    /** Swap params */
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    from: Address;
    recipient?: Address;
    deadline?: bigint;
    /** Network params */
    publicClient: PublicClient;
    algebraSwapRouter: Address;
}
/**
 * Get transactions to swap ERC20 token using Algebra Swap Router
 * @param params
 * @return necessary transactions to complete bridging
 */
export async function getSwapERC20Transactions(params: AlgebraSwapERC20Params): Promise<{
    approval?: { account: Address; to: Address; data: Hex };
    swap: { account: Address; to: Address; data: Hex };
}> {
    const { tokenIn, tokenOut, amountIn, amountOutMinimum, algebraSwapRouter, from, publicClient } = params;
    const recipient = params.recipient ?? from; //default swap to self
    const deadline = params.deadline ?? (Date.now() + 600) * 1000; //default expire in 10min

    // Check Allowance & Approve ERC20 for swap router
    let approval: { account: Address; to: Address; data: Hex } | undefined;
    const amountApproved = await publicClient.readContract({
        address: tokenIn,
        abi: [allowance],
        functionName: "allowance",
        args: [from, algebraSwapRouter],
    });

    if (amountApproved < amountIn) {
        const data = await encodeFunctionData({
            abi: [approve],
            functionName: "approve",
            args: [algebraSwapRouter, amountIn],
        });
        approval = { account: from, to: tokenIn, data };
    }

    const data = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: "exactInputSingle",
        args: [
            {
                tokenIn,
                tokenOut,
                recipient,
                deadline,
                amountIn,
                amountOutMinimum,
                limitSqrtPrice: 0n,
            },
        ],
    });

    return {
        approval,
        swap: {
            account: from,
            to: algebraSwapRouter,
            data,
        },
    };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function swapERC20() {
    const { approval, swap } = await getSwapERC20Transactions({
        /** Swap params */
        tokenIn: config[environment].USDC_L2,
        tokenOut: config[environment].WETH_L2,
        amountIn: 1_000_000n, //1 USDC;
        amountOutMinimum: 0n, //TODO: Get min out value
        from: smartAccountL2.address,
        /** Network params */
        publicClient: publicClientL2,
        //@ts-expect-error
        algebraSwapRouter: config[environment].algebraSwapRouter,
    });

    const transactions: { to: Address; value: bigint; data: Hex }[] = [];
    if (approval) {
        transactions.push({ to: approval.to, value: 0n, data: approval.data });
    }
    transactions.push({ to: swap.to, value: 0n, data: swap.data });

    //TODO: Update viem & pimlico versions for new interface
    return smartAccountClientL1.sendTransactions({
        transactions,
    });
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
async function main() {
    // bridgeEth();
    // bridgeERC20();
    // swapERC20();
}

await main();
