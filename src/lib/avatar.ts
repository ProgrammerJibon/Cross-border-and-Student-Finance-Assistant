import { z } from "zod";
export const avatarSchema = z
  .string()
  .max(420000)
  .refine((value) => {
    const match = value.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) return false;
    const b = Buffer.from(match[2], "base64");
    if (b.length > 300000 || b.length < 12) return false;
    return match[1] === "png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === "jpeg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : b.toString("ascii", 0, 4) === "RIFF" &&
          b.toString("ascii", 8, 12) === "WEBP";
  }, "Choose a PNG, JPEG or WebP profile picture under 300 KB.");
