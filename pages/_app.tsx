import "../styles/globals.css";
import "@meshsdk/react/styles.css";
import type { AppProps } from "next/app";
import { MeshProvider } from "@meshsdk/react";
import Link from "next/link"; // Thêm import này để dùng Link

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <MeshProvider>
      {/* Thêm thanh điều hướng (Navbar) */}
      <nav style={{
        backgroundColor: "#333",
        padding: "1rem",
        display: "flex",
        gap: "1rem",
      }}>
        <Link href="/" style={{ color: "white", textDecoration: "none" }}>
          Hello World
        </Link>
        <Link href="/vesting" style={{ color: "white", textDecoration: "none" }}>
          Vesting
        </Link>
      </nav>
      {/* Giữ nguyên phần nội dung gốc */}
      <Component {...pageProps} />
    </MeshProvider>
  );
}

export default MyApp;