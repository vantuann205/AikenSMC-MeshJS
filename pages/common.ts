import {
  BlockfrostProvider,
  MeshTxBuilder,
  serializePlutusScript,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-cst";

const blockchainProvider = new BlockfrostProvider("preprodMocjU0xsBBRrDqhzCADAzEJWH7hXirlh");

export function getScript(
  blueprintCompiledCode: string,
  params: string[] = [],
  version: "V1" | "V2" | "V3" = "V3"
) {
  const scriptCbor = applyParamsToScript(blueprintCompiledCode, params);
  const scriptAddr = serializePlutusScript(
    { code: scriptCbor, version: version },
    undefined,
    0
  ).address;
  return { scriptCbor, scriptAddr };
}

export function getTxBuilder() {
  return new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
  });
}

export async function getUtxoByTxHash(txHash: string): Promise<UTxO> {
  const utxos = await blockchainProvider.fetchUTxOs(txHash);
  if (utxos.length === 0) {
    throw new Error("UTxO not found");
  }
  return utxos[0];
}