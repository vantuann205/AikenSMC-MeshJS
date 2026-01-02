import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useWallet } from "@meshsdk/react";
import { CardanoWallet } from "@meshsdk/react";
import { Asset } from "@meshsdk/core";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import { mConStr0 } from "@meshsdk/core";
import {
  deserializeAddress,
  ConStr0,
  Integer,
  BuiltinByteString,
  deserializeDatum,
  unixTimeToEnclosingSlot,
  SLOT_CONFIG_NETWORK,
} from "@meshsdk/core";
import { getScript, getTxBuilder, getUtxoByTxHash } from "../utils/common";
import blueprint from "../vesting-smc/plutus.json";
import styles from "../styles/index.module.css";

export type VestingDatum = ConStr0<[Integer, BuiltinByteString, BuiltinByteString]>;

const VestingPage: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [unlockTxHash, setUnlockTxHash] = useState<string>("");
  const [inputTxHash, setInputTxHash] = useState<string>("");
  const [adaAmount, setAdaAmount] = useState<string>("10");
  const [lockUntilDate, setLockUntilDate] = useState<string>(""); // Thời gian khóa theo định dạng datetime-local
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string>(""); // Địa chỉ beneficiary
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (connected && wallet) {
        const address = await wallet.getChangeAddress();
        setWalletAddress(address);
      } else {
        setWalletAddress("");
        setTxHash("");
        setUnlockTxHash("");
        setInputTxHash("");
        setAdaAmount("10");
        setLockUntilDate(""); // Reset thời gian khóa
        setBeneficiaryAddress(""); // Reset địa chỉ beneficiary
        setStatus("");
      }
    };
    fetchWalletAddress();
  }, [connected, wallet]);

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    setTimeout(() => setStatus(""), 2000);
  };

  async function lockVesting(adaAmount: string, lockUntil: string, beneficiary: string) {
    try {
      setLoading(true);
      setStatus("Đang khởi tạo giao dịch khóa vesting...");

      const lovelaceAmount = (parseFloat(adaAmount) * 1000000).toString();
      if (isNaN(parseFloat(adaAmount)) || parseFloat(adaAmount) <= 0) {
        throw new Error("Vui lòng nhập số lượng ADA hợp lệ");
      }
      if (!lockUntil) {
        throw new Error("Vui lòng chọn thời gian khóa");
      }
      if (!beneficiary || !beneficiary.startsWith("addr")) {
        throw new Error("Vui lòng nhập địa chỉ beneficiary hợp lệ");
      }

      const assets: Asset[] = [{ unit: "lovelace", quantity: lovelaceAmount }];
      const utxos = await wallet.getUtxos();
      const walletAddress = (await wallet.getUsedAddresses())[0];
      const { scriptAddr } = getScript(blueprint.validators[0].compiledCode);
      const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress);
      const { pubKeyHash: beneficiaryPubKeyHash } = deserializeAddress(beneficiary);
      const lockUntilTimestamp = new Date(lockUntil).getTime(); // Chuyển datetime-local thành timestamp (ms)
      const currentTime = Date.now();
      if (lockUntilTimestamp <= currentTime) {
        throw new Error("Thời gian khóa phải ở tương lai");
      }

      const txBuilder = getTxBuilder();
      await txBuilder
        .txOut(scriptAddr, assets)
        .txOutInlineDatumValue(mConStr0([lockUntilTimestamp, ownerPubKeyHash, beneficiaryPubKeyHash]))
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .setNetwork("preprod")
        .complete();

      const unsignedTx = txBuilder.txHex;
      const signedTx = await wallet.signTx(unsignedTx);
      const newTxHash = await wallet.submitTx(signedTx);

      setTxHash(newTxHash);
      setStatus(`Khóa vesting thành công! Tx Hash: ${newTxHash}`);
    } catch (error) {
      console.error("Lock Vesting Error:", error);
      setStatus(`Lỗi khi khóa vesting: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function unlockVesting(txHashToUnlock: string) {
    try {
      setLoading(true);
      setStatus("Đang mở khóa vesting...");
  
      const utxo = await getUtxoByTxHash(txHashToUnlock);
      const utxos = await wallet.getUtxos();
      const walletAddress = (await wallet.getUsedAddresses())[0];
      const collateral = (await wallet.getCollateral())[0];
      if (!collateral) throw new Error("Không tìm thấy collateral.");
  
      const datum = deserializeDatum<VestingDatum>(utxo.output.plutusData!);
      const lockUntil = datum.fields[0].int as number; // Thời gian khóa
      const ownerPubKeyHash = datum.fields[1].bytes;   // Hash của owner
      const beneficiaryPubKeyHash = datum.fields[2].bytes; // Hash của beneficiary
      const { scriptCbor } = getScript(blueprint.validators[0].compiledCode);
  
      const currentTime = Date.now();
      const currentSlot = unixTimeToEnclosingSlot(currentTime, SLOT_CONFIG_NETWORK.preprod);
      const lockUntilSlot = unixTimeToEnclosingSlot(lockUntil, SLOT_CONFIG_NETWORK.preprod);
  
      const { pubKeyHash: signerPubKeyHash } = deserializeAddress(walletAddress);
  
      // Kiểm tra xem signer là owner hay beneficiary
      // const isOwner = signerPubKeyHash === ownerPubKeyHash;
      const isBeneficiary = signerPubKeyHash === beneficiaryPubKeyHash;  
      // Chỉ kiểm tra thời gian nếu signer là beneficiary
      if (isBeneficiary && currentTime <= lockUntil) {
        throw new Error(`Chưa đến thời gian mở khóa! Lock until: ${new Date(lockUntil).toLocaleString()}`);
      }
  
      console.log("Current Time:", new Date(currentTime).toLocaleString());
      console.log("Lock Until:", new Date(lockUntil).toLocaleString());
      console.log("Current Slot:", currentSlot);
      console.log("Lock Until Slot:", lockUntilSlot);
      console.log("Signer:", signerPubKeyHash);
      console.log("Owner:", ownerPubKeyHash);
      console.log("Beneficiary:", beneficiaryPubKeyHash);
      const txBuilder = getTxBuilder();
      if (isBeneficiary) {
        txBuilder.invalidBefore(lockUntilSlot); // Yêu cầu slot hiện tại >= lockUntilSlot
      }
      await txBuilder
        .spendingPlutusScript("V3")
        .txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address)
        .spendingReferenceTxInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(mConStr0([]))
        .txInScript(scriptCbor)
        .invalidHereafter(currentSlot + 100000) // Giới hạn upper bound
        .requiredSignerHash(signerPubKeyHash)
        .changeAddress(walletAddress)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
        .selectUtxosFrom(utxos)
        .setNetwork("preprod")
        .complete();
  
      const unsignedTx = txBuilder.txHex;
      console.log("Unsigned Tx:", unsignedTx);
      const signedTx = await wallet.signTx(unsignedTx);
      console.log("Signed Tx:", signedTx);
      const newTxHash = await wallet.submitTx(signedTx);
  
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
                setWalletAddress('');
                setStatus("Kết nối ví thành công.");
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
              type="datetime-local"
              placeholder="Chọn thời gian khóa"
              value={lockUntilDate}
              onChange={(e) => setLockUntilDate(e.target.value)}
            />
            <input
              className={styles.txInput}
              type="text"
              placeholder="Nhập địa chỉ beneficiary"
              value={beneficiaryAddress}
              onChange={(e) => setBeneficiaryAddress(e.target.value)}
            />
            <button
              className={styles.actionButton}
              onClick={() => lockVesting(adaAmount, lockUntilDate, beneficiaryAddress)}
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