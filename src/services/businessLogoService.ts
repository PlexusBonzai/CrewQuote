import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getSupabaseBrowserClient } from "../lib/supabase";

const BUSINESS_LOGO_BUCKET = "business-logos";
const MAX_BUSINESS_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_MIME_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

type BusinessLogoMimeType = keyof typeof LOGO_MIME_EXTENSIONS;

export interface BusinessLogoAsset {
  dataUrl: string;
  mimeType: BusinessLogoMimeType;
  sizeBytes: number;
  storagePath: string;
  contentSha256: string;
  cleanupWarning?: string;
}

function logoError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function validateLogoBlob(blob: Blob): asserts blob is Blob & { type: BusinessLogoMimeType } {
  if (!(blob.type in LOGO_MIME_EXTENSIONS)) throw new Error("Unsupported logo type. Upload a PNG, JPG, or WebP image.");
  if (blob.size <= 0) throw new Error("The selected logo is empty.");
  if (blob.size > MAX_BUSINESS_LOGO_BYTES) throw new Error("The logo is larger than the 5 MB upload limit.");
}

function ownerPath(userId: string, path: string) {
  const name = path.slice(userId.length + 1);
  return path.startsWith(`${userId}/`)
    && !name.includes("/")
    && /^business-logo(?:-|\.)[A-Za-z0-9._-]+$/.test(name);
}

function decodeLogoImage(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
      else reject(new Error("The logo image has no readable dimensions."));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The logo file could not be decoded as an image."));
    };
    image.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("CrewQuote could not read the downloaded logo."));
    reader.onerror = () => reject(new Error("CrewQuote could not read the downloaded logo."));
    reader.readAsDataURL(blob);
  });
}

async function sha256(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser cannot securely prepare a cloud logo. Use CrewQuote over HTTPS or localhost.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

async function currentLogoPath(userId: string): Promise<CloudResult<string>> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from("business_settings")
    .select("business_logo_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return cloudFail(error);
  const path = data?.business_logo_path || "";
  if (path && !ownerPath(userId, path)) return cloudFail("CrewQuote stopped because the saved logo path does not belong to the signed-in account.");
  return cloudOk(path);
}

async function downloadVerifiedLogo(userId: string, path: string): Promise<BusinessLogoAsset> {
  if (!ownerPath(userId, path)) throw new Error("CrewQuote cannot read a logo outside the signed-in account folder.");
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.storage.from(BUSINESS_LOGO_BUCKET).download(path);
  if (error || !data) throw new Error(logoError(error, "CrewQuote could not download the private business logo."));
  validateLogoBlob(data);
  await decodeLogoImage(data);
  return {
    dataUrl: await blobToDataUrl(data),
    mimeType: data.type,
    sizeBytes: data.size,
    storagePath: path,
    contentSha256: await sha256(data),
  };
}

export async function loadBusinessLogo(): Promise<CloudResult<BusinessLogoAsset | null>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const pathResult = await currentLogoPath(userIdResult.data);
    if (pathResult.error) return cloudFail(pathResult.error);
    if (!pathResult.data) return cloudOk(null);
    return cloudOk(await downloadVerifiedLogo(userIdResult.data, pathResult.data));
  } catch (error) {
    return cloudFail(logoError(error, "CrewQuote could not load the private business logo."));
  }
}

export async function uploadBusinessLogo(file: File): Promise<CloudResult<BusinessLogoAsset>> {
  try {
    validateLogoBlob(file);
    await decodeLogoImage(file);
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const userId = userIdResult.data;
    const previousPathResult = await currentLogoPath(userId);
    if (previousPathResult.error) return cloudFail(previousPathResult.error);
    const previousPath = previousPathResult.data || "";
    const sourceDigest = await sha256(file);
    const extension = LOGO_MIME_EXTENSIONS[file.type];
    const storagePath = `${userId}/business-logo-${sourceDigest.slice(0, 24)}.${extension}`;
    const client = getSupabaseBrowserClient();

    const { error: uploadError } = await client.storage
      .from(BUSINESS_LOGO_BUCKET)
      .upload(storagePath, file, { cacheControl: "31536000", contentType: file.type, upsert: true });
    if (uploadError) return cloudFail(uploadError);

    let verified: BusinessLogoAsset;
    try {
      verified = await downloadVerifiedLogo(userId, storagePath);
      if (verified.contentSha256 !== sourceDigest) {
        throw new Error("The uploaded logo did not match the selected image.");
      }
    } catch (error) {
      if (storagePath !== previousPath) await client.storage.from(BUSINESS_LOGO_BUCKET).remove([storagePath]);
      return cloudFail(logoError(error, "CrewQuote could not verify the uploaded logo."));
    }

    const { error: settingsError } = await client
      .from("business_settings")
      .upsert({ user_id: userId, business_logo_path: storagePath }, { onConflict: "user_id" });
    if (settingsError) {
      if (storagePath !== previousPath) await client.storage.from(BUSINESS_LOGO_BUCKET).remove([storagePath]);
      return cloudFail(settingsError);
    }

    if (previousPath && previousPath !== storagePath) {
      const { error: cleanupError } = await client.storage.from(BUSINESS_LOGO_BUCKET).remove([previousPath]);
      if (cleanupError) verified.cleanupWarning = "The new logo is active, but CrewQuote could not remove the previous private object. You can retry Replace Logo later.";
    }

    return cloudOk(verified);
  } catch (error) {
    return cloudFail(logoError(error, "CrewQuote could not upload the business logo."));
  }
}

export async function removeBusinessLogo(): Promise<CloudResult<null>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const userId = userIdResult.data;
    const pathResult = await currentLogoPath(userId);
    if (pathResult.error) return cloudFail(pathResult.error);
    const previousPath = pathResult.data || "";
    const client = getSupabaseBrowserClient();

    const { error: settingsError } = await client
      .from("business_settings")
      .upsert({ user_id: userId, business_logo_path: null }, { onConflict: "user_id" });
    if (settingsError) return cloudFail(settingsError);

    const { data: objects, error: listError } = await client.storage.from(BUSINESS_LOGO_BUCKET).list(userId, { limit: 100 });
    if (listError) {
      if (previousPath) await client.from("business_settings").upsert({ user_id: userId, business_logo_path: previousPath }, { onConflict: "user_id" });
      return cloudFail(listError);
    }
    const logoPaths = (objects || [])
      .filter(object => /^business-logo(?:-|\.)/.test(object.name))
      .map(object => `${userId}/${object.name}`);
    if (previousPath && !logoPaths.includes(previousPath)) logoPaths.push(previousPath);
    if (logoPaths.length) {
      const { error: removeError } = await client.storage.from(BUSINESS_LOGO_BUCKET).remove(logoPaths);
      if (removeError) {
        if (previousPath) await client.from("business_settings").upsert({ user_id: userId, business_logo_path: previousPath }, { onConflict: "user_id" });
        return cloudFail(removeError);
      }
    }
    return cloudOk(null);
  } catch (error) {
    return cloudFail(logoError(error, "CrewQuote could not remove the business logo."));
  }
}

export async function migrateLocalBusinessLogo(dataUrl: string): Promise<CloudResult<BusinessLogoAsset>> {
  try {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
    if (!match) return cloudFail("The browser logo is not a supported PNG, JPG, or WebP data image.");
    const mimeType = match[1].toLowerCase() as BusinessLogoMimeType;
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const extension = LOGO_MIME_EXTENSIONS[mimeType];
    return uploadBusinessLogo(new File([bytes], `business-logo.${extension}`, { type: mimeType }));
  } catch (error) {
    return cloudFail(logoError(error, "CrewQuote could not prepare the browser logo for upload."));
  }
}
