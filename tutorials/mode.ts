// Load environment variables
import dotenv from "dotenv";
dotenv.config();
import { existsSync, writeFileSync } from "fs";

// Viem imports
import {
    Chain,
    createPublicClient,
    formatEther,
    http,
    parseEther,
} from "viem";

// Permissionless imports
import {
    createSmartAccountClient,
} from "permissionless";
import {
    signerToSimpleSmartAccount,
} from "permissionless/accounts";
import {
    ENTRYPOINT_ADDRESS_V07,
} from "permissionless/utils";

// Owl Protocol imports
import { transfer, balanceOf, allowance, approve  } from "@owlprotocol/contracts-diamond/artifacts/IERC20";
import { mainnet, sepolia, mode, modeTestnet  } from "@owlprotocol/chains";
import { createOwlPublicClient, createOwlBundlerClient, createOwlPaymasterClient, createUserManagedAccount, getBundlerUrl, getPublicUrl } from "@owlprotocol/clients";
import { createClient } from "@owlprotocol/core-trpc";
import { topupAddressL2 } from "@owlprotocol/viem-utils";
import { publicActionsL2, walletActionsL1 } from "viem/op-stack";
import { BaseError, ContractFunctionRevertedError } from 'viem';


//Hello World
console.log("Welcome to Owl Protocol!");

//Create .env file if it doesn't exist
if (!existsSync(".env")) {
    console.debug(".env file did not exist so creating one right now with example envvars. Please add your API_KEY_SECRET to that file.")
    writeFileSync(".env", "API_KEY_SECRET=YOUR_API_KEY_SECRET");
}

//Load API Key from .env file
const { API_KEY_SECRET } = process.env;
if (!API_KEY_SECRET || API_KEY_SECRET === "YOUR_API_KEY_SECRET") {
    throw new Error(
        `API_KEY_SECRET = ${API_KEY_SECRET}! Ensure it's correctly set in your .env file.`
    );
}

/***** Create Clients *****/

// Initialize the Owl Protocol client with your API key
const client = createClient({ apiKey: API_KEY_SECRET });

/***** Create a user *****/
//We use an external id to for idempotence
const user = await client.admin.user.Managed.create.mutate({ externalId: "my-user" });
console.debug(user)


// The id of the blockchain we wish to connect to, replace this with any
// chainId supported by Owl Protocol.

// Mainnet
// const chainL1 = mainnet;
// const chainL2 = mode;

// Testnet
const chainL1 = sepolia;
const chainL2 = modeTestnet;

const chainIdL1 = chainL1.chainId;
const rpcL1 = getPublicUrl({ chainId: chainIdL1 }) //chainL1.rpcUrls.default.http[0];
const blockExplorerL1 = chainL1.blockExplorers?.default.url!

const chainIdL2 = chainL2.chainId;
const rpcL2 = getPublicUrl({ chainId: chainIdL2 }) //chainL2.rpcUrls.default.http[0]
const blockExplorerL2 = chainL2.blockExplorers?.default.url!

// Create public viem client to read data from blockchain
// Learn more at https://viem.sh/docs/clients/public
const publicClientL1 = createPublicClient({ chain: {...chainL1, id: chainIdL1} as Chain, transport: http(rpcL1) })
const publicClientL2 = createPublicClient({ chain: {...chainL2, id: chainIdL2} as Chain, transport: http(rpcL2) }).extend(publicActionsL2())

// Sanity check RPC working
console.debug({ blockHeightL1: await publicClientL1.getBlockNumber(),  blockHeightL2: await publicClientL2.getBlockNumber() })

// Create paymaster viem client to sponsor UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/pimlicoPaymasterClient
const paymasterClientL1 = createOwlPaymasterClient({ chainId: chainIdL1 })
const paymasterClientL2 = createOwlPaymasterClient({ chainId: chainIdL2 })

// Create bundler viem client to submit UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/bundlerClient
const bundlerUrlL1 = getBundlerUrl({ chainId: chainIdL1 })
const bundlerClientL1 = createOwlBundlerClient({ chainId: chainIdL1 })
const bundlerUrlL2 = getBundlerUrl({ chainId: chainIdL2 })
const bundlerClientL2 = createOwlBundlerClient({ chainId: chainIdL2 })

console.debug({ bundlerUrlL1, bundlerUrlL2 })

/***** Create Smart Wallet Owner *****/
// Owner of the smart account
const userId = user.userId;
const owner = await createUserManagedAccount({ apiKey: API_KEY_SECRET, userId })
console.debug(`Externally owned account address: ${blockExplorerL1}/address/${owner.address}`)
console.debug(`Externally owned account address: ${blockExplorerL2}/address/${owner.address}`)

/***** Create Smart Account *****/
// Simple smart account owned by signer
const smartAccountL1 = await signerToSimpleSmartAccount(publicClientL1, {
    signer: owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: ENTRYPOINT_ADDRESS_V07,
})

const smartAccountL2 = await signerToSimpleSmartAccount(publicClientL2, {
    signer: owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: ENTRYPOINT_ADDRESS_V07,
})

console.log(`Smart account address: ${blockExplorerL1}/address/${smartAccountL1.address}`)
console.log(`Smart account address: ${blockExplorerL2}/address/${smartAccountL2.address}`)

/***** Create Smart Account Client *****/
const smartAccountClientL1 = createSmartAccountClient({
    account: smartAccountL1,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    chain: chainL1,
    bundlerTransport: http(bundlerUrlL1),
    middleware: {
        gasPrice: async () => {
            return (await bundlerClientL1.getUserOperationGasPrice()).fast
        },
        sponsorUserOperation: paymasterClientL1.sponsorUserOperation,
    },
    //Extend with L1 actions
}).extend(walletActionsL1())
const smartAccountClientL2 = createSmartAccountClient({
    account: smartAccountL2,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    chain: chainL2,
    bundlerTransport: http(bundlerUrlL2),
    middleware: {
        gasPrice: async () => {
            return (await bundlerClientL2.getUserOperationGasPrice()).fast
        },
        sponsorUserOperation: paymasterClientL2.sponsorUserOperation,
    },
})

async function bridgeEth() {
    const balanceL1Initial = await publicClientL1.getBalance({ address: smartAccountL1.address })

    //Bridge L1 funds to L2
    if (balanceL1Initial === 0n) {
        throw new Error(`Please send 0.1 ETH to ${smartAccountL1.address} on ${chainL1.name} to start the tutorial`)
    }

    //Simple utility to bridge L1 -> L2 to target balance
    //Also see https://viem.sh/op-stack/guides/deposits for more low-level info
    const { balance: balanceL2, l1DepositReceipt, l2DepositReceipt } = await topupAddressL2({
        publicClientL1,
        publicClientL2,
        walletClientL1: smartAccountClientL1,
        address: smartAccountL2.address,
        minBalance: 0n,
        targetBalance: parseEther("0.05")
    })

    if (l1DepositReceipt) {
        console.log(`${chainL1.name} bridge transaction input ${blockExplorerL1}/tx/${l1DepositReceipt.transactionHash}`)
    }
    if (l2DepositReceipt) {
        console.log(`${chainL2.name} bridge transaction output ${blockExplorerL2}/tx/${l2DepositReceipt.transactionHash}`)
    }

    //Updated L1 balance
    const balanceL1 = await publicClientL1.getBalance({ address: smartAccountL1.address })
    console.log(`${chainL1.name} ${smartAccountL1.address} ${formatEther(balanceL1)} ${chainL1.nativeCurrency.name}`)
    console.log(`${chainL2.name} ${smartAccountL2.address} ${formatEther(balanceL2)} ${chainL2.nativeCurrency.name}`)
}


//2. Bridge ERC20
//https://faucet.circle.com/
const L1_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; //"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
//Testnet was deployed using factory
const L2_USDC = "0x514832A97F0b440567055A73fe03AA160017b990" //"0xd988097fb8612cc24eeC14542bC03424c656005f"

//https://docs.mode.network/general-info/mainnet-contract-addresses/l1-l2-contracts
const L1_STANDARD_BRIDGE = "0xbC5C679879B2965296756CD959C3C739769995E2" //0x735aDBbE72226BD52e818E7181953f42E3b0FF21

//hard-coded pre-compile https://docs.optimism.io/chain/addresses#op-mainnet-l2
const L2_OptimismMintableERC20Factory = "0x4200000000000000000000000000000000000012"

//We will be using the same as https://docs.mode.network/tools/bridges programmatically
async function bridgeERC20() {
    // Check balance
    const balanceL1Initial = await publicClientL1.readContract({
        address: L1_USDC,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL1.address]
    })
    if (balanceL1Initial === 0n) {
        throw new Error(`Please send 0.1 USDC (${L1_USDC}) to ${smartAccountL1.address} on ${chainL1.name} to start the tutorial`)
    }

    // Check Allowance & Approve ERC20 for standard bridge
    const amountApproved = await publicClientL1.readContract({
        address: L1_USDC,
        abi: [allowance],
        functionName: "allowance",
        args: [smartAccountL1.address, L1_STANDARD_BRIDGE]
    })
    console.debug(`${amountApproved} (wei) USDC approved to ${L1_STANDARD_BRIDGE} (L1 Bridge)`)

    const amountApprove = 1_000_000n; //1 USDC
    if (amountApproved < amountApprove) {
        const txHashApprove = await smartAccountClientL1.writeContract({
            account: smartAccountL1,
            address: L1_USDC,
            abi: [approve],
            functionName: "approve",
            args: [L1_STANDARD_BRIDGE, amountApprove]
        })
        console.log(`Approving ${amountApprove} (wei) USDC ${blockExplorerL1}/tx/${txHashApprove}`)
        await publicClientL1.waitForTransactionReceipt({ hash: txHashApprove });
    }

    // Bridge to L1 => L2
    // Bridge ERC20
    const balanceL2Initial = await publicClientL2.readContract({
        address: L2_USDC,
        abi: [balanceOf],
        functionName: "balanceOf",
        args: [smartAccountL1.address]
    })
    if (balanceL2Initial === 0n) {
        const abiL1StandardBridge = [{
            inputs: [
                { name: "_localToken", type: "address" },
                {  name: "_remoteToken", type: "address" },
                {  name: "_to", type: "address" },
                {  name: "_amount", type: "uint256" },
                { name: "_minGasLimit", type: "uint32" },
                { name: "_extraData", type: "bytes" }
            ],
            name: "bridgeERC20To",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
        }] as const

        const amountBridge = 100n; //0.1 USDC;
        const args = {
            account: smartAccountL1,
            address: L1_STANDARD_BRIDGE,
            abi: abiL1StandardBridge,
            functionName: "bridgeERC20To",
            args: [L1_USDC, L2_USDC, smartAccountL2.address, amountBridge, 20_000, "0x"]
        }

        try {
            const response = await publicClientL1.simulateContract(args as any);
            const txHashBridge = await smartAccountClientL1.writeContract(response.request);

            /*
            const txHashBridge = await smartAccountClientL1.writeContract({
                address: L1_STANDARD_BRIDGE,
                abi: abiL1StandardBridge,
                functionName: "bridgeERC20To",
                args: [L1_USDC, L2_USDC, smartAccountL2.address, amountBridge, 20_000, "0x"]
            });
            */

            console.log(`Bridging ${amountBridge} (wei) USDC ${blockExplorerL1}/tx/${txHashBridge}`)
            await publicClientL1.waitForTransactionReceipt({ hash: txHashBridge });
        } catch (err) {
            console.debug(err)
                if (err instanceof BaseError) {
                const revertError = err.walk(err => err instanceof ContractFunctionRevertedError)
                if (revertError instanceof ContractFunctionRevertedError) {
                const errorName = revertError.data?.errorName ?? ''
                // do something with `errorName`
                console.debug(revertError)
            }
        }
  }
    }
}

await bridgeERC20()

/***** Submit Dummy Gasless Transaction *****/
// const txHashL1 = await smartAccountClientL1.sendTransaction({
    // to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", //vitalik.eth
    // value: 0n,
    // data: "0x1234",
// })
// console.log(`User operation included: ${blockExplorerL1}/tx/${txHashL1}`)

// const txHashL2 = await smartAccountClientL2.sendTransaction({
    // to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", //vitalik.eth
    // value: 0n,
    // data: "0x1234",
// })
// console.log(`User operation included: ${blockExplorerL2}/tx/${txHashL2}`)

// const MAINNET_USDC = "0xd988097fb8612cc24eeC14542bC03424c656005f";
// const fede = "0xEa5bf2AD6af8168DE10546B3e4D5679bb22305C8"
// const amount = 5_000_000
//
// const txHash = await smartAccountClientL2.writeContract({
    // address: MAINNET_USDC,
    // abi: [transfer],
    // functionName: "transfer",
    // args: [fede, amount]
// })
//
// console.log(`User operation included: ${blockExplorerL2}/tx/${txHash}`)
