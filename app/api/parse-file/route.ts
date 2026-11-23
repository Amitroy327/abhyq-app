import { NextResponse } from "next/server";
import mammoth from "mammoth";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Koi valid file nahi mili." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. PDF PARSING
    if (fileName.endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      const extractedText = (data.text || "").trim();

      if (!extractedText) {
        return NextResponse.json(
          {
            error:
              "Is PDF mein readable text nahi mila (shayed yeh scanned image PDF hai).",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        name: file.name,
        content: extractedText,
      });
    }

    // 2. WORD (.DOCX) PARSING
    if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = (result.value || "").trim();

      if (!extractedText) {
        return NextResponse.json(
          { error: "Is Word document mein koi text nahi mila." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        name: file.name,
        content: extractedText,
      });
    }

    return NextResponse.json(
      { error: "Sirf .pdf ya .docx files supported hain." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Document Parse Error:", error);
    return NextResponse.json(
      { error: "Document padhne mein technical error aa gaya." },
      { status: 500 }
    );
  }
}