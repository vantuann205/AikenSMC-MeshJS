import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method không được hỗ trợ." });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Token không hợp lệ." });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET không được định nghĩa trong biến môi trường.");
    }

    jwt.verify(token, jwtSecret, (err, decoded) => {
      if (err) {
        return res.status(401).json({ success: false, error: "Token không hợp lệ hoặc đã hết hạn." });
      }
      return res.status(200).json({ success: true, message: "Token hợp lệ." });
    });
  } catch (error: any) {
    console.error("Lỗi verify:", error);
    return res.status(500).json({ success: false, error: error.message || "Lỗi server." });
  }
}