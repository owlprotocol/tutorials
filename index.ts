import dotenv from "dotenv";
dotenv.config();
import { writeFileSync } from "fs";
// Permissionless imports
import {
  GetUserOperationReceiptReturnType,
  UserOperation,
  bundlerActions,
  createSmartAccountClient,
  getAccountNonce,
  getSenderAddress,
  getUserOperationHash,
  waitForUserOperationReceipt,
} from "permissionless";
import {
  privateKeyToSafeSmartAccount,
  privateKeyToSimpleSmartAccount,
  signerToSafeSmartAccount,
} from "permissionless/accounts";
import {
  pimlicoBundlerActions,
  pimlicoPaymasterActions,
} from "permissionless/actions/pimlico";
import {
  createPimlicoBundlerClient,
  createPimlicoPaymasterClient,
} from "permissionless/clients/pimlico";
// Viem imports
import {
  Address,
  Hash,
  Hex,
  concat,
  createClient as createViemClient,
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbiItem,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  signMessage,
} from "viem/accounts";
import { lineaTestnet, polygonMumbai, sepolia } from "viem/chains";
// OWL Protocol imports
import { createClient } from "@owlprotocol/core-trpc/client";
import {
  ENTRYPOINT_ADDRESS_V07,
  signUserOperationHashWithECDSA,
} from "permissionless/utils";

const { API_KEY_SECRET } = process.env;

console.log("Welcome to Owl Protocol!");

if (!API_KEY_SECRET) {
  throw new Error(
    "API_KEY_SECRET not found! Ensure it's correctly set in your .env file."
  );
}

const client = createClient({ apiKey: API_KEY_SECRET });
