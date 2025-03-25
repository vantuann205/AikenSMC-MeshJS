import {
  BlockfrostProvider,
  MeshTxBuilder,
  serializePlutusScript,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-cst";

const blockchainProvider = new BlockfrostProvider("preprodMocjU0xsBBRrDqhzCADAzEJWH7hXirlh");
// Tạo provider kết nối blockchain Cardano qua Blockfrost, dùng mạng preprod với API key.

export function getScript(
  blueprintCompiledCode: string, // Mã script đã biên dịch từ blueprint
  params: string[] = [],        // Tham số để áp dụng vào script (mặc định rỗng)
  version: "V1" | "V2" | "V3" = "V3" // Phiên bản Plutus (mặc định V3)
) {
  const scriptCbor = applyParamsToScript(blueprintCompiledCode, params); // Tạo mã CBOR từ script và tham số
  const scriptAddr = serializePlutusScript( // Tạo địa chỉ script từ mã CBOR
    { code: scriptCbor, version: version }, // Cấu hình script với mã và phiên bản
    undefined, // Không dùng inline datum (mặc định)
    0         // Không dùng staking (mặc định)
  ).address;
  return { scriptCbor, scriptAddr }; // Trả về mã CBOR và địa chỉ script
}

export function getTxBuilder() {
  return new MeshTxBuilder({ // Tạo đối tượng xây dựng giao dịch
    fetcher: blockchainProvider, // Dùng Blockfrost để lấy dữ liệu blockchain
    submitter: blockchainProvider, // Dùng Blockfrost để gửi giao dịch
  });
}

export async function getUtxoByTxHash(txHash: string): Promise<UTxO> {
  const utxos = await blockchainProvider.fetchUTxOs(txHash); // Lấy danh sách UTxO từ hash giao dịch
  if (utxos.length === 0) { // Nếu không tìm thấy UTxO
    throw new Error("UTxO not found");
  }
  return utxos[0]; // Trả về UTxO đầu tiên trong danh sách
}