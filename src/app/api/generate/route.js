import { NextResponse, after } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findModel, resolveApiKey, estimateCredits } from "@/lib/providers";
import { muapiWebhookUrl } from "@/lib/urls";

// Free-provider jobs run in the background of this request (after()) and can
// take several minutes on a shared GPU queue.
export const maxDuration = 300;

const ACTIVE = ["processing", "pending", "starting", "queued"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const { modelId, settings = {}, actorId = null } = body;
    const prompt = String(body.prompt || "").trim();
    let images = Array.isArray(body.images) ? body.images.filter((u) => typeof u === "string" && u.startsWith("http")) : [];

    if (!prompt) return NextResponse.json({ error: "Add a script or prompt first." }, { status: 400 });

    const found = findModel(modelId);
    if (!found) return NextResponse.json({ error: "Invalid model selected" }, { status: 400 });
    const { model, provider } = found;

    // Resolve actor -> its image goes first (the image-to-video conditioning frame).
    let actor = null;
    if (actorId) {
      actor = await prisma.actor.findFirst({ where: { id: actorId, userId: session.user.id } });
      if (!actor) return NextResponse.json({ error: "Actor not found" }, { status: 404 });
      images = [actor.imageUrl, ...images.filter((u) => u !== actor.imageUrl)];
    }
    if ((model.kind === "i2v" || model.kind === "lipsync") && images.length === 0) {
      return NextResponse.json({ error: "Pick an actor or upload a reference image for this model." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true, apiKeys: true },
    });
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { apiKey, keySource } = resolveApiKey(provider, user.apiKeys);
    if (!keySource) {
      return NextResponse.json(
        { error: `${provider.label} is not configured. Add your own ${provider.label} key from the menu, or pick another model.` },
        { status: 400 }
      );
    }

    const requiredCredits = keySource === "user" ? 0 : estimateCredits(model, settings, prompt);

    // Reserve credits atomically before we spend money at the provider.
    if (requiredCredits > 0) {
      const reserved = await prisma.user.updateMany({
        where: { id: session.user.id, credits: { gte: requiredCredits } },
        data: { credits: { decrement: requiredCredits } },
      });
      if (reserved.count === 0) {
        return NextResponse.json(
          { error: `Insufficient credits. This needs ${requiredCredits} credits but you have ${user.credits}.` },
          { status: 403 }
        );
      }
    }

    let submitted;
    try {
      submitted = await provider.submit({
        model,
        prompt,
        images,
        settings,
        apiKey,
        webhookUrl: muapiWebhookUrl(),
      });
    } catch (err) {
      if (requiredCredits > 0) {
        await prisma.user.update({ where: { id: session.user.id }, data: { credits: { increment: requiredCredits } } });
      }
      throw err;
    }

    const creation = await prisma.creation.create({
      data: {
        userId: session.user.id,
        actorId: actor?.id ?? null,
        type: "video",
        title: prompt.length > 50 ? `${prompt.substring(0, 50)}…` : prompt,
        prompt,
        provider: provider.id,
        requestId: submitted.requestId,
        keySource,
        status: "processing",
        modelId: model.id,
        aspectRatio: settings.aspect_ratio ?? null,
        resolution: settings.resolution ?? null,
        duration: typeof settings.duration === "number" ? settings.duration : null,
        mode: settings.mode ?? null,
        inputImages: images,
        meta: { ...(submitted.meta || {}), credits: requiredCredits },
      },
    });

    if (typeof submitted.run === "function") {
      const creationId = creation.id;
      after(async () => {
        try {
          const result = await submitted.run();
          await prisma.creation.updateMany({
            where: { id: creationId, status: { in: ACTIVE } },
            data: { status: "completed", url: result.url },
          });
        } catch (err) {
          console.error("[GENERATE_BACKGROUND_ERROR]", creationId, err);
          await prisma.creation.updateMany({
            where: { id: creationId, status: { in: ACTIVE } },
            data: { status: "failed", error: String(err?.message || err).slice(0, 1000) },
          });
          if (requiredCredits > 0) {
            await prisma.user.update({ where: { id: session.user.id }, data: { credits: { increment: requiredCredits } } });
          }
        }
      });
    }

    return NextResponse.json({ success: true, creationId: creation.id, requestId: creation.requestId });
  } catch (error) {
    console.error("[GENERATE_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
