"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, MenuItem } from "@mui/material";
import { FiChevronDown, FiGrid, FiSettings, FiLogOut } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import { logout } from "@/actions/auth.actions";
import { accountHome } from "@/lib/account-home";

export type PublicAccount = { name: string; email: string; role: string; onboarded: number };
const subscribeHydration = () => () => {};
export function PublicAccountMenu({user}: {user: PublicAccount}) {
  const {t, locale, run} = useApp();
  const router = useRouter();
  const [anchor,setAnchor] = useState<HTMLElement|null>(null);
  const [busy,setBusy] = useState(false);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const close = () => setAnchor(null);
  return <>
    <button type="button" className="button secondary public-account-button" disabled={!hydrated} aria-haspopup="menu" aria-controls={anchor?"public-account-menu":undefined} aria-expanded={!!anchor} onClick={e=>setAnchor(e.currentTarget)}>
      <span>{user.name}</span><FiChevronDown/>
    </button>
    <Menu id="public-account-menu" anchorEl={anchor} open={!!anchor} onClose={close}>
      <div className="profile-dropdown-header"><strong>{user.name}</strong><small>{user.email}</small></div>
      <MenuItem component={Link} href={`/${locale}/${accountHome(user)}`} onClick={close} className="profile-dropdown-item"><FiGrid/>{t("dashboard")}</MenuItem>
      <MenuItem component={Link} href={`/${locale}/settings`} onClick={close} className="profile-dropdown-item"><FiSettings/>{t("settings")}</MenuItem>
      <MenuItem disabled={busy} className="profile-dropdown-item danger" onClick={async()=>{
        setBusy(true);
        try {const result=await run(logout,{quiet:true,refresh:false});if(result!==undefined){close();router.push(`/${locale}/login`);router.refresh();}}
        finally {setBusy(false);}
      }}><FiLogOut/>{t("logout")}</MenuItem>
    </Menu>
  </>;
}
