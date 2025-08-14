import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: { chainId: 1337 },
        localhost: { url: "http://127.0.0.1:8545", chainId: 1337 },

        // Sepolia Testnet (Alchemy)
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/your-sepolia-api-key",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 11155111,
            gasPrice: "auto",
            gas: "auto",
        },

        // zkSync Mainnet (Alchemy)
        zksync: {
            url: process.env.ZKSYNC_RPC_URL || "https://zksync-mainnet.g.alchemy.com/v2/your-zksync-api-key",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 324,
            gasPrice: "auto",
            gas: "auto",
        },

        // Mainnet (optional - for reference)
        mainnet: {
            url: process.env.MAINNET_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/your-mainnet-api-key",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 1,
            gasPrice: "auto",
            gas: "auto",
        },
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: "USD",
        gasPrice: 20,
    },
    etherscan: {
        apiKey: {
            sepolia: process.env.ETHERSCAN_API_KEY || "",
            mainnet: process.env.ETHERSCAN_API_KEY || "",
        },
    },
};

export default config;
