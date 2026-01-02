"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@meshsdk/react";
import { Asset, BlockfrostProvider, deserializeAddress } from "@meshsdk/core";
import { CardanoWallet } from "@meshsdk/react";
import styles from "../../styles/index.module.css";
import updateTokens from "../../service/update";
import { X, Upload } from "lucide-react";

// Hàm fetchMetadata
const fetchMetadata = async (assetUnit: string, blockfrostApiKey: string) => {
  try {
    const provider = new BlockfrostProvider(blockfrostApiKey);
    const asset = await provider.fetchAssetMetadata(assetUnit);
    console.log("Fetched metadata:", asset);
    return asset.onchain_metadata || {};
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return {};
  }
};

const UpdateNFT: React.FC = () => {
  const { connected, wallet } = useWallet();
  const [nfts, setNfts] = useState<Asset[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [selectedAssetName, setSelectedAssetName] = useState("");
  const [nftName, setNftName] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("none");
  const [metadata, setMetadata] = useState([{ key: "", value: "" }]);
  const [txHash, setTxHash] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [status, setStatus] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [ipfsHash, setIpfsHash] = useState("");

  // Fetch NFTs
  const fetchNFTs = async () => {
    try {
      if (wallet) {
        const assets = await wallet.getAssets();
        const cip68Nfts = assets.filter(
          (asset) =>
            asset.unit.includes("000643b0") || asset.unit.includes("000de140")
        );
        console.log("CIP-68 NFTs:", cip68Nfts);
        setNfts(cip68Nfts);
      }
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      setStatus("Không thể tải danh sách NFT.");
    }
  };

  // Fetch metadata khi chọn Policy ID và Asset Name
  useEffect(() => {
    if (connected && wallet) {
      fetchNFTs();
    }
  }, [connected, wallet]);

  useEffect(() => {
    if (selectedPolicyId && selectedAssetName) {
      const assetUnit = selectedPolicyId + selectedAssetName;
      console.log("Fetching metadata for assetUnit:", assetUnit);
      fetchMetadata(assetUnit, "preprodNCrPaDqdsCHvUf2uYbqb67R3Z5GP5ycR").then(
        (data) => {
          console.log("Processed metadata:", data);
          const pairs = Object.entries(data)
            .filter(
              ([key]) => !["name", "description", "contentType"].includes(key)
            )
            .map(([key, value]) => ({ key, value: String(value) }));
          setNftName(data.name || "");
          setDescription(data.description || "");
          setContentType(data.contentType || "none");
          setMetadata(pairs.length > 0 ? pairs : [{ key: "", value: "" }]);
        }
      );
    }
  }, [selectedPolicyId, selectedAssetName]);

  const addMetadataField = () => {
    setMetadata([...metadata, { key: "", value: "" }]);
  };

  const removeMetadataField = (index: number) => {
    if (metadata.length > 1) {
      const newMetadata = [...metadata];
      newMetadata.splice(index, 1);
      setMetadata(newMetadata);
    }
  };

  const updateMetadataField = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const newMetadata = [...metadata];
    newMetadata[index][field] = value;
    setMetadata(newMetadata);
  };

  const prepareMetadata = async () => {
    const useraddr = await wallet.getChangeAddress();
    const { pubKeyHash: userPubKeyHash } = deserializeAddress(useraddr);

    const metadataObj: Record<string, any> = {
      name: nftName,
      description: description,
      _pk: userPubKeyHash,
    };

    if (contentType !== "none") {
      metadataObj.contentType = contentType;
    }

    metadata.forEach((item) => {
      if (item.key && item.key.trim() !== "") {
        metadataObj[item.key] = item.value;
      }
    });

    return metadataObj;
  };

  const handleUpdateNFT = async () => {
    if (!connected) {
      setStatus("Ví chưa kết nối. Vui lòng kết nối ví trước.");
      return;
    }

    if (!selectedPolicyId || !selectedAssetName) {
      setStatus("Vui lòng chọn Policy ID và Asset Name.");
      return;
    }

    if (!nftName.trim()) {
      setStatus("Vui lòng nhập tên NFT.");
      return;
    }

    try {
      setIsUpdating(true);
      setStatus("Đang xử lý giao dịch...");

      const metadataObj = await prepareMetadata();
      const assetNameHex = selectedAssetName;

      const params = [
        {
          assetName: assetNameHex,
          metadata: metadataObj,
          txHash: txHash || undefined,
        },
      ];

      console.log("Calling updateTokens with params:", params); // Debug
      const txHashResult = await updateTokens(wallet, params);

      setStatus(`Cập nhật NFT thành công! Giao dịch: ${txHashResult}`);
      setTxHash(txHashResult);
    } catch (error: any) {
      console.error("Error updating NFT:", error);
      setStatus(
        `Cập nhật thất bại: ${error.message || "Kiểm tra console để biết chi tiết."}`
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
      setUploadStatus("");
      setIpfsHash("");
    }
  };

  const uploadToPinata = async () => {
    if (!uploadedFile) {
      setUploadStatus("Please select a file first");
      return;
    }

    setIsUploading(true);
    setUploadStatus("Uploading to IPFS...");

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const response = await fetch("/api/upload-to-pinata", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setIpfsHash(data.cid);
      setUploadStatus("File uploaded successfully!");
      
      // Add the IPFS hash to metadata
      const newMetadata = [...metadata];
      const ipfsIndex = newMetadata.findIndex(item => item.key === "ipfs");
      
      if (ipfsIndex >= 0) {
        newMetadata[ipfsIndex].value = data.cid;
      } else {
        newMetadata.push({ key: "ipfs", value: data.cid });
      }
      setMetadata(newMetadata);

    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Cập nhật NFT CIP-68</h1>

        {!connected && (
          <div className={styles.walletWrapper}>
            <CardanoWallet />
            <p className={styles.status}>Vui lòng kết nối ví để bắt đầu</p>
          </div>
        )}

        {connected && (
          <div className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Chọn Policy ID</label>
              <select
                className={styles.select}
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
              >
                <option value="">Chọn Policy ID</option>
                {Array.from(new Set(nfts.map((nft) => nft.unit.slice(0, 56)))).map(
                  (policyId) => (
                    <option key={policyId} value={policyId}>
                      {policyId.slice(0, 6)}...{policyId.slice(-6)}
                    </option>
                  )
                )}
              </select>
            </div>

            {selectedPolicyId && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Chọn Asset Name</label>
                <select
                  className={styles.select}
                  value={selectedAssetName}
                  onChange={(e) => setSelectedAssetName(e.target.value)}
                >
                  <option value="">Chọn Asset Name</option>
                  {nfts
                    .filter((nft) => nft.unit.startsWith(selectedPolicyId))
                    .map((nft) => {
                      const assetNameHex = nft.unit.slice(56);
                      const assetName = Buffer.from(assetNameHex, "hex").toString();
                      return (
                        <option key={assetNameHex} value={assetNameHex}>
                          {assetName}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}

            {selectedPolicyId && selectedAssetName && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Tên NFT</label>
                  <input
                    className={styles.txInput}
                    value={nftName}
                    onChange={(e) => setNftName(e.target.value)}
                    placeholder="Tên NFT"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Mô tả NFT</label>
                  <textarea
                    className={styles.txInput}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mô tả NFT"
                    rows={4}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Content Type</label>
                  <select
                    className={styles.select}
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="image/png">Image (PNG)</option>
                    <option value="image/jpeg">Image (JPEG)</option>
                    <option value="image/svg+xml">Image (SVG)</option>
                    <option value="audio/mp3">Audio (MP3)</option>
                    <option value="video/mp4">Video (MP4)</option>
                    <option value="application/json">JSON Data</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Thuộc tính Metadata</label>
                  {metadata.map((item, index) => (
                    <div key={index} className={styles.metadataPair}>
                      <input
                        className={styles.txInput}
                        value={item.key}
                        onChange={(e) =>
                          updateMetadataField(index, "key", e.target.value)
                        }
                        placeholder="Key (ví dụ: color)"
                      />
                      <input
                        className={styles.txInput}
                        value={item.value}
                        onChange={(e) =>
                          updateMetadataField(index, "value", e.target.value)
                        }
                        placeholder="Value (ví dụ: blue)"
                      />
                      <button
                        className={styles.removeButton}
                        onClick={() => removeMetadataField(index)}
                        disabled={metadata.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button className={styles.addButton} onClick={addMetadataField}>
                    + Thêm thuộc tính
                  </button>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Transaction Hash (Tùy chọn)</label>
                  <input
                    className={styles.txInput}
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Nhập transaction hash nếu có"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Upload File to IPFS</label>
                  <div className={styles.uploadContainer}>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className={styles.fileInput}
                      disabled={isUploading}
                    />
                    <button
                      className={styles.uploadButton}
                      onClick={uploadToPinata}
                      disabled={!uploadedFile || isUploading}
                    >
                      {isUploading ? (
                        "Uploading..."
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload to IPFS
                        </>
                      )}
                    </button>
                  </div>
                  {uploadStatus && (
                    <p className={styles.status}>{uploadStatus}</p>
                  )}
                  {ipfsHash && (
                    <div className={styles.ipfsHash}>
                      <p>IPFS Hash: {ipfsHash}</p>
                      <a
                        href={`https://ipfs.io/ipfs/${ipfsHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.ipfsLink}
                      >
                        View on IPFS
                      </a>
                    </div>
                  )}
                </div>

                <button
                  className={styles.actionButton}
                  onClick={handleUpdateNFT}
                  disabled={isUpdating || !connected}
                >
                  {isUpdating ? "Đang cập nhật..." : "Cập nhật NFT"}
                </button>
              </>
            )}

            {status && <p className={styles.status}>{status}</p>}
          </div>
        )}
      </div>
    </main>
  );
};

export default UpdateNFT;