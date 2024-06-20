# Owl Tutorial Template

Welcome to the Owl Protocol tutorial template! This repository is designed to help users quickly test out features and integrate them into their own projects.

## Getting Started

This project uses environment variables to manage API keys and other sensitive information. Create a `.env` file in the root directory with the following content:

```bash
API_KEY_SECRET="YOUR_API_KEY_SECRET"
```

Replace `YOUR_API_KEY_SECRET` with your own API key. You can obtain an API key by signing up for an account on [owl.build](https://owl.build).

## Installation

To install the required dependencies, run:

```bash
pnpm install
```

### Running the Project

To start run your script, use the following command:

```bash
pnpm start
```

This will execute the [index.ts](./index.ts) file, which includes various imports and configurations from different libraries such as Permissionless, Viem, and OWL Protocol.

### Documentation

For more detailed documentation, please visit [docs.owl.build](https://docs.owl.build/).

### Tutorials
We recommend following along the tutorials by pasting in the snippets as you go into the [index.ts](./index.ts) file. However, you can also find the combined code of each tutorial under [./tutorials](./tutorials/) and run those directly using `tsx src/gasless-transactions.ts`. You may need to install `tsx` globally with `pnpm -g tsx` to run this.

### License

This project is licensed under the MIT License. See the LICENSE file for details.
