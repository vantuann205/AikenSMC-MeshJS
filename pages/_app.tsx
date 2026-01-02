import "../styles/globals.css";
import "@meshsdk/react/styles.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";

// Component dropdown riêng
function TransactionDropdown() {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ position: "relative" }}
    >
      <span style={{ color: "white", textDecoration: "none", cursor: "pointer" }}>
        Transaction
      </span>
      {isHovering && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            backgroundColor: "#444",
            padding: "0.5rem",
            borderRadius: "4px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
            zIndex: 10,
          }}
        >
          <Link
            href="/transaction/single-signature"
            style={{
              display: "block",
              color: "white",
              textDecoration: "none",
              padding: "0.3rem 0",
            }}
          >
            Single Signature
          </Link>
          <Link
            href="/transaction/multiple-signature"
            style={{
              display: "block",
              color: "white",
              textDecoration: "none",
              padding: "0.3rem 0",
            }}
          >
            Multiple Signature
          </Link>
          <Link
            href="/transaction/nft-cip25w_native"
            style={{
              display: "block",
              color: "white",
              textDecoration: "none",
              padding: "0.3rem 0",
            }}
          >
            Mint NFT (CIP-25 With NativeSC)
          </Link>
          <Link
            href="/transaction/nft-cip25w_plutus"
            style={{
              display: "block",
              color: "white",
              textDecoration: "none",
              padding: "0.3rem 0",
            }}
          >
            Mint NFT (CIP-25 With Plutus)
          </Link>
          <Link
            href="/transaction/nft-cip68"
            style={{
              display: "block",
              color: "white",
              textDecoration: "none",
              padding: "0.3rem 0",
            }}
          >
            Mint NFT (CIP-68 With Plutus)
          </Link>
          <Link
            href="/transaction/update-nftcip68"
            style={{
              display: "block",
              color: "white",
              textDecoration: "none",
              padding: "0.3rem 0",
            }}
          >
            Update NFT-CIP68
          </Link>
        </div>
      )}
    </div>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Không hiển thị navbar trên /login hoặc /register
  const showNavbar = !["/login", "/register"].includes(router.pathname);

  return (
    <MeshProvider>
      {showNavbar && (
        <nav
          style={{
            backgroundColor: "#333",
            padding: "1rem",
            display: "flex",
            gap: "1rem",
            position: "relative",
          }}
        >
          <TransactionDropdown />
          <Link href="/" style={{ color: "white", textDecoration: "none" }}>
            Hello World
          </Link>
          <Link href="/vesting" style={{ color: "white", textDecoration: "none" }}>
            Vesting
          </Link>
        </nav>
      )}
      <Component {...pageProps} />
    </MeshProvider>
  );
}

export default MyApp;