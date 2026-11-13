import { supabaseClient } from "@/shared/lib/supabaseClient";

const PROFILE_AVATAR_BUCKET = "profile-avatars";
const MAX_PROFILE_AVATAR_SIZE = 2 * 1024 * 1024;
const PROFILE_AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadProfileAvatar(userId: string, file: File) {
  const extension = PROFILE_AVATAR_EXTENSIONS[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WebP profile photo.");
  if (file.size > MAX_PROFILE_AVATAR_SIZE) throw new Error("Profile photos must be 2 MB or smaller.");

  const path = `${userId}/avatar.${extension}`;
  const { error } = await supabaseClient.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: "0",
      contentType: file.type,
      upsert: true,
    });
  if (error) throw new Error(`Unable to upload profile photo: ${error.message}`);

  const { data } = supabaseClient.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?updated=${Date.now()}`;
}

export async function removeObsoleteProfileAvatars(userId: string, keepAvatarUrl: string | null) {
  const { data: files, error: listError } = await supabaseClient.storage
    .from(PROFILE_AVATAR_BUCKET)
    .list(userId);
  if (listError) throw new Error(`Unable to update profile photo: ${listError.message}`);

  const keepName = keepAvatarUrl
    ? decodeURIComponent(new URL(keepAvatarUrl).pathname.split("/").pop() ?? "")
    : "";
  const obsoletePaths = (files ?? [])
    .filter((file) => file.name.startsWith("avatar.") && file.name !== keepName)
    .map((file) => `${userId}/${file.name}`);
  if (obsoletePaths.length === 0) return;

  const { error } = await supabaseClient.storage.from(PROFILE_AVATAR_BUCKET).remove(obsoletePaths);
  if (error) throw new Error(`Unable to remove the previous profile photo: ${error.message}`);
}
