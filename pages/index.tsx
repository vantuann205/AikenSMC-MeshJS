import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useWallet } from "@meshsdk/react";
import { CardanoWallet } from "@meshsdk/react";
import { Asset } from "@meshsdk/core";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa"; // Import icon sao chép từ react-icons

import {
  deserializeAddress,
  mConStr0,
  stringToHex,
} from "@meshsdk/core";
import { getScript, getTxBuilder, getUtxoByTxHash } from "../utils/common";
import blueprint from "../helloworld-smc/plutus.json";
import styles from "../styles/index.module.css";

const Home: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet(); // Lấy thông tin ví từ MeshSDK
  const [walletAddress, setWalletAddress] = useState<string>(""); // Lưu địa chỉ ví
  const [txHash, setTxHash] = useState<string>(""); // Lưu hash giao dịch khóa
  const [unlockTxHash, setUnlockTxHash] = useState<string>(""); // Lưu hash giao dịch mở khóa
  const [inputTxHash, setInputTxHash] = useState<string>(""); // Lưu hash giao dịch cần mở khóa
  const [adaAmount, setAdaAmount] = useState<string>("10"); // Số ADA muốn khóa, mặc định 10
  const [loading, setLoading] = useState<boolean>(false); // Trạng thái đang xử lý
  const [status, setStatus] = useState<string>(""); // Thông báo trạng thái giao dịch

  useEffect(() => { // Cập nhật địa chỉ ví khi kết nối thay đổi
    const fetchWalletAddress = async () => {
      if (connected && wallet) { // Nếu ví đã kết nối
        const address = await wallet.getChangeAddress(); // Lấy địa chỉ ví
        setWalletAddress(address);
      } else { // Nếu ngắt kết nối, reset tất cả
        setWalletAddress("");
        setTxHash("");
        setUnlockTxHash("");
        setInputTxHash("");
        setAdaAmount("10");
        setStatus("");
      }
    };
    fetchWalletAddress();
  }, [connected, wallet]);

  const handleCopy = (text: string) => { // Xử lý sao chép văn bản
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`); // Hiển thị thông báo
    setTimeout(() => setStatus(""), 2000); // Xóa thông báo sau 2 giây
  };

  async function lock() { // Hàm khóa ADA vào script
    try {
      setLoading(true); // Bật trạng thái đang xử lý
      setStatus("Đang khởi tạo giao dịch khóa...");
      const lovelaceAmount = (parseFloat(adaAmount) * 1000000).toString(); // Chuyển ADA thành lovelace
      if (isNaN(parseFloat(adaAmount)) || parseFloat(adaAmount) <= 0) { // Kiểm tra số ADA hợp lệ
        throw new Error("Vui lòng nhập số lượng ADA hợp lệ");
      }

      const assets: Asset[] = [{ unit: "lovelace", quantity: lovelaceAmount }]; // Tạo danh sách tài sản (ADA)
      const utxos = await wallet.getUtxos(); // Lấy danh sách UTxO từ ví
      const walletAddress = (await wallet.getUsedAddresses())[0]; // Lấy địa chỉ ví đã dùng
      const { scriptAddr } = getScript(blueprint.validators[0].compiledCode); // Lấy địa chỉ script từ blueprint
      const signerHash = deserializeAddress(walletAddress).pubKeyHash; // Lấy hash khóa công khai
      const txBuilder = getTxBuilder(); // Khởi tạo builder giao dịch
      await txBuilder // Xây dựng giao dịch
        .txOut(scriptAddr, assets) // Gửi ADA đến script
        .txOutDatumHashValue(mConStr0([signerHash])) // Gắn datum (chủ sở hữu)
        .changeAddress(walletAddress) // Địa chỉ nhận tiền thừa
        .selectUtxosFrom(utxos) // Chọn UTxO để tiêu
        .setNetwork("preview") // Đặt mạng là preview
        .complete();

      const unsignedTx = txBuilder.txHex; // Lấy giao dịch chưa ký
      const signedTx = await wallet.signTx(unsignedTx); // Ký giao dịch
      const newTxHash = await wallet.submitTx(signedTx); // Gửi giao dịch lên blockchain

      setTxHash(newTxHash); // Lưu hash giao dịch
      setStatus(`Khóa tiền thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Lock Error:", error);
      setStatus(`Lỗi khi khóa tiền: ${(error as Error).message}`);
    } finally {
      setLoading(false); // Tắt trạng thái đang xử lý
    }
  }

  async function unlock(txHashToUnlock: string) { // Hàm mở khóa ADA từ script
    try {
      setLoading(true); // Bật trạng thái đang xử lý
      setStatus("Đang khởi tạo giao dịch mở khóa...");
      const message = "Hello, World!"; // Thông điệp cần khớp với validator
      const utxo = await getUtxoByTxHash(txHashToUnlock); // Lấy UTxO từ hash giao dịch
      if (!utxo) { // Kiểm tra UTxO tồn tại
        throw new Error("Không tìm thấy UTxO cho tx hash: " + txHashToUnlock);
      }

      const utxos = await wallet.getUtxos(); // Lấy danh sách UTxO từ ví
      const walletAddress = (await wallet.getUsedAddresses())[0]; // Lấy địa chỉ ví
      const collateral = (await wallet.getCollateral())[0]; // Lấy UTxO làm collateral
      if (!collateral) { // Kiểm tra collateral
        throw new Error("Không tìm thấy collateral. Vui lòng thiết lập collateral trong ví.");
      }

      const { scriptCbor } = getScript(blueprint.validators[0].compiledCode); // Lấy mã script CBOR
      const signerHash = deserializeAddress(walletAddress).pubKeyHash; // Lấy hash khóa công khai
      const txBuilder = getTxBuilder(); // Khởi tạo builder giao dịch
      await txBuilder // Xây dựng giao dịch
        .spendingPlutusScript("V3") // Sử dụng Plutus V3
        .txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address) // Tiêu UTxO từ script
        .txInScript(scriptCbor) // Gắn script
        .txInRedeemerValue(mConStr0([stringToHex(message)])) // Gắn redeemer (thông điệp "Hello, World!")
        .txInDatumValue(mConStr0([signerHash])) // Gắn datum (chủ sở hữu)
        .requiredSignerHash(signerHash) // Yêu cầu chữ ký từ chủ sở hữu
        .changeAddress(walletAddress) // Địa chỉ nhận tiền
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address) // Gắn collateral
        .selectUtxosFrom(utxos) // Chọn UTxO để tiêu
        .setNetwork("preview") // Đặt mạng là preview
        .complete();

      const unsignedTx = txBuilder.txHex; // Lấy giao dịch chưa ký
      const signedTx = await wallet.signTx(unsignedTx); // Ký giao dịch
      const newTxHash = await wallet.submitTx(signedTx); // Gửi giao dịch lên blockchain

      setUnlockTxHash(newTxHash); // Lưu hash giao dịch
      setStatus(`Mở khóa tiền thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Unlock Error:", error);
      setStatus(`Lỗi khi mở khóa tiền: ${(error as Error).message}`);
    } finally {
      setLoading(false); // Tắt trạng thái đang xử lý
    }
  }

  return (
    // Trong phần return của component Home
<div className={styles.container}>
  <h1 className={styles.title}>Hello World</h1>
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
      <h2 className={styles.subtitle}>Khóa tiền</h2>
      <div className={styles.inputButtonContainer}>
        <input
          className={styles.txInput}
          type="number"
          step="0.1"
          min="0.1"
          placeholder="Nhập số lượng ADA muốn khóa"
          value={adaAmount}
          onChange={(e) => setAdaAmount(e.target.value)}
        />
        <button className={styles.actionButton} onClick={lock} disabled={loading}>
          {loading ? "Đang khóa..." : `Khóa ${adaAmount} tADA`}
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
      <h2 className={styles.subtitle}>Mở khóa tiền</h2>
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
          onClick={() => unlock(inputTxHash)}
          disabled={loading || !inputTxHash}
        >
          {loading ? "Đang mở khóa..." : "Mở khóa tADA"}
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

export default Home;