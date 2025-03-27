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
import { getScript, getTxBuilder, getUtxoByTxHash } from "./common";
import blueprint from "../vesting-smc/plutus.json";
import styles from "../styles/index.module.css";

export type VestingDatum = ConStr0<[Integer, BuiltinByteString, BuiltinByteString]>; // Định nghĩa kiểu dữ liệu cho datum của hợp đồng vesting, gồm thời gian khóa (Integer), hash của owner và beneficiary (BuiltinByteString)

const VestingPage: NextPage = () => { // Khai báo component React là một trang Next.js
  const { wallet, connected, disconnect } = useWallet(); // Lấy thông tin ví từ hook useWallet: đối tượng ví, trạng thái kết nối, và hàm ngắt kết nối
  const [walletAddress, setWalletAddress] = useState<string>(""); // State lưu địa chỉ ví, ban đầu rỗng
  const [txHash, setTxHash] = useState<string>(""); // State lưu mã giao dịch khi khóa ADA, ban đầu rỗng
  const [unlockTxHash, setUnlockTxHash] = useState<string>(""); // State lưu mã giao dịch khi mở khóa ADA, ban đầu rỗng
  const [inputTxHash, setInputTxHash] = useState<string>(""); // State lưu mã giao dịch đầu vào để mở khóa, ban đầu rỗng
  const [adaAmount, setAdaAmount] = useState<string>("10"); // State lưu số lượng ADA muốn khóa, mặc định là 10
  const [lockUntilDate, setLockUntilDate] = useState<string>(""); // State lưu thời gian khóa (chuỗi datetime-local), ban đầu rỗng
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string>(""); // State lưu địa chỉ người thụ hưởng, ban đầu rỗng
  const [loading, setLoading] = useState<boolean>(false); // State kiểm soát trạng thái đang xử lý, ban đầu là false
  const [status, setStatus] = useState<string>(""); // State lưu thông báo trạng thái cho người dùng, ban đầu rỗng

  useEffect(() => { // Hook useEffect chạy khi connected hoặc wallet thay đổi
    const fetchWalletAddress = async () => { // Hàm bất đồng bộ để lấy địa chỉ ví
      if (connected && wallet) { // Kiểm tra nếu ví đã kết nối và tồn tại
        const address = await wallet.getChangeAddress(); // Lấy địa chỉ ví từ hàm getChangeAddress
        setWalletAddress(address); // Cập nhật state walletAddress với địa chỉ vừa lấy
      } else { // Nếu ví không kết nối
        setWalletAddress(""); // Reset địa chỉ ví về rỗng
        setTxHash(""); // Reset mã giao dịch khóa về rỗng
        setUnlockTxHash(""); // Reset mã giao dịch mở khóa về rỗng
        setInputTxHash(""); // Reset mã giao dịch đầu vào về rỗng
        setAdaAmount("10"); // Reset số lượng ADA về 10
        setLockUntilDate(""); // Reset thời gian khóa về rỗng
        setBeneficiaryAddress(""); // Reset địa chỉ người thụ hưởng về rỗng
        setStatus(""); // Reset thông báo trạng thái về rỗng
      }
    };
    fetchWalletAddress(); // Gọi hàm fetchWalletAddress để thực thi
  }, [connected, wallet]); // Dependency array: chạy lại khi connected hoặc wallet thay đổi

  const handleCopy = (text: string) => { // Hàm sao chép chuỗi vào clipboard
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`); // Hiển thị thông báo với 6 ký tự đầu của chuỗi
    setTimeout(() => setStatus(""), 2000); // Xóa thông báo sau 2 giây
  };

  async function lockVesting(adaAmount: string, lockUntil: string, beneficiary: string) { // Hàm khóa ADA vào hợp đồng vesting, nhận 3 tham số
    try { // Bắt đầu khối try để xử lý lỗi
      setLoading(true); // Bật trạng thái đang xử lý
      setStatus("Đang khởi tạo giao dịch khóa vesting..."); // Hiển thị thông báo đang khởi tạo giao dịch

      const lovelaceAmount = (parseFloat(adaAmount) * 1000000).toString(); // Chuyển ADA thành Lovelace (1 ADA = 1,000,000 Lovelace) và thành chuỗi
      if (isNaN(parseFloat(adaAmount)) || parseFloat(adaAmount) <= 0) { // Kiểm tra nếu số ADA không hợp lệ hoặc nhỏ hơn 0
        throw new Error("Vui lòng nhập số lượng ADA hợp lệ"); // Ném lỗi với thông báo
      }
      if (!lockUntil) { // Kiểm tra nếu thời gian khóa rỗng
        throw new Error("Vui lòng chọn thời gian khóa"); // Ném lỗi với thông báo
      }
      if (!beneficiary || !beneficiary.startsWith("addr")) { // Kiểm tra nếu địa chỉ người thụ hưởng rỗng hoặc không bắt đầu bằng "addr"
        throw new Error("Vui lòng nhập địa chỉ beneficiary hợp lệ"); // Ném lỗi với thông báo
      }

      const assets: Asset[] = [{ unit: "lovelace", quantity: lovelaceAmount }]; // Tạo mảng assets chứa số Lovelace sẽ khóa
      const utxos = await wallet.getUtxos(); // Lấy danh sách UTXO từ ví để chi tiêu
      const walletAddress = (await wallet.getUsedAddresses())[0]; // Lấy địa chỉ ví đầu tiên từ danh sách địa chỉ đã dùng
      const { scriptAddr } = getScript(blueprint.validators[0].compiledCode); // Lấy địa chỉ hợp đồng thông minh từ mã đã biên dịch
      const { pubKeyHash: ownerPubKeyHash } = deserializeAddress(walletAddress); // Lấy hash khóa công khai của chủ sở hữu từ địa chỉ ví
      const { pubKeyHash: beneficiaryPubKeyHash } = deserializeAddress(beneficiary); // Lấy hash khóa công khai của người thụ hưởng từ địa chỉ
      const lockUntilTimestamp = new Date(lockUntil).getTime(); // Chuyển thời gian khóa từ chuỗi thành timestamp (mili giây)
      const currentTime = Date.now(); // Lấy thời gian hiện tại (mili giây)
      if (lockUntilTimestamp <= currentTime) { // Kiểm tra nếu thời gian khóa không ở tương lai
        throw new Error("Thời gian khóa phải ở tương lai"); // Ném lỗi với thông báo
      }

      const txBuilder = getTxBuilder(); // Tạo một đối tượng txBuilder để xây dựng giao dịch
      await txBuilder // Bắt đầu cấu hình giao dịch
        .txOut(scriptAddr, assets) // Thêm đầu ra: gửi số Lovelace đến địa chỉ hợp đồng
        .txOutInlineDatumValue(mConStr0([lockUntilTimestamp, ownerPubKeyHash, beneficiaryPubKeyHash])) // Gắn dữ liệu inline (datum) chứa thời gian khóa, hash của owner và beneficiary
        .changeAddress(walletAddress) // Đặt địa chỉ nhận tiền thừa (change)
        .selectUtxosFrom(utxos) // Chọn UTXO từ danh sách để chi tiêu
        .setNetwork("preprod") // Đặt mạng blockchain là "preprod" (mạng thử nghiệm Cardano)
        .complete(); // Hoàn tất việc xây dựng giao dịch

      const unsignedTx = txBuilder.txHex; // Lấy giao dịch chưa ký dưới dạng hex
      const signedTx = await wallet.signTx(unsignedTx); // Ký giao dịch bằng ví
      const newTxHash = await wallet.submitTx(signedTx); // Gửi giao dịch đã ký lên blockchain và nhận mã giao dịch

      setTxHash(newTxHash); // Cập nhật state txHash với mã giao dịch mới
      setStatus(`Khóa vesting thành công! Tx Hash: ${newTxHash}`); // Hiển thị thông báo thành công với mã giao dịch
    } catch (error) { // Xử lý lỗi nếu xảy ra
      console.error("Lock Vesting Error:", error); // Ghi log lỗi ra console
      setStatus(`Lỗi khi khóa vesting: ${(error as Error).message}`); // Hiển thị thông báo lỗi
    } finally { // Khối finally luôn chạy dù thành công hay thất bại
      setLoading(false); // Tắt trạng thái đang xử lý
    }
  }

  async function unlockVesting(txHashToUnlock: string) { // Hàm mở khóa ADA từ hợp đồng, nhận mã giao dịch đã khóa
    try { // Bắt đầu khối try để xử lý lỗi
      setLoading(true); // Bật trạng thái đang xử lý
      setStatus("Đang mở khóa vesting..."); // Hiển thị thông báo đang mở khóa

      const utxo = await getUtxoByTxHash(txHashToUnlock); // Lấy thông tin UTXO từ mã giao dịch đã khóa
      const utxos = await wallet.getUtxos(); // Lấy danh sách UTXO từ ví để chi tiêu
      const walletAddress = (await wallet.getUsedAddresses())[0]; // Lấy địa chỉ ví đầu tiên từ danh sách địa chỉ đã dùng
      const collateral = (await wallet.getCollateral())[0]; // Lấy UTXO dùng làm collateral (tài sản thế chấp)
      if (!collateral) throw new Error("Không tìm thấy collateral."); // Nếu không có collateral, ném lỗi

      const datum = deserializeDatum<VestingDatum>(utxo.output.plutusData!); // Phân tích dữ liệu datum từ UTXO
      const lockUntil = datum.fields[0].int as number; // Lấy thời gian khóa từ datum (trường đầu tiên)
      const ownerPubKeyHash = datum.fields[1].bytes; // Lấy hash của owner từ datum (trường thứ hai)
      const beneficiaryPubKeyHash = datum.fields[2].bytes; // Lấy hash của beneficiary từ datum (trường thứ ba)
      const { scriptCbor } = getScript(blueprint.validators[0].compiledCode); // Lấy mã hợp đồng thông minh (dạng CBOR)

      const currentTime = Date.now(); // Lấy thời gian hiện tại (mili giây)
      const currentSlot = unixTimeToEnclosingSlot(currentTime, SLOT_CONFIG_NETWORK.preprod) + 450; // Chuyển thời gian hiện tại thành slot, cộng thêm 200 để đảm bảo an toàn
      const lockUntilSlot = unixTimeToEnclosingSlot(lockUntil, SLOT_CONFIG_NETWORK.preprod); // Chuyển thời gian khóa thành slot
      const { pubKeyHash: signerPubKeyHash } = deserializeAddress(walletAddress); // Lấy hash khóa công khai của người ký giao dịch

      const isOwner = signerPubKeyHash === ownerPubKeyHash; // Kiểm tra nếu người ký là owner
      const isBeneficiary = signerPubKeyHash === beneficiaryPubKeyHash; // Kiểm tra nếu người ký là beneficiary

      if (isBeneficiary && currentTime <= lockUntil) { // Nếu là beneficiary và chưa đến thời gian khóa
        throw new Error(`Chưa đến thời gian mở khóa! Lock until: ${new Date(lockUntil).toLocaleString()}`); // Ném lỗi với thông báo thời gian
      }

      const txBuilder = getTxBuilder(); // Tạo đối tượng txBuilder để xây dựng giao dịch
      if (isBeneficiary) { // Nếu người ký là beneficiary
        txBuilder.invalidBefore(lockUntilSlot); // Đặt điều kiện giao dịch chỉ hợp lệ sau slot khóa
      }
      await txBuilder // Bắt đầu cấu hình giao dịch
        .spendingPlutusScript("V3") // Chỉ định đây là giao dịch chi tiêu từ hợp đồng Plutus phiên bản V3
        .txIn(utxo.input.txHash, utxo.input.outputIndex, utxo.output.amount, utxo.output.address) // Thêm đầu vào từ UTXO đã khóa
        .spendingReferenceTxInInlineDatumPresent() // Xác nhận có dữ liệu inline trong đầu vào
        .spendingReferenceTxInRedeemerValue(mConStr0([])) // Gắn redeemer (điều kiện mở khóa, ở đây là rỗng)
        .txInScript(scriptCbor) // Gắn mã hợp đồng thông minh
        // .invalidHereafter(currentSlot + 100000) // Đặt giới hạn thời gian giao dịch (hết hạn sau currentSlot + 100000)
        .requiredSignerHash(signerPubKeyHash) // Yêu cầu chữ ký của người gửi
        .changeAddress(walletAddress) // Đặt địa chỉ nhận tiền thừa
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address) // Thêm collateral vào giao dịch
        .selectUtxosFrom(utxos) // Chọn UTXO từ danh sách để chi tiêu
        .setNetwork("preprod") // Đặt mạng blockchain là "preprod"
        .complete(); // Hoàn tất việc xây dựng giao dịch

      const unsignedTx = txBuilder.txHex; // Lấy giao dịch chưa ký dưới dạng hex
      const signedTx = await wallet.signTx(unsignedTx); // Ký giao dịch bằng ví
      const newTxHash = await wallet.submitTx(signedTx); // Gửi giao dịch đã ký lên blockchain và nhận mã giao dịch

      setUnlockTxHash(newTxHash); // Cập nhật state unlockTxHash với mã giao dịch mới
      setStatus(`Mở khóa thành công! Tx Hash: ${newTxHash}`); // Hiển thị thông báo thành công với mã giao dịch
    } catch (error) { // Xử lý lỗi nếu xảy ra
      console.error("Unlock Vesting Error:", error); // Ghi log lỗi ra console
      setStatus(`Lỗi khi mở khóa: ${(error as Error).message}`); // Hiển thị thông báo lỗi
    } finally { // Khối finally luôn chạy dù thành công hay thất bại
      setLoading(false); // Tắt trạng thái đang xử lý
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