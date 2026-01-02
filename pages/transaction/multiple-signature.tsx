import React, { useState, useEffect, useMemo } from "react";
import type { NextPage } from "next";
import { useWallet, CardanoWallet } from "@meshsdk/react";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import { MeshTxBuilder, NativeScript, deserializeAddress, serializeNativeScript, keepRelevant } from "@meshsdk/core";
import { getTxBuilder, getProvider } from "../../utils/common";
import { useRouter } from "next/router";
import styles from "../../styles/index.module.css";

const fixedAddress1 = "addr_test1qrn4fuvpnrhttvwuq5z0733aa9tk82pjqg9rlzva9n7t04ra0a8k5yqyw3583j9ah206l94kxqfr50asuqqesw39x65st8lzp8"; // Ví 1
const fixedAddress2 = "addr_test1qpwm26gaq0zk7a43dte25msfan5jvy6c3gpr9qennesrkkxvywm3xn8zjjwmg6el4hwda8x4y6c368j5839d8vfrwj3qv44pnn"; // Ví 2

const MultisigWalletPage: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [scriptAddress, setScriptAddress] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [signedTx1, setSignedTx1] = useState<string>("");
  const [utxos, setUtxos] = useState<any[]>([]);
  const [selectedUtxoCount, setSelectedUtxoCount] = useState<number>(3);
  const [amounts, setAmounts] = useState<string[]>(["100", "100", "100"]); // For deposit
  const [recipientAddresses, setRecipientAddresses] = useState<string[]>([""]);
  const [transferAmounts, setTransferAmounts] = useState<string[]>(["10"]);
  const [assets, setAssets] = useState<string[]>(["ADA"]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const router = useRouter();

  const convertToLovelace = (ada: string): string => {
    const adaNum = parseFloat(ada);
    if (isNaN(adaNum) || adaNum <= 0) throw new Error("Số ADA không hợp lệ");
    return (adaNum * 1000000).toString();
  };

  const handleWalletConnect = async () => {
    try {
      if (connected && wallet) {
        const address = await wallet.getChangeAddress();
        const utxos = await wallet.getUtxos();
        setWalletAddress(address);
        setUtxos(utxos);
        setStatus("Đã kết nối ví!");
      }
    } catch (error) {
      setStatus("Lỗi khi kết nối ví!");
      console.error(error);
    }
  };

  const nativeScript: NativeScript = {
    type: "all",
    scripts: [
      { type: "sig", keyHash: deserializeAddress(fixedAddress2).pubKeyHash },
      { type: "sig", keyHash: deserializeAddress(fixedAddress1).pubKeyHash },
    ],
  };
  const { address: scriptAddr, scriptCbor } = serializeNativeScript(nativeScript);

  useEffect(() => {
    setScriptAddress(scriptAddr);
    if (connected) handleWalletConnect();
    else {
      setWalletAddress("");
      setTxHash("");
      setStatus("");
      setUtxos([]);
    }
  }, [connected]);

  const fundScriptAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Đang nạp tiền vào script address...");
    try {
      if (!connected || !wallet) throw new Error("Vui lòng kết nối ví trước!");
      if (!walletAddress) throw new Error("Địa chỉ ví chưa được lấy!");
      if (!amounts.length) throw new Error("Vui lòng nhập số tiền muốn nạp!");
      if (!utxos.length) throw new Error("Ví của bạn không có UTxO!");

      const provider = getProvider();
      const txBuilder = getTxBuilder();
      const selectedUtxos = utxos.slice(0, selectedUtxoCount);

      const totalInputLovelace = selectedUtxos.reduce(
        (sum, utxo) => sum + parseInt(utxo.output.amount.find((a: any) => a.unit === "lovelace").quantity),
        0
      );
      const totalFundLovelace = amounts.reduce((sum, amt) => sum + parseFloat(amt) * 1000000, 0);
      if (totalInputLovelace < totalFundLovelace) throw new Error("Không đủ ADA trong UTxO đã chọn!");

      let txBuilderWithInputs = selectedUtxos.reduce((builder, utxo) => {
        return builder.txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address);
      }, txBuilder);

      amounts.forEach((amount) => {
        txBuilderWithInputs = txBuilderWithInputs.txOut(scriptAddr, [
          { unit: "lovelace", quantity: convertToLovelace(amount) },
        ]);
      });

      const unsignedTx = await txBuilderWithInputs
        .changeAddress(walletAddress)
        .protocolParams(await provider.fetchProtocolParameters())
        .setNetwork("preprod")
        .complete();

      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setStatus(`Đã nạp ${amounts.reduce((sum, a) => sum + parseFloat(a), 0)} ADA (${amounts.length} UTxO): ${txHash}`);
      setUtxos(await wallet.getUtxos());
    } catch (error: any) {
      setStatus(`Lỗi khi nạp tiền: ${error.message}`);
      console.error("Lỗi khi nạp tiền:", error);
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
      if (!recipientAddresses.length) throw new Error("Vui lòng nhập ít nhất một địa chỉ người nhận!");
      if (!transferAmounts.length) throw new Error("Vui lòng nhập số lượng muốn chuyển!");

      const provider = getProvider();
      const scriptUtxos = await provider.fetchAddressUTxOs(scriptAddr);
      if (!scriptUtxos.length) throw new Error("Không có UTxO trong script address!");
      if (!scriptCbor) throw new Error("Không có scriptCbor!");

      const outputs: { address: string; unit: string; amount: string }[] = [];
      const assetMap = new Map<string, string>();

      for (let i = 0; i < recipientAddresses.length; i++) {
        const address = recipientAddresses[i];
        if (address && address.startsWith("addr") && address.length > 0) {
          const rawUnit = assets[i] || "ADA";
          const unit = rawUnit === "ADA" ? "lovelace" : rawUnit;
          const multiplier = unit === "lovelace" ? 1000000 : 1; // Giả sử chỉ hỗ trợ ADA, nếu thêm asset khác thì cần metadata
          const parsedAmount = parseFloat(transferAmounts[i] || "0") || 0;
          const thisAmount = parsedAmount * multiplier;
          outputs.push({
            address: address,
            unit: unit,
            amount: thisAmount.toString(),
          });
          assetMap.set(
            unit,
            (Number(assetMap.get(unit) || 0) + thisAmount).toString()
          );
        }
      }

      const selectedUtxos = keepRelevant(assetMap, scriptUtxos);
      if (!selectedUtxos.length) throw new Error("Không đủ UTxO phù hợp trong script address!");

      if (!signedTx1) {
        if (walletAddress !== fixedAddress1) throw new Error("Ví hiện tại không khớp với fixedAddress1!");

        const txBuilder = getTxBuilder();
        let txBuilderWithInputs = selectedUtxos.reduce((builder, utxo) => {
          return builder
            .txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address)
            .txInScript(scriptCbor);
        }, txBuilder);

        outputs.forEach((output) => {
          txBuilderWithInputs = txBuilderWithInputs.txOut(output.address, [
            { unit: output.unit, quantity: output.amount },
          ]);
        });

        const unsignedTx = await txBuilderWithInputs
          .changeAddress(scriptAddr)
          .protocolParams(await provider.fetchProtocolParameters())
          .setNetwork("preprod")
          .complete();

        const signedTxFromWallet1 = await wallet.signTx(unsignedTx, true);
        setSignedTx1(signedTxFromWallet1);
        setStatus("Đã ký bằng ví 1. Copy signedTx và disconnect để ký bằng ví 2!");
      } else {
        if (walletAddress !== fixedAddress2) throw new Error("Ví hiện tại không khớp với fixedAddress2!");

        const signedTx2 = await wallet.signTx(signedTx1, true);
        const txHash = await wallet.submitTx(signedTx2);
        setTxHash(txHash);
        setStatus("Giao dịch đa chữ ký đã gửi thành công: " + txHash);
        router.push("/transactions");
      }
    } catch (error: any) {
      setStatus(`Lỗi: ${error.message}`);
      console.error("Lỗi khi chuyển tiền:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    setTimeout(() => setStatus(""), 2000);
  };

  const addNewUTxO = () => {
    setAmounts([...amounts, "100"]);
    setSelectedUtxoCount(selectedUtxoCount + 1);
  };

  const removeUTxO = (index: number) => {
    const newAmounts = [...amounts];
    newAmounts.splice(index, 1);
    setAmounts(newAmounts);
    setSelectedUtxoCount(selectedUtxoCount - 1);
  };

  const addNewRecipient = () => {
    setRecipientAddresses([...recipientAddresses, ""]);
    setTransferAmounts([...transferAmounts, ""]);
    setAssets([...assets, "ADA"]);
  };

  const removeRecipient = (index: number) => {
    const newAddresses = [...recipientAddresses];
    const newAmounts = [...transferAmounts];
    const newAssets = [...assets];
    newAddresses.splice(index, 1);
    newAmounts.splice(index, 1);
    newAssets.splice(index, 1);
    setRecipientAddresses(newAddresses);
    setTransferAmounts(newAmounts);
    setAssets(newAssets);
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Multisig Wallet</h1>
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
          {scriptAddress && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Script Address: {scriptAddress.slice(0, 6)}...{scriptAddress.slice(-6)}
              </p>
              <CopyToClipboard text={scriptAddress} onCopy={() => handleCopy(scriptAddress)}>
                <span className={styles.copyIcon}>
                  <FaCopy />
                </span>
              </CopyToClipboard>
            </div>
          )}
          <button
            className={styles.actionButton}
            onClick={async () => {
              try {
                await disconnect();
                setWalletAddress('');
                setStatus("Ngắt kết nối ví thành công.");
              } catch (error) {
                console.error("Disconnect Error:", error);
                setStatus("Không thể ngắt kết nối ví.");
              }
            }}
          >
            Ngắt kết nối ví
          </button>
  
          <h2 className={styles.subtitle}>Nạp tiền vào Script</h2>
          <div className={styles.inputButtonContainer}>
            <form onSubmit={fundScriptAddress}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px", textAlign: "left", fontWeight: "bold" }}>UTxO</th>
                    <th style={{ padding: "10px", textAlign: "left", fontWeight: "bold" }}>Số ADA</th>
                    <th style={{ padding: "10px", textAlign: "left" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {amounts.map((amount, index) => (
                    <tr key={index}>
                      <td style={{ padding: "10px" }}>{index + 1}</td>
                      <td style={{ padding: "10px" }}>
                        <input
                          className={styles.txInput}
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={amount}
                          onChange={(e) => {
                            const newAmounts = [...amounts];
                            newAmounts[index] = e.target.value;
                            setAmounts(newAmounts);
                          }}
                          disabled={loading}
                        />
                      </td>
                      <td style={{ padding: "10px" }}>
                        <button
                          type="button"
                          onClick={() => removeUTxO(index)}
                          disabled={loading || amounts.length <= 1}
                          style={{ padding: "5px 10px", background: "#dc3545", color: "#fff", border: "none", borderRadius: "4px", cursor: loading || amounts.length <= 1 ? "not-allowed" : "pointer" }}
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ padding: "10px" }}>
                      <button
                        type="button"
                        onClick={addNewUTxO}
                        disabled={loading}
                        style={{ padding: "5px 10px", background: "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer" }}
                      >
                        + Thêm UTxO
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                type="submit"
                className={styles.actionButton}
                disabled={loading}
              >
                {loading ? "Đang nạp..." : "Nạp tiền"}
              </button>
            </form>
          </div>
  
          <h2 className={styles.subtitle}>Chuyển ADA</h2>
          <div className={styles.inputButtonContainer}>
            <form onSubmit={handleTransferADA}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "15px" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px", textAlign: "left", fontWeight: "bold" }}>Địa chỉ nhận</th>
                    <th style={{ padding: "10px", textAlign: "left", fontWeight: "bold" }}>Số lượng</th>
                    <th style={{ padding: "10px", textAlign: "left", fontWeight: "bold" }}>Tài sản</th>
                    <th style={{ padding: "10px", textAlign: "left" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {recipientAddresses.map((address, index) => (
                    <tr key={index}>
                      <td style={{ padding: "10px" }}>
                        <input
                          className={styles.txInput}
                          type="text"
                          value={address}
                          onChange={(e) => {
                            const newAddresses = [...recipientAddresses];
                            newAddresses[index] = e.target.value;
                            setRecipientAddresses(newAddresses);
                          }}
                          placeholder="Địa chỉ người nhận"
                          disabled={loading || !!signedTx1}
                        />
                      </td>
                      <td style={{ padding: "10px" }}>
                        <input
                          className={styles.txInput}
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={transferAmounts[index]}
                          onChange={(e) => {
                            const newAmounts = [...transferAmounts];
                            newAmounts[index] = e.target.value;
                            setTransferAmounts(newAmounts);
                          }}
                          disabled={loading || !!signedTx1}
                        />
                      </td>
                      <td style={{ padding: "10px" }}>
                        <select
                          value={assets[index]}
                          onChange={(e) => {
                            const newAssets = [...assets];
                            newAssets[index] = e.target.value;
                            setAssets(newAssets);
                          }}
                          disabled={loading || !!signedTx1}
                          style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc", width: "100px" }}
                        >
                          <option value="ADA">ADA</option>
                          {/* Thêm tài sản khác nếu cần */}
                        </select>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <button
                          type="button"
                          onClick={() => removeRecipient(index)}
                          disabled={loading || recipientAddresses.length <= 1 || !!signedTx1}
                          style={{ padding: "5px 10px", background: "#dc3545", color: "#fff", border: "none", borderRadius: "4px", cursor: loading || recipientAddresses.length <= 1 || !!signedTx1 ? "not-allowed" : "pointer" }}
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ padding: "10px" }}>
                      <button
                        type="button"
                        onClick={addNewRecipient}
                        disabled={loading || !!signedTx1}
                        style={{ padding: "5px 10px", background: "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: loading || !!signedTx1 ? "not-allowed" : "pointer" }}
                      >
                        + Thêm người nhận
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <input
                className={styles.txInput}
                type="text"
                value={signedTx1}
                onChange={(e) => setSignedTx1(e.target.value)}
                placeholder="Dán signedTx từ ví 1 (nếu có)"
                disabled={loading}
              />
              <button
                type="submit"
                className={styles.actionButton}
                disabled={loading}
              >
                {loading ? "Processing..." : signedTx1 ? "Ký và gửi bằng ví 2" : "Ký bằng ví 1"}
              </button>
            </form>
          </div>
  
          {signedTx1 && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                SignedTx từ ví 1: {signedTx1.slice(0, 6)}...{signedTx1.slice(-6)}
              </p>
              <CopyToClipboard text={signedTx1} onCopy={() => handleCopy(signedTx1)}>
                <span className={styles.copyIcon}>
                  <FaCopy />
                </span>
              </CopyToClipboard>
            </div>
          )}
  
          {txHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Transaction Hash: {txHash.slice(0, 6)}...{txHash.slice(-6)}
              </p>
              <CopyToClipboard text={txHash} onCopy={() => handleCopy(txHash)}>
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
}

export default MultisigWalletPage;