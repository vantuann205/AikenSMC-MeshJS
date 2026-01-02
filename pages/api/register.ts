import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method không được hỗ trợ." });
  }

  let pool = null;

  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng điền đầy đủ thông tin." });
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    await pool.query(
      "INSERT INTO Users (name, email, password) VALUES ($1, $2, $3)",
      [name, email, password]
    );

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
    });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(400).json({ success: false, error: "Email đã tồn tại." });
    } else {
      console.error("Lỗi đăng ký:", error);
      return res.status(500).json({ success: false, error: "Lỗi server." });
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
