import React, { useState, useEffect } from "react";
import type { NextPage } from "next";
import { useWallet, CardanoWallet } from "@meshsdk/react";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import { MeshTxBuilder, NativeScript, deserializeAddress, serializeNativeScript } from "@meshsdk/core";
import { getTxBuilder, getProvider } from "../common";
import styles from "../../styles/index.module.css";

const MultipleSignaturePage: NextPage = () => {
  // Khai báo state để lưu địa chỉ ví hiện tại (từ extension)
  const { wallet, connected, disconnect } = useWallet();
  // State lưu địa chỉ ví khi connect
  const [walletAddress, setWalletAddress] = useState<string>("");
  // State lưu txHash sau khi giao dịch hoàn tất
  const [txHash, setTxHash] = useState<string>("");
  // State lưu số ADA muốn gửi, mặc định là "10"
  const [adaAmount, setAdaAmount] = useState<string>("10");
  // State lưu số ADA muốn nạp vào scriptAddress, mặc định là "15"
  const [fundAmount, setFundAmount] = useState<string>("15");
  // State lưu địa chỉ người nhận ADA
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  // State kiểm soát trạng thái loading khi xử lý giao dịch
  const [loading, setLoading] = useState<boolean>(false);
  // State lưu thông báo trạng thái (thành công/lỗi)
  const [status, setStatus] = useState<string>("");
  // State lưu địa chỉ script multisig
  const [scriptAddress, setScriptAddress] = useState<string>("");
  // State lưu giao dịch đã ký từ ví 1 (signedTx1)
  const [signedTx1, setSignedTx1] = useState<string>("");

  // Địa chỉ cố định cho ví 1 (giả lập ví 1 trong multisig)
  const fixedAddress = "addr_test1qpwm26gaq0zk7a43dte25msfan5jvy6c3gpr9qennesrkkxvywm3xn8zjjwmg6el4hwda8x4y6c368j5839d8vfrwj3qv44pnn";
  // Địa chỉ cố định cho ví 2 (giả lập ví 2 trong multisig)
  const fixedAddress2 = "addr_test1qrn4fuvpnrhttvwuq5z0733aa9tk82pjqg9rlzva9n7t04ra0a8k5yqyw3583j9ah206l94kxqfr50asuqqesw39x65st8lzp8";

  // Hàm chuyển đổi ADA sang Lovelace (1 ADA = 1,000,000 Lovelace)
  const convertToLovelace = (ada: string): string => {
    // Chuyển đổi chuỗi ADA thành số thực
    const adaNum = parseFloat(ada);
    // Kiểm tra nếu không phải số hoặc <= 0 thì throw lỗi
    if (isNaN(adaNum) || adaNum <= 0) throw new Error("Số ADA không hợp lệ");
    // Nhân với 1,000,000 để đổi sang Lovelace và trả về dạng chuỗi
    return (adaNum * 1000000).toString();
  };

  // Hàm xử lý khi kết nối ví extension
  const handleWalletConnect = async () => {
    try {
      // Kiểm tra nếu ví đã connect và wallet object tồn tại
      if (connected && wallet) {
        // Lấy địa chỉ ví từ extension
        const address = await wallet.getChangeAddress();
        // Cập nhật state walletAddress
        setWalletAddress(address);
        // Hiển thị thông báo kết nối thành công
        setStatus("Đã kết nối ví!");
      }
    } catch (error) {
      // Hiển thị thông báo lỗi nếu kết nối thất bại
      setStatus("Lỗi khi kết nối ví!");
      // Log lỗi ra console để debug
      console.error(error);
    }
  };

  // Hàm nạp tiền vào scriptAddress
  const fundScriptAddress = async (e: React.FormEvent) => {
    // Ngăn form submit mặc định
    e.preventDefault();
    // Bật trạng thái loading
    setLoading(true);
    // Hiển thị thông báo đang xử lý
    setStatus("Đang nạp tiền vào script address...");
    try {
      // Kiểm tra nếu chưa connect ví hoặc wallet không tồn tại
      if (!connected || !wallet) throw new Error("Vui lòng kết nối ví trước!");
      // Kiểm tra nếu chưa lấy được địa chỉ ví
      if (!walletAddress) throw new Error("Địa chỉ ví chưa được lấy!");
      // Kiểm tra nếu chưa nhập số tiền nạp
      if (!fundAmount) throw new Error("Vui lòng nhập số tiền muốn nạp!");

      // Lấy public key hash từ fixedAddress (ví 1)
      const { pubKeyHash: keyHash1 } = deserializeAddress(fixedAddress);
      // Lấy public key hash từ fixedAddress2 (ví 2)
      const { pubKeyHash: keyHash2 } = deserializeAddress(fixedAddress2);
      // Tạo native script multisig yêu cầu cả 2 chữ ký
      const nativeScript: NativeScript = {
        type: "all",
        scripts: [
          { type: "sig", keyHash: keyHash1 },
          { type: "sig", keyHash: keyHash2 },
        ],
      };
      // Serialize native script để lấy scriptAddress
      const { address: scriptAddr } = serializeNativeScript(nativeScript);
      // Lưu scriptAddress vào state
      setScriptAddress(scriptAddr);

      // Khởi tạo provider từ common
      const provider = getProvider();
      // Khởi tạo txBuilder từ common
      const txBuilder = getTxBuilder();
      // Lấy UTxO từ địa chỉ ví hiện tại
      const utxos = await provider.fetchAddressUTxOs(walletAddress);
      // Kiểm tra nếu ví không có UTxO
      if (!utxos.length) throw new Error("Ví của bạn không có UTxO!");

      // Xây dựng giao dịch nạp tiền vào scriptAddress
      const unsignedTx = await txBuilder
        // Thêm input từ UTxO của ví
        .txIn(utxos[0].input.txHash, utxos[0].input.outputIndex, utxos[0].output.amount, utxos[0].output.address)
        // Thêm output gửi ADA đến scriptAddress
        .txOut(scriptAddr, [{ unit: "lovelace", quantity: convertToLovelace(fundAmount) }])
        // Đặt địa chỉ nhận tiền thừa (change)
        .changeAddress(walletAddress)
        // Chọn UTxO để sử dụng
        .selectUtxosFrom(utxos)
        // Hoàn tất xây dựng giao dịch chưa ký
        .complete();

      // Ký giao dịch bằng ví extension
      const signedTx = await wallet.signTx(unsignedTx);
      // Gửi giao dịch lên blockchain và lấy txHash
      const txHash = await wallet.submitTx(signedTx);
      // Hiển thị thông báo nạp tiền thành công kèm txHash
      setStatus(`Đã nạp ${fundAmount} ADA vào script address: ${txHash}`);
    } catch (error: any) {
      // Log lỗi ra console để debug
      console.error("Lỗi khi nạp tiền:", error);
      // Hiển thị thông báo lỗi cụ thể
      setStatus(`Lỗi khi nạp tiền: ${error.message}`);
    } finally {
      // Tắt trạng thái loading sau khi xử lý xong
      setLoading(false);
    }
  };

  // Hàm xử lý giao dịch multisig (ký bằng ví 1 và ví 2)
  const handleTransferADA = async (e: React.FormEvent) => {
    // Ngăn form submit mặc định
    e.preventDefault();
    // Bật trạng thái loading
    setLoading(true);
    // Hiển thị thông báo đang xử lý
    setStatus("Đang xử lý giao dịch đa chữ ký...");

    try {
      // Kiểm tra nếu chưa connect ví hoặc wallet không tồn tại
      if (!connected || !wallet) throw new Error("Vui lòng kết nối ví trước!");
      // Kiểm tra nếu chưa lấy được địa chỉ ví
      if (!walletAddress) throw new Error("Địa chỉ ví chưa được lấy!");
      // Kiểm tra nếu chưa nhập địa chỉ người nhận (trừ khi đã có signedTx1)
      if (!recipientAddress && !signedTx1) throw new Error("Vui lòng nhập địa chỉ người nhận!");
      // Kiểm tra nếu chưa nhập số ADA (trừ khi đã có signedTx1)
      if (!adaAmount && !signedTx1) throw new Error("Vui lòng nhập số lượng ADA!");

      // Chuyển đổi số ADA sang Lovelace
      const amountLovelace = convertToLovelace(adaAmount);

      // Lấy public key hash từ fixedAddress (ví 1)
      const { pubKeyHash: keyHash1 } = deserializeAddress(fixedAddress);
      // Lấy public key hash từ fixedAddress2 (ví 2)
      const { pubKeyHash: keyHash2 } = deserializeAddress(fixedAddress2);
      // Tạo native script multisig yêu cầu cả 2 chữ ký
      const nativeScript: NativeScript = {
        type: "all",
        scripts: [
          { type: "sig", keyHash: keyHash1 },
          { type: "sig", keyHash: keyHash2 },
        ],
      };
      // Serialize native script để lấy scriptAddress và scriptCbor
      const { address: scriptAddr, scriptCbor } = serializeNativeScript(nativeScript);
      // Lưu scriptAddress vào state
      setScriptAddress(scriptAddr);

      if (!signedTx1) {
        // Bước 1: Ký bằng ví 1 nếu chưa có signedTx1
        // Khởi tạo provider từ common
        const provider = getProvider();
        // Lấy UTxO từ scriptAddress
        const utxos = await provider.fetchAddressUTxOs(scriptAddr);
        // Kiểm tra nếu scriptAddress không có UTxO
        if (!utxos.length) throw new Error("Không có UTxO trong script address!");
        // Kiểm tra nếu scriptCbor không tồn tại
        if (!scriptCbor) throw new Error("Không có scriptCbor!");
        // Khởi tạo txBuilder từ common
        const txBuilder = getTxBuilder();
        // Xây dựng giao dịch rút tiền từ scriptAddress
        const unsignedTx = await txBuilder
          // Thêm input từ UTxO của scriptAddress
          .txIn(utxos[0].input.txHash, utxos[0].input.outputIndex, utxos[0].output.amount, utxos[0].output.address)
          // Thêm output gửi ADA đến recipientAddress
          .txOut(recipientAddress, [{ unit: "lovelace", quantity: amountLovelace }])
          // Đặt địa chỉ nhận tiền thừa (change)
          .changeAddress(scriptAddr)
          // Chọn UTxO để sử dụng
          .selectUtxosFrom(utxos)
          // Hoàn tất xây dựng giao dịch chưa ký
          .complete();

        // Ký giao dịch bằng ví 1 (partial sign cho multisig)
        const signedTxFromWallet1 = await wallet.signTx(unsignedTx, true);
        // Lưu signedTx1 vào state
        setSignedTx1(signedTxFromWallet1);
        // Hiển thị thông báo đã ký bằng ví 1, yêu cầu disconnect
        setStatus("Đã ký bằng ví 1. Copy signedTx và disconnect để ký bằng ví 2!");
      } else {
        // Bước 2: Ký bằng ví 2 nếu đã có signedTx1
        // Ký tiếp signedTx1 bằng ví 2 (partial sign cho multisig)
        const signedTx2 = await wallet.signTx(signedTx1, true);
        // Gửi giao dịch lên blockchain và lấy txHash
        const txHash = await wallet.submitTx(signedTx2);
        // Lưu txHash vào state
        setTxHash(txHash);
        // Hiển thị thông báo giao dịch thành công
        setStatus("Giao dịch đa chữ ký đã gửi thành công: " + txHash);
        // Tự động disconnect ví sau khi thành công
        disconnect();
      }
    } catch (error: any) {
      // Log lỗi ra console để debug
      console.error("Lỗi khi gửi giao dịch:", error);
      // Hiển thị thông báo lỗi cụ thể
      setStatus(`Lỗi: ${error.message || "Không thể gửi giao dịch"}`);
    } finally {
      // Tắt trạng thái loading sau khi xử lý xong
      setLoading(false);
    }
  };

  // Hàm xử lý sao chép text vào clipboard
  const handleCopy = (text: string) => {
    // Hiển thị thông báo đã sao chép (chỉ hiện 6 ký tự đầu và cuối)
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    // Xóa thông báo sau 2 giây
    setTimeout(() => setStatus(""), 2000);
  };

  // Hook useEffect theo dõi trạng thái connected của ví
  useEffect(() => {
    // Nếu ví đang connected
    if (connected) {
      // Gọi hàm xử lý kết nối ví
      handleWalletConnect();
    } else {
      // Nếu ví không connected (sau khi disconnect)
      // Reset walletAddress về rỗng
      setWalletAddress("");
      // Reset txHash về rỗng
      setTxHash("");
      // Reset recipientAddress về rỗng
      setRecipientAddress("");
      // Reset adaAmount về giá trị mặc định
      setAdaAmount("10");
      // Reset signedTx1 về rỗng
      setSignedTx1("");
      // Reset status về rỗng
      setStatus("");
      // Reset scriptAddress về rỗng
      setScriptAddress("");
    }
  }, [connected]); // Dependency là connected, chạy lại khi connected thay đổi

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Giao dịch Send ADA đa chữ ký</h1>
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
              disabled={loading || !!signedTx1}
            />
            <input
              type="text"
              value={adaAmount}
              onChange={(e) => setAdaAmount(e.target.value)}
              placeholder="Amount (ADA)"
              className={styles.txInput}
              disabled={loading || !!signedTx1}
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