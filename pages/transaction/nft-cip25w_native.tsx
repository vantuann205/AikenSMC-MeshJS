import React, { useState } from "react";
import type { NextPage } from "next";
import { useWallet } from "@meshsdk/react";
import { resolveScriptHash, stringToHex, ForgeScript, MeshTxBuilder, BlockfrostProvider } from "@meshsdk/core";
import styles from "../../styles/index.module.css";
import { CardanoWallet } from "@meshsdk/react";
import CopyToClipboard from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";

const Home: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet();
  const [txHash, setTxHash] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [nftData, setNftData] = useState({
    name: "",
    description: "",
    imageUrl: "",
    quantity: "1",
  });
  const [status, setStatus] = useState<string>("");

  React.useEffect(() => {
  const fetchAddress = async () => {
    if (connected && wallet) {
      const address = await wallet.getChangeAddress();
      setWalletAddress(address);
    }
  };

  fetchAddress();
}, [connected, wallet]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setNftData({ ...nftData, [e.target.name]: e.target.value });
  };

  const mintNFT = async () => {
    try {
      if (!connected || !wallet) {
        setStatus("Vui lòng kết nối ví trước.");
        return;
      }

      if (!nftData.name || !nftData.imageUrl || !nftData.description) {
        setStatus("Vui lòng nhập đầy đủ thông tin NFT, bao gồm link IPFS.");
        return;
      }

      // Kiểm tra định dạng link IPFS (tùy chọn)
      if (!nftData.imageUrl.startsWith("ipfs://")) {
        setStatus("Link ảnh phải bắt đầu bằng 'ipfs://'.");
        return;
      }

      setStatus("Đang xử lý giao dịch...");
      const provider = new BlockfrostProvider("preprodNCrPaDqdsCHvUf2uYbqb67R3Z5GP5ycR");
      const utxos = await wallet.getUtxos();
      const changeAddress = await wallet.getChangeAddress();
      const forgingScript = ForgeScript.withOneSignature(changeAddress);

      const policyId = resolveScriptHash(forgingScript);
      const tokenNameHex = stringToHex(nftData.name);

      const metadata = {
          [policyId]: {
            [nftData.name]: {
              name: nftData.name,
              image: nftData.imageUrl, // Sử dụng trực tiếp link IPFS từ người dùng
              description: nftData.description,
              mediaType: "image/jpg", // Giả định là jpeg, có thể cần thêm logic để lấy từ link
            },
        },
      };

      const txBuilder = new MeshTxBuilder({
        fetcher: provider,
        verbose: true,
      });

      const unsignedTx = await txBuilder
        .mint(nftData.quantity, policyId, tokenNameHex)
        .mintingScript(forgingScript)
        .metadataValue("721", metadata)
        .changeAddress(changeAddress)
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(unsignedTx);
      const txHash = await wallet.submitTx(signedTx);
      setTxHash(txHash);
      setStatus("Mint NFT thành công! Giao dịch: " + txHash);
    } catch (error) {
      console.error("Minting NFT thất bại:", error);
      setStatus("Giao dịch thất bại. Kiểm tra console để biết thêm chi tiết.");
    }
  };

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép: ${text.slice(0, 6)}...${text.slice(-6)}`);
    setTimeout(() => setStatus(""), 2000);
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Mint NFT trên Cardano (CIP-25 with NatvieSC)</h1>

      {!connected && (
        <div className={styles.walletWrapper}>
          <CardanoWallet />
          <p className={styles.status}>Vui lòng kết nối ví để bắt đầu</p>
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

          <div className={styles.inputButtonContainer}>
            <button
              className={styles.actionButton}
              onClick={async () => {
                try {
                  await disconnect();
                  setStatus("Ngắt kết nối ví thành công.");
                  setWalletAddress("");
                } catch (error) {
                  console.error("Disconnect Error:", error);
                  setStatus("Không thể ngắt kết nối ví.");
                }
              }}
            >
              Ngắt kết nối ví
            </button>
          </div>

          <div className={styles.inputButtonContainer}>
            <input
              className={styles.txInput}
              type="text"
              name="name"
              placeholder="Tên NFT"
              value={nftData.name}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputButtonContainer}>
            <textarea
              className={styles.txInput}
              name="description"
              placeholder="Mô tả NFT"
              value={nftData.description}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div className={styles.inputButtonContainer}>
            <input
              className={styles.txInput}
              type="text"
              name="imageUrl" // Thay đổi thành imageUrl
              placeholder="Link IPFS (ipfs://...)"
              value={nftData.imageUrl}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputButtonContainer}>
            <input
              className={styles.txInput}
              type="number"
              name="quantity"
              step="1"
              min="1"
              placeholder="Số lượng"
              value={nftData.quantity}
              onChange={handleChange}
            />
          </div>

          <div className={styles.inputButtonContainer}>
            <button
              className={styles.actionButton}
              onClick={mintNFT}
              disabled={!connected}
            >
              Mint NFT
            </button>
          </div>

          {txHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Tx Hash: <a href={`https://cardanoscan.io/transaction/${txHash}`} target="_blank">{txHash}</a>
              </p>
              <CopyToClipboard text={txHash} onCopy={() => handleCopy(txHash)}>
                <span className={styles.copyIcon}>
                  <FaCopy />
                </span>
              </CopyToClipboard>
            </div>
          )}
        </>
      )}

      {status && <p className={styles.status}>{status}</p>}
    </div>
  );
};

export default Home;