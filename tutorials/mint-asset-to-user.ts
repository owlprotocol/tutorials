// Load environment variables
import dotenv from "dotenv";
dotenv.config();
import { existsSync, writeFileSync } from "fs";
// Owl Protocol imports
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


// Initialize the Owl Protocol client with your API key
const client = createClient({ apiKey: API_KEY_SECRET });

/***** Create a user *****/
const user = await client.projectUser.createOrSet.mutate({
    email: "leo@owlprotocol.xyz", //Owl Protocol CEO (Send me something cool!)
});

/***** Get a user ******/
const userExisting = await client.projectUser.get.query({
    chainId: 150150, //this won't be required soon
    email: "leo@owlprotocol.xyz",
});
console.debug(`User ${userExisting.email} has smart account ${userExisting.safeAddress}`)

/***** Launch a collection *****/
// The id of the blockchain we wish to connect to, replace this with any
// chainId supported by Owl Protocol.
const chainId = 150150;
const contract = await client.collection.deploy.mutate({
    name: "My Collection",
    symbol: "MYC",
    chainId
    // Add other optional parameters
});

/***** Mint Asset to User *****/
const image = "https://picsum.photos/200"; // Replace with your image. Make sure the image is properly hosted online.

await client.collection.erc721AutoId.mintBatch.mutate({
    chainId,
    address: contract.contractAddress,
    to: [user.email],
    metadata: {
        name: "NFT #1",
        description: "This was so easy!",
        image,
    },
});
