import React, { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useWallet, CardanoWallet } from "@meshsdk/react";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import { MeshTxBuilder, NativeScript, deserializeAddress, serializeNativeScript } from "@meshsdk/core";
import { getTxBuilder, getProvider } from "../../utils/common";
import styles from "../../styles/index.module.css";

const fixedAddress1 = "addr_test1qrn4fuvpnrhttvwuq5z0733aa9tk82pjqg9rlzva9n7t04ra0a8k5yqyw3583j9ah206l94kxqfr50asuqqesw39x65st8lzp8"; // Ví 1
const fixedAddress2 = "addr_test1qpwm26gaq0zk7a43dte25msfan5jvy6c3gpr9qennesrkkxvywm3xn8zjjwmg6el4hwda8x4y6c368j5839d8vfrwj3qv44pnn"; // Ví 2

const MultipleSignaturePage: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [adaAmount, setAdaAmount] = useState<string>("10");
  const [fundAmount, setFundAmount] = useState<string>("15");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [scriptAddress, setScriptAddress] = useState<string>("");
  const [signedTx1, setSignedTx1] = useState<string>(""); // Lưu signedTx từ ví 1

  const convertToLovelace = (ada: string): string => {
    const adaNum = parseFloat(ada);
    if (isNaN(adaNum) || adaNum <= 0) throw new Error("Số ADA không hợp lệ");
    return (adaNum * 1000000).toString();
  };

  const handleWalletConnect = async () => {
    try {
      if (connected && wallet) {
        const address = await wallet.getChangeAddress();
        setWalletAddress(address);
        setStatus("Đã kết nối ví!");
      }
    } catch (error) {
      setStatus("Lỗi khi kết nối ví!");
      console.error(error);
    }
  };

  const fundScriptAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Đang nạp tiền vào script address...");
    try {
      if (!connected || !wallet) throw new Error("Vui lòng kết nối ví trước!");
      if (!walletAddress) throw new Error("Địa chỉ ví chưa được lấy!");
      if (!fundAmount) throw new Error("Vui lòng nhập số tiền muốn nạp!");

      const { pubKeyHash: keyHash1 } = deserializeAddress(fixedAddress1);
      const { pubKeyHash: keyHash2 } = deserializeAddress(fixedAddress2);
      const nativeScript: NativeScript = {
        type: "all",
        scripts: [
          { type: "sig", keyHash: keyHash1 },
          { type: "sig", keyHash: keyHash2 },
        ],
      };
      const { address: scriptAddr } = serializeNativeScript(nativeScript);
      setScriptAddress(scriptAddr);

      const provider = getProvider();
      const txBuilder = getTxBuilder();
      const utxos = await provider.fetchAddressUTxOs(walletAddress);
      if (!utxos.length) throw new Error("Ví của bạn không có UTxO!");

      console.log("Funding UTxOs from wallet:", utxos);

      const unsignedTx = await txBuilder
        .txIn(utxos[0].input.txHash, utxos[0].input.outputIndex, utxos[0].output.amount, utxos[0].output.address)
        .txOut(scriptAddr, [{ unit: "lovelace", quantity: convertToLovelace(fundAmount) }])
        .changeAddress(walletAddress)
        .protocolParams(await provider.fetchProtocolParameters())
        .complete();

      console.log("Unsigned Tx (fund):", unsignedTx);

      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setStatus(`Đã nạp ${fundAmount} ADA vào script address: ${txHash}`);
    } catch (error: any) {
      console.error("Lỗi khi nạp tiền:", error);
      setStatus(`Lỗi khi nạp tiền: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTransferADA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Đang xử lý giao dịch đa chữ ký...");

    try {
      if (!connected || !wallet) throw new Error("Vui lòng kết nối ví trước!");
      if (!walletAddress) throw new Error("Địa chỉ ví chưa được lấy!");
      if (!recipientAddress && !signedTx1) throw new Error("Vui lòng nhập địa chỉ người nhận!");
      if (!adaAmount && !signedTx1) throw new Error("Vui lòng nhập số lượng ADA!");

      const { pubKeyHash: keyHash1 } = deserializeAddress(fixedAddress1);
      const { pubKeyHash: keyHash2 } = deserializeAddress(fixedAddress2);
      const nativeScript: NativeScript = {
        type: "all",
        scripts: [
          { type: "sig", keyHash: keyHash1 },
          { type: "sig", keyHash: keyHash2 },
        ],
      };
      const { address: scriptAddr, scriptCbor } = serializeNativeScript(nativeScript);
      setScriptAddress(scriptAddr);

      if (!signedTx1) {
        // Bước 1: Ký bằng ví 1
        if (walletAddress !== fixedAddress1) {
          throw new Error("Ví hiện tại không khớp với fixedAddress1!");
        }

        const provider = getProvider();
        const utxos = await provider.fetchAddressUTxOs(scriptAddr);
        if (!utxos.length) throw new Error("Không có UTxO trong script address!");
        if (!scriptCbor) throw new Error("Không có scriptCbor!");

        console.log("UTxOs from scriptAddress:", utxos);
        console.log("Selected UTxO:", utxos[0]);

        const amountLovelace = convertToLovelace(adaAmount);

        const txBuilder = getTxBuilder();
        const unsignedTx = await txBuilder
          .txIn(utxos[0].input.txHash, utxos[0].input.outputIndex, utxos[0].output.amount, utxos[0].output.address)
          .txInScript(scriptCbor)
          .txOut(recipientAddress, [{ unit: "lovelace", quantity: amountLovelace }])
          .changeAddress(scriptAddr)
          .protocolParams(await provider.fetchProtocolParameters())
          .complete();

        console.log("Unsigned Tx:", unsignedTx);

        const signedTxFromWallet1 = await wallet.signTx(unsignedTx, true);
        console.log("Signed Tx from Wallet 1:", signedTxFromWallet1);
        setSignedTx1(signedTxFromWallet1);
        setStatus("Đã ký bằng ví 1. Copy signedTx và disconnect để ký bằng ví 2!");
      } else {
        // Bước 2: Ký bằng ví 2 và gửi
        if (walletAddress !== fixedAddress2) {
          throw new Error("Ví hiện tại không khớp với fixedAddress2!");
        }

        console.log("Signed Tx from Wallet 1 (before Wallet 2):", signedTx1);
        const signedTx2 = await wallet.signTx(signedTx1, true);
        console.log("Signed Tx from Wallet 2:", signedTx2);

        const txHash = await wallet.submitTx(signedTx2);
        setTxHash(txHash);
        setStatus("Giao dịch đa chữ ký đã gửi thành công: " + txHash);
      }
    } catch (error: any) {
      console.error("Lỗi khi gửi giao dịch:", error);
      setStatus(`Lỗi: ${error.message || "Không thể gửi giao dịch"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    setTimeout(() => setStatus(""), 2000);
  };

  useEffect(() => {
    if (connected) {
      handleWalletConnect();
    } else {
      setWalletAddress("");
      setTxHash("");
      setStatus("");
      setScriptAddress("");
      // Không reset recipientAddress, adaAmount, signedTx1 để giữ giá trị
    }
  }, [connected]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Transfer ADA multiple-sign</h1>
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
              <FaCopy className={styles.copyIcon} />
            </CopyToClipboard>
          </div>

          <h2 className={styles.subtitle}>Nạp tiền vào Script Address</h2>
          <form onSubmit={fundScriptAddress} className={styles.inputButtonContainer}>
            <input
              type="text"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder="Amount to Fund (ADA)"
              className={styles.txInput}
              disabled={loading}
            />
            <button type="submit" className={styles.actionButton} disabled={loading}>
              {loading ? "Funding..." : "Nạp tiền"}
            </button>
          </form>

          {scriptAddress && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Script Address: {scriptAddress.slice(0, 6)}...{scriptAddress.slice(-6)}
              </p>
              <CopyToClipboard text={scriptAddress} onCopy={() => handleCopy(scriptAddress)}>
                <FaCopy className={styles.copyIcon} />
              </CopyToClipboard>
            </div>
          )}
          <button className={styles.actionButton} onClick={disconnect}>
            Ngắt kết nối ví
          </button>

          <h2 className={styles.subtitle}>Send ADA</h2>
          <form onSubmit={handleTransferADA} className={styles.inputButtonContainer}>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Recipient Address"
              className={styles.txInput}
              disabled={loading || !!signedTx1} // Khóa nếu đã ký ví 1
            />
            <input
              type="text"
              value={adaAmount}
              onChange={(e) => setAdaAmount(e.target.value)}
              placeholder="Amount (ADA)"
              className={styles.txInput}
              disabled={loading || !!signedTx1} // Khóa nếu đã ký ví 1
            />
            <input
              type="text"
              value={signedTx1}
              onChange={(e) => setSignedTx1(e.target.value)}
              placeholder="Dán signedTx từ ví 1 (nếu có)"
              className={styles.txInput}
              disabled={loading}
            />
            <button type="submit" className={styles.actionButton} disabled={loading}>
              {loading ? "Processing..." : signedTx1 ? "Ký và gửi bằng ví 2" : "Ký bằng ví 1"}
            </button>
          </form>

          {signedTx1 && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                SignedTx từ ví 1: {signedTx1.slice(0, 6)}...{signedTx1.slice(-6)}
              </p>
              <CopyToClipboard text={signedTx1} onCopy={() => handleCopy(signedTx1)}>
                <FaCopy className={styles.copyIcon} />
              </CopyToClipboard>
            </div>
          )}

          {txHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Transaction Hash: {txHash.slice(0, 6)}...{txHash.slice(-6)}
              </p>
              <CopyToClipboard text={txHash} onCopy={() => handleCopy(txHash)}>
                <FaCopy className={styles.copyIcon} />
              </CopyToClipboard>
            </div>
          )}
        </>
      )}

      {status && <div className={styles.status}>{status}</div>}
    </div>
  );
};

export default MultipleSignaturePage;