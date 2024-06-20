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
// OWL Protocol imports
import { createClient } from "@owlprotocol/core-trpc/client";

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

// Add tutorial snippets below
