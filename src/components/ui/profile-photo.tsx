"use client";
import Image from "next/image";
import { useApp } from "./providers";
export function ProfilePhoto({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const { t, toast } = useApp();
  return (
    <label className="photo-picker">
      <span>{t("profilePhoto")}</span>
      {value && (
        <Image
          unoptimized
          src={value}
          alt={t("profilePhoto")}
          width={76}
          height={76}
        />
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        required={required && !value}
        aria-label={t("profilePhoto")}
        title={t("photoHelp")}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (
            file.size > 300000 ||
            !["image/png", "image/jpeg", "image/webp"].includes(file.type)
          ) {
            toast(t("photoHelp"), true);
            e.target.value = "";
            return;
          }
          const reader = new FileReader();
          reader.onload = () => onChange(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
    </label>
  );
}
