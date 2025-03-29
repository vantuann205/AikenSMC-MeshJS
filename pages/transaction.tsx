import React, { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import { useWallet, CardanoWallet } from '@meshsdk/react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { FaCopy } from 'react-icons/fa';
import { getScript, getTxBuilder, getUtxoByTxHash } from './common';
import styles from '../styles/index.module.css';

const TransferADAPage: NextPage = () => {
  const { wallet, connected, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');
  const [adaAmount, setAdaAmount] = useState<string>('10');
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('');

  // Chuyển đổi ADA sang Lovelace
  const convertToLovelace = (ada: string): string => {
    const adaNum = parseFloat(ada);
    if (isNaN(adaNum) || adaNum <= 0) throw new Error('Số ADA không hợp lệ');
    return (adaNum * 1000000).toString();
  };

  // Kết nối ví và lấy địa chỉ
  const handleWalletConnect = async () => {
    try {
      if (connected && wallet) {
        const address = await wallet.getChangeAddress();
        setWalletAddress(address);
        setStatus('Đã kết nối ví!');
      }
    } catch (error) {
    }
  };

  // Gửi ADA
  const handleTransferADA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('Đang gửi ADA...');
    try {
      if (!connected || !wallet) throw new Error('Vui lòng kết nối ví trước!');

      const amountLovelace = convertToLovelace(adaAmount);
      const utxos = await wallet.getUtxos();
      const txBuilder = getTxBuilder();

      const unsignedTx = await txBuilder
        .txOut(recipientAddress, [{ unit: 'lovelace', quantity: amountLovelace }])
        .changeAddress(await wallet.getChangeAddress())
        .selectUtxosFrom(utxos)
        .complete();

      const signedTx = await wallet.signTx(unsignedTx);
      const txHashResult = await wallet.submitTx(signedTx);

      setTxHash(txHashResult);
      setStatus('Đã gửi ADA thành công!');
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  // Xử lý sao chép
  const handleCopy = (text: string) => {
    setStatus(`Đã sao chép ${text.slice(0, 6)}... vào clipboard!`);
    setTimeout(() => setStatus(''), 2000);
  };

  // Tự động lấy địa chỉ ví khi connected thay đổi
  useEffect(() => {
    if (connected) {
      handleWalletConnect();
    } else {
      setWalletAddress('');
      setTxHash('');
      setRecipientAddress('');
      setAdaAmount('10');
      setStatus('');
    }
  }, [connected]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Transfer ADA</h1>
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
                setStatus('Đã ngắt kết nối ví.');
              } catch (error) {
                console.error('Disconnect Error:', error);
                setStatus('Không thể ngắt kết nối ví.');
              }
            }}
          >
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
              disabled={loading}
            />
            <input
              type="text"
              value={adaAmount}
              onChange={(e) => setAdaAmount(e.target.value)}
              placeholder="Amount (ADA)"
              className={styles.txInput}
              disabled={loading}
            />
            <button type="submit" className={styles.actionButton} disabled={loading}>
              {loading ? 'Sending...' : 'Send ADA'}
            </button>
          </form>

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
        </>
      )}

      {status && (
        <div className={styles.status}>
          {status}
        </div>
      )}
    </div>
  );
};

export default TransferADAPage;