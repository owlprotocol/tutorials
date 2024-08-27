// Load environment variables
import dotenv from "dotenv";
dotenv.config();
import { existsSync, writeFileSync } from "fs";

// Viem imports
import {
    http,
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
import { transfer  } from "@owlprotocol/contracts-diamond/artifacts/IERC20";
import { mainnet, mode } from "@owlprotocol/chains";
import { createOwlPublicClient, createOwlBundlerClient, createOwlPaymasterClient, createUserManagedAccount, getBundlerUrl } from "@owlprotocol/clients";
import { createClient } from "@owlprotocol/core-trpc";

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
const chainL1 = mainnet;
const chainL2 = mode

const chainIdL1 = chainL1.chainId;
const blockExplorerL1 = chainL1.blockExplorers?.default.url!

const chainIdL2 = chainL2.chainId;
const blockExplorerL2 = chainL2.blockExplorers?.default.url!

// Create public viem client to read data from blockchain
// Learn more at https://viem.sh/docs/clients/public
const publicClientL1 = createOwlPublicClient({ chainId: chainIdL1 })
const publicClientL2 = createOwlPublicClient({ chainId: chainIdL2 })

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
    chain: chainL2,
    bundlerTransport: http(bundlerUrlL1),
    middleware: {
        gasPrice: async () => {
            return (await bundlerClientL1.getUserOperationGasPrice()).fast
        },
        sponsorUserOperation: paymasterClientL1.sponsorUserOperation,
    },
})
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

/***** Submit Dummy Gasless Transaction *****/
// const txHash = await smartAccountClientL2.sendTransaction({
    // to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", //vitalik.eth
    // value: 0n,
    // data: "0x1234",
// })
//
// console.log(`User operation included: ${blockExplorerL2}/tx/${txHash}`)

const MAINNET_USDC = "0xd988097fb8612cc24eeC14542bC03424c656005f";
const fede = "0xEa5bf2AD6af8168DE10546B3e4D5679bb22305C8"
const amount = 5_000_000

const txHash = await smartAccountClientL2.writeContract({
    address: MAINNET_USDC,
    abi: [transfer],
    functionName: "transfer",
    args: [fede, amount]
})

console.log(`User operation included: ${blockExplorerL2}/tx/${txHash}`)
