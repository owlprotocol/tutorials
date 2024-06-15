# Owl Tutorial Template

Welcome to the Owl Protocol tutorial template! This repository is designed to help users quickly test out features and integrate them into their own projects.

## Getting Started

This project uses environment variables to manage API keys and other sensitive information. Create a `.env` file in the root directory with the following content:

```bash
API_KEY_SECRET='your_project_api_key_here'
```

Replace `your_project_api_key_here` with your own API key. You can obtain an API key by signing up for an account on the [Owl Protocol dashboard](https://dashboard.owlprotocol.xyz/).

## Installation

To install the required dependencies, run:

```bash
pnpm install
```

### Running the Project

To start the project, use the following command:

```bash
pnpm start
```

This will execute the `index.ts` file, which includes various imports and configurations from different libraries such as Permissionless, Viem, and OWL Protocol.

### Documentation

For more detailed documentation, please visit the [Owl Protocol Documentation](https://docs.owl.build/).

### License

This project is licensed under the MIT License. See the LICENSE file for details.
