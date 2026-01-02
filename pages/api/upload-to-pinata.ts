import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { File } from "formidable";
import fs from "fs";
import pinataSDK from "@pinata/sdk";

const JWT = process.env.PINATA_JWT || "";
const pinata = new pinataSDK({ pinataJWTKey: JWT });

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: "Form parse error" });
      return;
    }

    const uploaded = files.file;
    if (!uploaded) {
      res.status(400).json({ error: "File not found" });
      return;
    }

    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

    try {
      const readable = fs.createReadStream(file.filepath);
      const result = await pinata.pinFileToIPFS(readable);
      res.status(200).json({ cid: result.IpfsHash });
    } catch (uploadError) {
      res.status(500).json({ error: "Upload to Pinata failed" });
      return;
    }
  });
}