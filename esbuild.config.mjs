import { esmLibConfig, buildLibESM } from "@owlprotocol/esbuild-config";

esmLibConfig.target = ["esnext"];
await buildLibESM();
