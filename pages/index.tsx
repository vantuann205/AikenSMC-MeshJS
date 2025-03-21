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
import { getScript, getTxBuilder, getUtxoByTxHash } from "./common";
import blueprint from "../hello_word/plutus.json";
import styles from "../styles/index.module.css";

const Home: NextPage = () => {
  const { wallet, connected, connect, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [unlockTxHash, setUnlockTxHash] = useState<string>("");
  const [inputTxHash, setInputTxHash] = useState<string>("");
  const [adaAmount, setAdaAmount] = useState<string>("10");
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (connected && wallet) {
        try {
          const address = await wallet.getChangeAddress();
          setWalletAddress(address);
        } catch (error) {
          console.error("Error fetching wallet address:", error);
          setStatus("Failed to fetch wallet address.");
        }
      } else {
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

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    setTimeout(() => setStatus(""), 2000); // Xóa thông báo sau 2 giây
  };

  async function lock() {
    try {
      setLoading(true);
      setStatus("Đang khởi tạo giao dịch khóa...");

      const lovelaceAmount = (parseFloat(adaAmount) * 1000000).toString();
      if (isNaN(parseFloat(adaAmount)) || parseFloat(adaAmount) <= 0) {
        throw new Error("Vui lòng nhập số lượng ADA hợp lệ");
      }

      const assets: Asset[] = [
        {
          unit: "lovelace",
          quantity: lovelaceAmount,
        },
      ];

      const utxos = await wallet.getUtxos();
      const walletAddress = (await wallet.getUsedAddresses())[0];
      const { scriptAddr } = getScript(blueprint.validators[0].compiledCode);
      const signerHash = deserializeAddress(walletAddress).pubKeyHash;

      const txBuilder = getTxBuilder();
      await txBuilder
        .txOut(scriptAddr, assets)
        .txOutDatumHashValue(mConStr0([signerHash]))
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .setNetwork("preview")
        .complete();

      const unsignedTx = txBuilder.txHex;
      const signedTx = await wallet.signTx(unsignedTx);
      const newTxHash = await wallet.submitTx(signedTx);

      setTxHash(newTxHash);
      setStatus(`Khóa tiền thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Lock Error:", error);
      setStatus(`Lỗi khi khóa tiền: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function unlock(txHashToUnlock: string) {
    try {
      setLoading(true);
      setStatus("Đang khởi tạo giao dịch mở khóa...");

      const message = "Hello, World!";
      const utxo = await getUtxoByTxHash(txHashToUnlock);
      if (!utxo) {
        throw new Error("Không tìm thấy UTxO cho tx hash: " + txHashToUnlock);
      }
      console.log("UTxO to unlock:", utxo);

      const utxos = await wallet.getUtxos();
      const walletAddress = (await wallet.getUsedAddresses())[0];
      const collateral = (await wallet.getCollateral())[0];
      if (!collateral) {
        throw new Error("Không tìm thấy collateral. Vui lòng thiết lập collateral trong ví.");
      }
      console.log("Collateral:", collateral);

      const { scriptCbor } = getScript(blueprint.validators[0].compiledCode);
      console.log("Script CBOR:", scriptCbor);
      const signerHash = deserializeAddress(walletAddress).pubKeyHash;

      const txBuilder = getTxBuilder();
      await txBuilder
        .spendingPlutusScript("V3")
        .txIn(
          utxo.input.txHash,
          utxo.input.outputIndex,
          utxo.output.amount,
          utxo.output.address
        )
        .txInScript(scriptCbor)
        .txInRedeemerValue(mConStr0([stringToHex(message)]))
        .txInDatumValue(mConStr0([signerHash]))
        .requiredSignerHash(signerHash)
        .changeAddress(walletAddress)
        .txInCollateral(
          collateral.input.txHash,
          collateral.input.outputIndex,
          collateral.output.amount,
          collateral.output.address
        )
        .selectUtxosFrom(utxos)
        .setNetwork("preview")
        .complete();

      const unsignedTx = txBuilder.txHex;
      console.log("Unsigned Tx:", unsignedTx);
      const signedTx = await wallet.signTx(unsignedTx);
      const newTxHash = await wallet.submitTx(signedTx);

      setUnlockTxHash(newTxHash);
      setStatus(`Mở khóa tiền thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Unlock Error:", error);
      setStatus(`Lỗi khi mở khóa tiền: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    // Trong phần return của component Home
<div className={styles.container}>
  <h1 className={styles.title}>Kết nối ví</h1>
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