// Load environment variables
import dotenv from "dotenv";
dotenv.config();
import { existsSync, writeFileSync } from "fs";
// Viem imports
import {
    Hex,
    createPublicClient,
    http,
} from "viem";
import {
    generatePrivateKey,
    privateKeyToAccount,
} from "viem/accounts";
// Permissionless imports
import {
    createBundlerClient,
    createSmartAccountClient,
} from "permissionless";
import {
    signerToSimpleSmartAccount,
} from "permissionless/accounts";
import {
    createPimlicoPaymasterClient,
} from "permissionless/clients/pimlico";
import {
    ENTRYPOINT_ADDRESS_V07,
} from "permissionless/utils";

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
// The id of the blockchain we wish to connect to, replace this with any
// chainId supported by Owl Protocol.
// Here we use the Hedwig Testnet for quick testing
const chain = {
    chainId: 150150,
    slug: "hedwig-testnet",
    name: "Hedwig Testnet",
    testnet: true,
    nativeCurrency: {
        decimals: 18,
        name: 'Ether',
        symbol: 'ETH',
    },
    rpcUrls: {
        default: {
            http: ["https://rpc-hedwig-testnet-6uuksiwu6t.t.conduit.xyz"],
            webSocket: ["wss://rpc-hedwig-testnet-6uuksiwu6t.t.conduit.xyz"],
        },
    },
};
const chainId = 150150;
const blockExplorer = "https://explorer-testnet.hedwig.build"

// Create public viem client to read data from blockchain
// Learn more at https://viem.sh/docs/clients/public
const publicClient = createPublicClient({
    transport: http(`https://api.owl.build/${chainId}/rpc?apikey=${API_KEY_SECRET}`),
})

// Create paymaster viem client to sponsor UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/pimlicoPaymasterClient
const paymasterUrl = `https://api.owl.build/${chainId}/rpc?apikey=${API_KEY_SECRET}`
const paymasterClient = createPimlicoPaymasterClient({
    transport: http(paymasterUrl),
    entryPoint: ENTRYPOINT_ADDRESS_V07,
})

// Create bundler viem client to submit UserOp
// Learn more at https://docs.pimlico.io/permissionless/reference/clients/bundlerClient
const bundlerUrl = `https://api.owl.build/${chainId}/rpc?apikey=${API_KEY_SECRET}`
const bundlerClient = createBundlerClient({
    transport: http(bundlerUrl),
    entryPoint: ENTRYPOINT_ADDRESS_V07,
})

/***** Create Smart Wallet Owner *****/
// Load private key from .env or generate a new one (and save it)
// Warning: Do NOT use such logic in production, for tutorial purposes ONLY
const privateKey =
    (process.env.PRIVATE_KEY as Hex) ??
    (() => {
        const pk = generatePrivateKey()
        writeFileSync(".env", `API_KEY_SECRET=${API_KEY_SECRET}\nPRIVATE_KEY=${pk}`)
        return pk
    })()

// Owner of the smart account
const owner = privateKeyToAccount(privateKey)

/***** Create Smart Account *****/
// Simple smart account owned by signer
const smartAccount = await signerToSimpleSmartAccount(publicClient, {
    signer: owner,
    factoryAddress: "0xe7A78BA9be87103C317a66EF78e6085BD74Dd538", //Simple Smart Account factory
    entryPoint: ENTRYPOINT_ADDRESS_V07,
})

console.log(`Smart account address: ${blockExplorer}/address/${smartAccount.address}`)

/***** Create Smart Account Client *****/
const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    chain,
    bundlerTransport: http(bundlerUrl),
    middleware: {
        gasPrice: async () => {
            return (await bundlerClient.getUserOperationGasPrice()).fast
        },
        sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
})

/***** Submit Gasless Transaction *****/
const txHash = await smartAccountClient.sendTransaction({
    to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", //vitalik.eth
    value: 0n,
    data: "0x1234",
})

console.log(`User operation included: ${blockExplorer}/tx/${txHash}`)
