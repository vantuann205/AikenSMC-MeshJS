import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useWallet } from "@meshsdk/react";
import { CardanoWallet } from "@meshsdk/react";
import { Asset } from "@meshsdk/core";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import {
  mConStr0,
} from "@meshsdk/core";
import {
  deserializeAddress,
  ConStr0,
  Integer,
  BuiltinByteString,
  deserializeDatum,
  unixTimeToEnclosingSlot,
  SLOT_CONFIG_NETWORK,
} from "@meshsdk/core";
import { getScript, getTxBuilder, getUtxoByTxHash } from "./common"; // Import từ common
import blueprint from "../vesting-smc/plutus.json"; // Blueprint của vesting.ak
import styles from "../styles/index.module.css";
export type VestingDatum = ConStr0<
  [Integer, BuiltinByteString, BuiltinByteString]
>; // Định nghĩa kiểu dữ liệu Datum: [lock_until (Int), owner (ByteString), beneficiary (ByteString)]

const VestingPage: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet(); // Lấy thông tin ví từ MeshSDK
  const [walletAddress, setWalletAddress] = useState<string>(""); // Địa chỉ ví
  const [txHash, setTxHash] = useState<string>(""); // Hash giao dịch khóa
  const [unlockTxHash, setUnlockTxHash] = useState<string>(""); // Hash giao dịch mở khóa
  const [inputTxHash, setInputTxHash] = useState<string>(""); // Hash giao dịch cần mở khóa
  const [adaAmount, setAdaAmount] = useState<string>("10"); // Số ADA muốn khóa, mặc định 10
  const [lockupMinutes, setLockupMinutes] = useState<string>("1"); // Thời gian khóa (phút), mặc định 1
  const [loading, setLoading] = useState<boolean>(false); // Trạng thái đang xử lý
  const [status, setStatus] = useState<string>(""); // Thông báo trạng thái

  useEffect(() => { // Cập nhật địa chỉ ví khi kết nối thay đổi
    const fetchWalletAddress = async () => {
      if (connected && wallet) {
        const address = await wallet.getChangeAddress(); // Lấy địa chỉ ví
        setWalletAddress(address);
      } else { // Reset khi ngắt kết nối
        setWalletAddress("");
        setTxHash("");
        setUnlockTxHash("");
        setInputTxHash("");
        setAdaAmount("10");
        setLockupMinutes("1");
        setStatus("");
      }
    };
    fetchWalletAddress();
  }, [connected, wallet]);

  const handleCopy = (text: string) => { // Xử lý sao chép văn bản
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    setTimeout(() => setStatus(""), 2000); // Xóa thông báo sau 2 giây
  };

  async function lockVesting(adaAmount: string, lockupMinutes: number) { // Hàm khóa ADA vào script
    try {
      setLoading(true);
      setStatus("Đang khởi tạo giao dịch khóa vesting...");

      const lovelaceAmount = (parseFloat(adaAmount) * 1000000).toString(); // Chuyển ADA thành lovelace
      if (isNaN(parseFloat(adaAmount)) || parseFloat(adaAmount) <= 0) { // Kiểm tra ADA hợp lệ
        throw new Error("Vui lòng nhập số lượng ADA hợp lệ");
      }

      const assets: Asset[] = [{ unit: "lovelace", quantity: lovelaceAmount }]; // Tạo danh sách tài sản (ADA)
      const utxos = await wallet.getUtxos(); // Lấy UTxO từ ví
      const walletAddress = (await wallet.getUsedAddresses())[0]; // Lấy địa chỉ ví
      const { scriptAddr } = getScript(blueprint.validators[0].compiledCode); // Lấy địa chỉ script
      const beneficiary = "addr_test1qp86eqd482yd8pacaalewzw7zcjtmvfjjqyhndjm63pdsxqshq0ck5lz8jmcnsgkd39tgh7c2tsf6vd0pxc6w2wlth6q9hu0h9"; // Địa chỉ người thụ hưởng
      const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress); // Hash khóa công khai của chủ sở hữu
      const { pubKeyHash: beneficiaryPubKeyHash } = deserializeAddress(beneficiary); // Hash khóa công khai của người thụ hưởng
      const currentTime = Date.now(); // Thời gian hiện tại (ms)
      const lockupTime = lockupMinutes * 60 * 1000; // Chuyển phút thành milliseconds
      const lockUntil = currentTime + lockupTime; // Thời gian khóa (ms)

      const txBuilder = getTxBuilder(); // Khởi tạo builder giao dịch
      await txBuilder
        .txOut(scriptAddr, assets) // Gửi ADA đến script
        .txOutInlineDatumValue(mConStr0([lockUntil, ownerPubKeyHash, beneficiaryPubKeyHash])) // Gắn datum inline
        .changeAddress(walletAddress) // Địa chỉ nhận tiền thừa
        .selectUtxosFrom(utxos) // Chọn UTxO để tiêu
        .setNetwork("preprod") // Đặt mạng preprod
        .complete();

      const unsignedTx = txBuilder.txHex; // Lấy giao dịch chưa ký
      const signedTx = await wallet.signTx(unsignedTx); // Ký giao dịch
      const newTxHash = await wallet.submitTx(signedTx); // Gửi giao dịch

      setTxHash(newTxHash);
      setStatus(`Khóa vesting thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Lock Vesting Error:", error);
      setStatus(`Lỗi khi khóa vesting: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function unlockVesting(txHashToUnlock: string) { // Hàm mở khóa ADA từ script
    try {
      setLoading(true);
      setStatus("Đang mở khóa vesting...");

      const utxo = await getUtxoByTxHash(txHashToUnlock); // Lấy UTxO từ hash giao dịch
      const utxos = await wallet.getUtxos(); // Lấy UTxO từ ví
      const walletAddress = (await wallet.getUsedAddresses())[0]; // Lấy địa chỉ ví
      const collateral = (await wallet.getCollateral())[0]; // Lấy collateral
      if (!collateral) throw new Error("Không tìm thấy collateral.");

      const datum = deserializeDatum<VestingDatum>(utxo.output.plutusData!); // Giải mã datum từ UTxO
      const lockUntil = datum.fields[0].int as number; // Lấy lock_until từ datum (ms)
      const { scriptCbor } = getScript(blueprint.validators[0].compiledCode); // Lấy mã script CBOR

      const currentTime = Date.now(); // Thời gian hiện tại (ms)
      const currentSlot = unixTimeToEnclosingSlot(currentTime, SLOT_CONFIG_NETWORK.preprod) + 90; // Chuyển thời gian hiện tại thành slot
      const lockUntilSlot = unixTimeToEnclosingSlot(lockUntil, SLOT_CONFIG_NETWORK.preprod); // Chuyển lock_until thành slot

      const { pubKeyHash: signerPubKeyHash } = deserializeAddress(walletAddress); // Hash khóa công khai của người ký

      if (currentTime <= lockUntil) { // Kiểm tra thời gian hiện tại có vượt qua lock_until chưa
        throw new Error(`Chưa đến thời gian mở khóa! Lock until: ${new Date(lockUntil).toLocaleString()}`);
      }

      console.log("Current Time:", new Date(currentTime).toLocaleString());
      console.log("Lock Until:", new Date(lockUntil).toLocaleString());
      console.log("Current Slot:", currentSlot);
      console.log("Lock Until Slot:", lockUntilSlot);
      console.log("Signer:", signerPubKeyHash);

      const txBuilder = getTxBuilder(); // Khởi tạo builder giao dịch
      await txBuilder
        .spendingPlutusScript("V3") // Sử dụng Plutus V3
        .txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address) // Tiêu UTxO từ script
        .spendingReferenceTxInInlineDatumPresent() // Xác nhận datum inline có sẵn
        .spendingReferenceTxInRedeemerValue(mConStr0([])) // Redeemer rỗng (unit)
        .txInScript(scriptCbor) // Gắn script
        .invalidBefore(lockUntilSlot) // Giao dịch không hợp lệ trước slot của lock_until (lower bound)
        .invalidHereafter(currentSlot + 86400) // Giao dịch không hợp lệ sau slot hiện tại + 300 ~ 1 day 1s ~ 1 (upper bound)
        .requiredSignerHash(signerPubKeyHash) // Yêu cầu chữ ký từ người ký
        .changeAddress(walletAddress) // Địa chỉ nhận tiền
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address) // Gắn collateral
        .selectUtxosFrom(utxos) // Chọn UTxO để tiêu
        .setNetwork("preprod") // Đặt mạng preprod
        .complete();

      const unsignedTx = txBuilder.txHex; // Lấy giao dịch chưa ký
      console.log("Unsigned Tx:", unsignedTx);
      const signedTx = await wallet.signTx(unsignedTx); // Ký giao dịch
      console.log("Signed Tx:", signedTx);
      const newTxHash = await wallet.submitTx(signedTx); // Gửi giao dịch

      setUnlockTxHash(newTxHash);
      setStatus(`Mở khóa thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Unlock Vesting Error:", error);
      setStatus(`Lỗi khi mở khóa: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Vesting Contract</h1>
      {!connected && (
        <div className={styles.walletWrapper}>
          <CardanoWallet />
        </div>
      )}
      {connected && (
        <>
          <div className={styles.addressContainer}>
            <p className={styles.txHash}>
              Địa chỉ ví: {walletAddress.slice(0, 6)}...{walletAddress.slice(-6)}
            </p>
            <CopyToClipboard text={walletAddress} onCopy={() => handleCopy(walletAddress)}>
              <span className={styles.copyIcon}>
                <FaCopy />
              </span>
            </CopyToClipboard>
          </div>
          <button
            className={styles.actionButton}
            onClick={async () => {
              try {
                await disconnect();
                setStatus("Ngắt kết nối ví thành công.");
              } catch (error) {
                console.error("Disconnect Error:", error);
                setStatus("Không thể ngắt kết nối ví.");
              }
            }}
          >
            Ngắt kết nối ví
          </button>

          <h2 className={styles.subtitle}>Khóa tiền (Vesting)</h2>
          <div className={styles.inputButtonContainer}>
            <input
              className={styles.txInput}
              type="number"
              step="0.1"
              min="0.1"
              placeholder="Nhập số lượng ADA"
              value={adaAmount}
              onChange={(e) => setAdaAmount(e.target.value)}
            />
            <input
              className={styles.txInput}
              type="number"
              min="1"
              placeholder="Thời gian khóa (phút)"
              value={lockupMinutes}
              onChange={(e) => setLockupMinutes(e.target.value)}
            />
            <button
              className={styles.actionButton}
              onClick={() => lockVesting(adaAmount, parseInt(lockupMinutes))}
              disabled={loading}
            >
              {loading ? "Đang khóa..." : "Khóa Vesting"}
            </button>
          </div>
          {txHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>Tx Hash: {txHash}</p>
              <CopyToClipboard text={txHash} onCopy={() => handleCopy(txHash)}>
                <span className={styles.copyIcon}>
                  <FaCopy />
                </span>
              </CopyToClipboard>
            </div>
          )}

          <h2 className={styles.subtitle}>Mở khóa tiền (Vesting)</h2>
          <div className={styles.inputButtonContainer}>
            <input
              className={styles.txInput}
              type="text"
              placeholder="Nhập Transaction Hash để mở khóa"
              value={inputTxHash}
              onChange={(e) => setInputTxHash(e.target.value)}
            />
            <button
              className={styles.actionButton}
              onClick={() => unlockVesting(inputTxHash)}
              disabled={loading || !inputTxHash}
            >
              {loading ? "Đang mở..." : "Mở khóa Vesting"}
            </button>
          </div>
          {unlockTxHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>Tx Hash: {unlockTxHash}</p>
              <CopyToClipboard text={unlockTxHash} onCopy={() => handleCopy(unlockTxHash)}>
                <span className={styles.copyIcon}>
                  <FaCopy />
                </span>
              </CopyToClipboard>
            </div>
          )}
          {status && <p className={styles.status}>{status}</p>}
        </>
      )}
    </div>
  );
};

export default VestingPage;