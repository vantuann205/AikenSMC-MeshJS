import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";
import jwt from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method không được hỗ trợ." });
  }

  let pool = null;

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng điền đầy đủ thông tin." });
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    const result = await pool.query("SELECT * FROM Users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ success: false, error: "Email không tồn tại." });
    }

    if (user.password !== password) {
      return res.status(400).json({ success: false, error: "Mật khẩu không đúng." });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET không được định nghĩa trong biến môi trường.");
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      jwtSecret,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công!",
      token,
    });
  } catch (error: any) {
    console.error("Lỗi đăng nhập:", error);
    return res.status(500).json({ success: false, error: error.message || "Lỗi server." });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
