import "../styles/globals.css";
import "@meshsdk/react/styles.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";
import Link from "next/link";
import { useState } from "react";

function MyApp({ Component, pageProps }: AppProps) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <MeshProvider>
      <nav
        style={{
          backgroundColor: "#333",
          padding: "1rem",
          display: "flex",
          gap: "1rem",
          position: "relative",
        }}
      >
        {/* Transaction với dropdown */}
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
            </div>
          )}
        </div>

        {/* Hello World */}
        <Link href="/" style={{ color: "white", textDecoration: "none" }}>
          Hello World
        </Link>

        {/* Vesting */}
        <Link href="/vesting" style={{ color: "white", textDecoration: "none" }}>
          Vesting
        </Link>
      </nav>
      <Component {...pageProps} />
    </MeshProvider>
  );
}

export default MyApp;