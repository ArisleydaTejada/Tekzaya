import { uploadAttachment } from "../api/tickets";

export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/**
 * Sube las fotos elegidas como adjuntos sueltos, una tras otra, y devuelve sus
 * ids; el activo las enlaza al guardarse. Si una no es imagen se corta ahí.
 */
export async function uploadAssetPhotos(files: readonly File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const stored = await uploadAttachment(file);
    if (!stored.mimeType.startsWith("image/")) throw new Error(`«${file.name}» no es una imagen`);
    ids.push(stored.id);
  }
  return ids;
}
