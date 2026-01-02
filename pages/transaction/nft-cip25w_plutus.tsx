/**
 * NFT One-Shot Minting với Aiken Smart Contract
 * 
 * Logic hoạt động:
 * 1. Sử dụng UTXO đầu tiên của ví làm parameter cố định cho smart contract
 * 2. Policy ID được tạo từ script + UTXO này (luôn giống nhau)
 * 3. Lần mint đầu tiên: UTXO được tiêu thụ, mint thành công
 * 4. Lần mint thứ 2: UTXO không còn tồn tại → smart contract từ chối
 * 5. Không cần lưu trữ gì, smart contract tự xác minh
 * 
 * Smart contract Aiken sẽ kiểm tra:
 * - UTXO required_utxo có được tiêu thụ trong transaction không
 * - Chỉ mint đúng 1 asset với quantity = 1
 * - Nếu UTXO đã bị tiêu thụ trước đó → transaction fail
 */

import React, { useState } from "react";
import type { NextPage } from "next";
import { useWallet } from "@meshsdk/react";
import {
  MeshTxBuilder,
  BlockfrostProvider,
  mConStr0,
  resolveScriptHash,
  stringToHex,
  UTxO,
  applyParamsToScript
} from "@meshsdk/core";
import styles from "../../styles/index.module.css";
import { CardanoWallet } from "@meshsdk/react";
import CopyToClipboard from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import blueprint from "../../nft-smc/plutus.json";

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
  const [fixedUtxo, setFixedUtxo] = useState<UTxO | null>(null);

  React.useEffect(() => {
    const fetchAddress = async () => {
      if (connected && wallet) {
        const address = await wallet.getChangeAddress();
        setWalletAddress(address);
        
        // Lấy UTXO đầu tiên làm UTXO cố định cho tất cả các lần mint
        const utxos = await wallet.getUtxos();
        if (utxos.length > 0) {
          setFixedUtxo(utxos[0]); // Luôn sử dụng UTXO đầu tiên
        }
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
  
      if (!nftData.imageUrl.startsWith("ipfs://")) {
        setStatus("Link ảnh phải bắt đầu bằng 'ipfs://'.");
        return;
      }

      if (!fixedUtxo) {
        setStatus("Không tìm thấy UTXO cố định để sử dụng.");
        return;
      }
  
      setStatus("Đang xử lý giao dịch...");
      const provider = new BlockfrostProvider("preprodNCrPaDqdsCHvUf2uYbqb67R3Z5GP5ycR");
      const utxos = await wallet.getUtxos();
      const changeAddress = await wallet.getChangeAddress();
  
      // Kiểm tra và lấy collateral
      const collaterals = await wallet.getCollateral();
      const collateral: UTxO = collaterals[0];
  
      // Lấy script từ plutus.json
      const mintValidator = blueprint.validators.find(
        (v) => v.title === "nft.one_shot_mint.mint"
      );
      
      if (!mintValidator) {
        setStatus("Không tìm thấy validator trong plutus.json");
        return;
      }

      // Sử dụng UTXO cố định làm parameter cho tất cả các lần mint
      const utxoKey = `${fixedUtxo.input.txHash}#${fixedUtxo.input.outputIndex}`;
      
      // Tạo parameter cho required_utxo (OutputReference)
      const requiredUtxoParam = mConStr0([
        fixedUtxo.input.txHash,
        fixedUtxo.input.outputIndex
      ]);

      // Apply parameters to script - Policy ID sẽ luôn giống nhau vì dùng cùng UTXO
      const scriptWithParams = applyParamsToScript(mintValidator.compiledCode, [requiredUtxoParam]);
      const policyId = resolveScriptHash(scriptWithParams, "V3");
      const tokenNameHex = stringToHex(nftData.name);

      setStatus(`Sử dụng UTXO cố định: ${utxoKey} cho one-shot minting...`);
  
      // Metadata theo chuẩn CIP-25
      const metadata = {
        "721": {
          [policyId]: {
            [nftData.name]: {
              name: nftData.name,
              image: nftData.imageUrl,
              description: nftData.description,
              mediaType: "image/jpeg",
            },
          },
        },
      };

      // Tạo redeemer cho Action::Mint
      const redeemer = mConStr0([]); // Action::Mint không có fields
  
      const txBuilder = new MeshTxBuilder({
        fetcher: provider,
        verbose: true,
      });
  
      const unsignedTx = await txBuilder
        .mintPlutusScriptV3() // Sử dụng Plutus script V3
        .mint("1", policyId, tokenNameHex) // Mint đúng 1 NFT (one-shot)
        .mintingScript(scriptWithParams) // Sử dụng script với parameters
        .mintRedeemerValue(redeemer) // Redeemer Action::Mint
        .txIn(
          fixedUtxo.input.txHash,
          fixedUtxo.input.outputIndex,
          fixedUtxo.output.amount,
          fixedUtxo.output.address
        ) // Đảm bảo UTXO cố định được consume
        .metadataValue("721", metadata["721"]) // Metadata CIP-25
        .changeAddress(changeAddress)
        .selectUtxosFrom(utxos)
        .txInCollateral(
          collateral.input.txHash,
          collateral.input.outputIndex,
          collateral.output.amount,
          collateral.output.address
        )
        .setNetwork("preprod")
        .complete();
  
      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);
      
      setTxHash(txHash);
      setStatus("Mint NFT thành công! Giao dịch: " + txHash);
    } catch (error) {
      console.error("Minting NFT thất bại:", error);
      setStatus(`Giao dịch thất bại: ${error instanceof Error ? error.message : "Kiểm tra console để biết thêm chi tiết."}`);
    }
  };

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép: ${text.slice(0, 6)}...${text.slice(-6)}`);
    setTimeout(() => setStatus(""), 2000);
  };

  // Phần giao diện giữ nguyên
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Mint NFT One-Shot - Mỗi Ví Chỉ 1 Lần</h1>

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
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
              Smart contract sử dụng logic one-shot minting: sử dụng UTXO cố định làm parameter. 
              Sau khi mint lần đầu, UTXO này bị tiêu thụ và không thể mint lần nào nữa.
            </p>
            {fixedUtxo && (
              <p style={{ fontSize: '12px', color: '#0066cc', marginBottom: '10px' }}>
                UTXO cố định: {fixedUtxo.input.txHash.slice(0, 8)}...#{fixedUtxo.input.outputIndex}
              </p>
            )}
          </div>

          <div className={styles.inputButtonContainer}>
            <button
              className={styles.actionButton}
              onClick={async () => {
                try {
                  await disconnect();
                  setStatus("Ngắt kết nối ví thành công.");
                  setWalletAddress("");
                  setFixedUtxo(null);
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
              name="imageUrl"
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
              max="1"
              placeholder="Số lượng (chỉ 1 NFT)"
              value="1"
              onChange={handleChange}
              disabled
            />
          </div>

          <div className={styles.inputButtonContainer}>
            <button
              className={styles.actionButton}
              onClick={mintNFT}
              disabled={!connected || !fixedUtxo}
            >
              Mint NFT (One-Shot)
            </button>
          </div>

          {txHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Tx Hash:{" "}
                <a href={`https://cardanoscan.io/transaction/${txHash}`} target="_blank">
                  {txHash}
                </a>
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

