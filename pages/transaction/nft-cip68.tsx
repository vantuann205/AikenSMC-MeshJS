import React, { useState, useEffect, useRef } from "react";
import type { NextPage } from "next";
import { useWallet } from "@meshsdk/react";
import {
  CIP68_222,
  CIP68_100,
  stringToHex,
  mConStr0,
  metadataToCip68,
  deserializeAddress,
  MeshTxBuilder,
  applyParamsToScript,
  resolveScriptHash,
  serializeAddressObj,
  serializePlutusScript,
  BlockfrostProvider,
  scriptAddress,
} from "@meshsdk/core";
import { CardanoWallet } from "@meshsdk/react";
import CopyToClipboard from "react-copy-to-clipboard";
import { FaCopy } from "react-icons/fa";
import Link from "next/link";
import { PinataSDK } from "pinata";
import plutus from "../../nftcip68-smc/plutus.json";
import styles from "../../styles/index.module.css";

const PLATFORM_FEE = "1000000";
const DEFAULT_EXCHANGE_ADDRESS =
  "addr_test1qzzdhw4rp6aw2fnwdt4kyqa28u63l36t5246s6u9z9g2g38u5ng72qq828yvhzxn5qlz2e2u9u0u2lc053ljc5lg5pwq7ev63j";

const blockchainProvider = new BlockfrostProvider(
  "preprodNCrPaDqdsCHvUf2uYbqb67R3Z5GP5ycR"
);

// Pinata configuration
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIwZGFmNmJkMy05YTdlLTRhZTEtOWU1NC0xODVhNGM4OWUwMjUiLCJlbWFpbCI6InZhbnR1YW4xMzIwMDVAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImQ2MjM1NTQwY2I5NmNkNDE1Zjk2Iiwic2NvcGVkS2V5U2VjcmV0IjoiNmI0MzU3NmJhNzlhMDQ2ZDM5YzI1ZWFhMDJjZjEwYTYyNmVmYmZkODI3N2MxZDRkMzEwYTQxZThmMjE2ZTA3MiIsImV4cCI6MTc3ODMwNTU2M30.0KG6LZhGgF4wtZCAX_ArYPkl5V8sYkfDwvYOZLQI1UQ";
const pinataGateway = "magenta-wrong-impala-313.mypinata.cloud"; // TODO: Xác nhận gateway này đúng với tài khoản Pinata của bạn
const pinata = new PinataSDK({ pinataJwt: JWT, pinataGateway: pinataGateway });

function readValidator(title: string): string {
  const validator = plutus.validators.find((v: { title: string }) => v.title === title);
  if (!validator) throw new Error(`${title} validator not found.`);
  return validator.compiledCode;
}

async function getWalletInfoForTx(wallet: any) {
  const utxos = await wallet.getUtxos();
  const walletAddress = await wallet.getChangeAddress();
  const collateral = (await wallet.getCollateral())[0];
  return { utxos, walletAddress, collateral };
}

async function mintNFT(
  wallet: any,
  tokenName: string,
  metadata: any,
  options?: {
    platformFee?: string;
    exchangeAddress?: string;
  }
): Promise<string> {
  try {
    const platformFee = options?.platformFee || PLATFORM_FEE;
    const exChange = options?.exchangeAddress || DEFAULT_EXCHANGE_ADDRESS;

    const { utxos, walletAddress, collateral } = await getWalletInfoForTx(wallet);
    if (!walletAddress || !exChange) {
      throw new Error("Địa chỉ ví hoặc địa chỉ exchange không hợp lệ.");
    }

    const walletAddr = deserializeAddress(walletAddress);
    const exchangeAddr = deserializeAddress(exChange);
    const userPubKeyHash = walletAddr.pubKeyHash;
    const pubkeyExchange = exchangeAddr.pubKeyHash;
    const stakeCredentialHash = exchangeAddr.stakeCredentialHash;

    if (!userPubKeyHash || !pubkeyExchange) {
      throw new Error("Không thể lấy pubKeyHash từ địa chỉ ví hoặc exchange.");
    }
    if (!stakeCredentialHash) {
      console.warn("stakeCredentialHash is undefined. Using empty string as fallback.");
    }

    const mintCompilecode = readValidator("nftcip68.mint.mint");
    const storeCompilecode = readValidator("store.store.spend");

    const storeScriptCbor = applyParamsToScript(storeCompilecode, [
      pubkeyExchange,
      BigInt(1),
      userPubKeyHash,
    ]);
    const storeScript = {
      code: storeScriptCbor,
      version: "V3" as "V3",
    };

    const storeAddress = serializeAddressObj(
      scriptAddress(
        deserializeAddress(serializePlutusScript(storeScript, undefined, 0, false).address).scriptHash,
        stakeCredentialHash || undefined,
        false
      ),
      0
    );

    const txBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    const storeScriptHash = deserializeAddress(storeAddress).scriptHash;
    if (!storeScriptHash) {
      throw new Error("Không thể lấy storeScriptHash từ storeAddress.");
    }

    const mintScriptCbor = applyParamsToScript(mintCompilecode, [
      pubkeyExchange,
      BigInt(1),
      storeScriptHash,
      stakeCredentialHash || "",
      userPubKeyHash,
    ]);

    const policyId = resolveScriptHash(mintScriptCbor, "V3");
    const hexAssetName = stringToHex(tokenName);

    console.log(`Minting NFT with Policy ID: ${policyId}`); // Debug
    console.log(`Reference Token Unit: ${policyId + CIP68_100(hexAssetName)}`); // Debug
    console.log(`User Token Unit: ${policyId + CIP68_222(hexAssetName)}`); // Debug
    console.log(`Store Address: ${storeAddress}`); // Debug

    const unsignedTx = txBuilder.mintPlutusScriptV3();

    unsignedTx
      // Mint user token (CIP68_222)
      .mint("1", policyId, CIP68_222(hexAssetName))
      .mintingScript(mintScriptCbor)
      .mintRedeemerValue(mConStr0([]))
      // Mint reference token (CIP68_100)
      .mintPlutusScriptV3()
      .mint("1", policyId, CIP68_100(hexAssetName))
      .mintingScript(mintScriptCbor)
      .mintRedeemerValue(mConStr0([]))
      // Store reference token with metadata
      .txOut(storeAddress, [
        {
          unit: policyId + CIP68_100(hexAssetName),
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(metadataToCip68(metadata))
      // Send user token to wallet
      .txOut(walletAddress, [
        {
          unit: policyId + CIP68_222(hexAssetName),
          quantity: "1",
        },
      ])
      // Add platform fee payment
      .txOut(exChange, [
        {
          unit: "lovelace",
          quantity: platformFee,
        },
      ])
      .changeAddress(walletAddress)
      .requiredSignerHash(userPubKeyHash)
      .selectUtxosFrom(utxos)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .setNetwork("preprod");

    const completedTx = await unsignedTx.complete();
    const signedTx = await wallet.signTx(completedTx, true);
    const txHash = await wallet.submitTx(signedTx);

    console.log(`Mint Transaction Hash: ${txHash}`); // Debug
    return txHash;
  } catch (error) {
    console.error("Mint error:", error);
    throw error;
  }
}

const Home: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet();
  const [txHash, setTxHash] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("/placeholder.svg?height=300&width=300");
  const [nftData, setNftData] = useState({
    name: "",
    description: "",
  });
  const [metadataPairs, setMetadataPairs] = useState<
    { key: string; value: string }[]
  >([{ key: "", value: "" }]);
  const [status, setStatus] = useState<string>("");
  const [nfts, setNfts] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (connected && wallet) {
      const addressPromise = wallet.getChangeAddress();
      if (addressPromise instanceof Promise) {
        addressPromise.then((address) => setWalletAddress(address));
      } else {
        setWalletAddress(addressPromise);
      }
      fetchNFTs();
    }
  }, [connected, wallet]);

  const fetchNFTs = async () => {
    try {
      if (wallet) {
        const assets = await wallet.getAssets();
        const cip68Nfts = assets.filter(
          (asset) =>
            asset.unit.includes("000643b0") || asset.unit.includes("000de140")
        );
        console.log("Fetched NFTs:", cip68Nfts); // Debug
        setNfts(cip68Nfts);
      }
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      setStatus("Không thể tải danh sách NFT.");
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setNftData({ ...nftData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(droppedFile);
    }
  };

  const handleMetadataChange = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const updatedPairs = [...metadataPairs];
    updatedPairs[index][field] = value;
    setMetadataPairs(updatedPairs);
  };

  const addMetadataPair = () => {
    setMetadataPairs([...metadataPairs, { key: "", value: "" }]);
  };

  const removeMetadataPair = (index: number) => {
    if (metadataPairs.length > 1) {
      setMetadataPairs(metadataPairs.filter((_, i) => i !== index));
    }
  };

  const uploadToPinata = async (file: File) => {
    try {
      console.log("Uploading file to Pinata:", file.name, file.size, file.type); // Debug
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      console.log("API response status:", response.status); // Debug
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API error details:", errorData); // Debug
        throw new Error(`Upload failed with status ${response.status}: ${errorData.error || "Unknown error"}`);
      }

      const data = await response.json();
      console.log("API response data:", data); // Debug
      if (!data.cid) {
        throw new Error("No CID returned from Pinata API");
      }

      return `ipfs://${data.cid}`;
    } catch (error: any) {
      console.error("Pinata upload error:", error.message, error.stack); // Debug
      throw new Error(`Không thể upload file lên Pinata: ${error.message}`);
    }
  };

  const handleMintNFT = async () => {
    try {
      if (!connected || !wallet) {
        setStatus("Vui lòng kết nối ví trước.");
        return;
      }

      if (!nftData.name || !nftData.description || !file) {
        setStatus("Vui lòng nhập đầy đủ tên, mô tả và chọn file ảnh.");
        return;
      }

      setStatus("Đang xử lý giao dịch...");

      const imageUrl = await uploadToPinata(file);

      const metadata: { [key: string]: any } = {
        name: nftData.name,
        description: nftData.description,
        mediaType: file.type || "image/jpg",
        image: imageUrl,
      };

      metadataPairs.forEach((pair) => {
        if (pair.key && pair.value) {
          metadata[pair.key] = pair.value;
        }
      });

      const txHash = await mintNFT(wallet, nftData.name, metadata, {
        platformFee: PLATFORM_FEE,
        exchangeAddress: DEFAULT_EXCHANGE_ADDRESS,
      });

      setTxHash(txHash);
      setStatus(`Mint NFT thành công! Giao dịch: ${txHash}`);
      fetchNFTs();
    } catch (error: any) {
      console.error("Minting NFT thất bại:", error);
      setStatus(`Giao dịch thất bại: ${error.message || "Kiểm tra console để biết chi tiết."}`);
    }
  };

  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép: ${text.slice(0, 6)}...${text.slice(-6)}`);
    setTimeout(() => setStatus(""), 2000);
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Mint NFT trên Cardano (CIP-68)</h1>

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
            <CopyToClipboard
              text={walletAddress}
              onCopy={() => handleCopy(walletAddress)}
            >
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
                  setNfts([]);
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
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                border: "2px dashed #ccc",
                padding: "20px",
                textAlign: "center",
                marginBottom: "10px",
                cursor: "pointer",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <p>Kéo và thả ảnh vào đây hoặc nhấp để chọn</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: "none" }}
              />
            </div>
            {file && <span>{file.name}</span>}
            {previewUrl && (
              <div style={{ marginTop: "10px", textAlign: "center" }}>
                <img
                  src={previewUrl}
                  alt="NFT Preview"
                  style={{ maxWidth: "300px", maxHeight: "300px", borderRadius: "8px" }}
                />
              </div>
            )}
          </div>

          <div className={styles.inputButtonContainer}>
            <h3 style={{ fontSize: "1.2rem", marginBottom: "10px", color: "white" }}>
              Thêm thuộc tính Metadata
            </h3>
            {metadataPairs.map((pair, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "10px",
                  alignItems: "center",
                }}
              >
                <input
                  className={styles.txInput}
                  type="text"
                  placeholder="Key (ví dụ: color)"
                  value={pair.key}
                  onChange={(e) =>
                    handleMetadataChange(index, "key", e.target.value)
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "5px",
                    fontSize: "1rem",
                  }}
                />
                <input
                  className={styles.txInput}
                  type="text"
                  placeholder="Value (ví dụ: blue)"
                  value={pair.value}
                  onChange={(e) =>
                    handleMetadataChange(index, "value", e.target.value)
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "5px",
                    fontSize: "1rem",
                  }}
                />
                {metadataPairs.length > 1 && (
                  <button
                    onClick={() => removeMetadataPair(index)}
                    style={{
                      padding: "10px",
                      backgroundColor: "#e53e3e",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                      fontSize: "1rem",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor = "#c53030")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.backgroundColor = "#e53e3e")
                    }
                  >
                    -
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addMetadataPair}
              style={{
                padding: "10px 20px",
                backgroundColor: "#3182ce",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "1rem",
                marginTop: "10px",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#2b6cb0")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#3182ce")
              }
            >
              + Thêm thuộc tính
            </button>
          </div>

          <div className={styles.inputButtonContainer}>
            <button
              className={styles.actionButton}
              onClick={handleMintNFT}
              disabled={!connected}
            >
              Mint NFT
            </button>
          </div>

          {txHash && (
            <div className={styles.addressContainer}>
              <p className={styles.txHash}>
                Tx Hash:{" "}
                <a
                  href={`https://cardanoscan.io/transaction/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {txHash}
                </a>
              </p>
              <CopyToClipboard
                text={txHash}
                onCopy={() => handleCopy(txHash)}
              >
                <span className={styles.copyIcon}>
                  <FaCopy />
                </span>
              </CopyToClipboard>
            </div>
          )}

          {nfts.length > 0 && (
            <div className={styles.nftList}>
              <h2>Danh sách NFT đã Mint</h2>
              <div className={styles.nftGrid}>
                {nfts.map((nft, index) => (
                  <Link
                    key={index}
                    href={`/transaction/${nft.unit}`}
                    className={styles.nftCard}
                  >
                    <div>
                      <p>
                        Tên: {Buffer.from(nft.unit.slice(64), "hex").toString()}
                      </p>
                      <p>Policy ID: {nft.unit.slice(0, 56)}</p>
                      <p>Số lượng: {nft.quantity}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {status && <p className={styles.status}>{status}</p>}
    </div>
  );
};

export default Home;