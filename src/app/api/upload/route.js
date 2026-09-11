import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth";

/**
 * Token exchange for direct browser -> Vercel Blob uploads. The file never
 * passes through this function, so the 4.5 MB request cap does not apply.
 */
export async function POST(request) {
  const body = await request.json();
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await requireUser();
        if (!user) throw new Error("Not authenticated");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Nothing to persist here: the browser hands the blob URL to the
        // actor or generation request that needs it.
        console.log("[BLOB_UPLOADED]", blob.pathname, tokenPayload);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
