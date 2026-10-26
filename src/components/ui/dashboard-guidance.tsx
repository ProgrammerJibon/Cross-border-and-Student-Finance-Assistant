"use client";
import { createContext, useContext, type ReactNode, type ComponentPropsWithRef } from "react";
import { IconButton, Tooltip, TextField, type TextFieldProps } from "@mui/material";
import { FiHelpCircle } from "react-icons/fi";
import { useApp } from "./providers";
import { pageHelp, fieldHelp, dialogHelp } from "@/lib/dashboard-help";

const Guidance = createContext(false);
export function DashboardGuidance({path, children}: {path: string; children: ReactNode}) {
  return <Guidance.Provider value={path !== "agent"}>{children}</Guidance.Provider>;
}
export function HelpTooltip({text}: {text: string}) {
  const {t} = useApp();
  return <Tooltip title={text} arrow describeChild enterTouchDelay={0} leaveTouchDelay={5000}>
    <IconButton size="small" aria-label={t("help.instructions")} className="help-trigger"><FiHelpCircle /></IconButton>
  </Tooltip>;
}
export function PageGuidance({path}: {path: string}) {
  const {t} = useApp();
  if (!pageHelp[path]) return null;
  const text = t(`help.page.${pageHelp[path]}`);
  return <aside className="dashboard-guidance" aria-label={t("help.aboutPage")}>
    <div><strong>{t("help.aboutPage")}</strong><HelpTooltip text={text}/></div><p>{text}</p>
  </aside>;
}
export function useFieldHelp({name, label, type, select, help}: {name?: string; label?: string; type?: string; select?: boolean; help?: string}) {
  const enabled = useContext(Guidance);
  const {t} = useApp();
  if (!enabled) return undefined;
  const translatedLabel = Object.keys(fieldHelp).find(key => t(key) === label);
  const key = fieldHelp[label || ""] || fieldHelp[translatedLabel || ""] || fieldHelp[name || ""];
  return t(help || `help.field.${key || (select ? "select" : type === "checkbox" ? "checkbox" : type === "file" ? "file" : type === "number" ? "number" : type === "password" ? "password" : type === "email" ? "email" : type === "date" ? "date" : "text")}`);
}
export function DialogGuidance({title, help}: {title: string; help?: string}) {
  const enabled = useContext(Guidance);
  const {t} = useApp();
  if (!enabled) return null;
  const key = dialogHelp[title] || dialogHelp[Object.keys(dialogHelp).find(key => t(key) === title) || ""] || "form";
  const text = t(help || `help.dialog.${key}`);
  return <div className="dialog-guidance"><p>{text}</p><HelpTooltip text={text}/></div>;
}
export function GuidedTextField(props: TextFieldProps) {
  const help = useFieldHelp({name: props.name, label: typeof props.label === "string" ? props.label : undefined, type: props.type, select: props.select});
  const title = [props.title, help, !props.error && typeof props.helperText === "string" ? props.helperText : undefined].filter(Boolean).join(" ") || undefined;
  return <TextField {...props} title={title} helperText={props.error ? props.helperText : undefined} slotProps={{
    ...props.slotProps,
    htmlInput: owner => ({...(typeof props.slotProps?.htmlInput === "function" ? props.slotProps.htmlInput(owner) : props.slotProps?.htmlInput), title}),
    select: owner => {
      const original = typeof props.slotProps?.select === "function" ? props.slotProps.select(owner) : props.slotProps?.select;
      return {...original, title, SelectDisplayProps: {...original?.SelectDisplayProps, title}};
    },
  }}/>;
}
export function GuidedInput({help, ...props}: ComponentPropsWithRef<"input"> & {help?: string}) {
  const note = useFieldHelp({name: props.name, label: props["aria-label"], type: props.type, help});
  return <input {...props} title={props.title || (props.type !== "hidden" ? note : undefined)}/>;
}
export function GuidedSelect({help, ...props}: ComponentPropsWithRef<"select"> & {help?: string}) {
  const note = useFieldHelp({name: props.name, label: props["aria-label"], select: true, help});
  return <select {...props} title={props.title || note}/>;
}
