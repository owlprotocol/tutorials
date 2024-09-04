import { toFunctionSelector, decodeFunctionData } from 'viem'

//Single swap
const ETH_USDC = "0xbc6511880000000000000000000000004200000000000000000000000000000000000006000000000000000000000000d988097fb8612cc24eec14542bc03424c656005f000000000000000000000000fe732ca712c695ee14a8a015e65997dd9189c31b00000000000000000000000000000000000000000000000000000191adea7b2e0000000000000000000000000000000000000000000000000011c37937e080000000000000000000000000000000000000000000000000000000000000bad1710000000000000000000000000000000000000000000000000000000000000000"
//Multi swap
const USDC_ETH_MODE = "0xc04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000fe732ca712c695ee14a8a015e65997dd9189c31b00000000000000000000000000000000000000000000000000000191ae39585800000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000015e987225413f81c54000000000000000000000000000000000000000000000000000000000000003cd988097fb8612cc24eec14542bc03424c656005f4200000000000000000000000000000000000006dfc7c877a950e49d2610114102175a06c2e3167a00000000"

const exactInputSingleAbi = [{
        "inputs": [
            {
                "components": [
                    {
                        "internalType": "address",
                        "name": "tokenIn",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "tokenOut",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "recipient",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "deadline",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "amountIn",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "amountOutMinimum",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint160",
                        "name": "limitSqrtPrice",
                        "type": "uint160"
                    }
                ],
                "internalType": "struct ISwapRouter.ExactInputSingleParams",
                "name": "params",
                "type": "tuple"
            }
        ],
        "name": "exactInputSingle",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountOut",
                "type": "uint256"
            }
        ],
        "stateMutability": "payable",
        "type": "function"
    }] as const

console.debug(toFunctionSelector(exactInputSingleAbi[0]))
console.debug(decodeFunctionData({  abi: exactInputSingleAbi, data: ETH_USDC}))

const WETH = "0x4200000000000000000000000000000000000006"
