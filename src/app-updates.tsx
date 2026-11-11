import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Download, RefreshCw, X } from "lucide-react";
interface UpdateOffer { available: boolean; version?: string; incompatible?: boolean; notConfigured?: boolean }
interface UpdatesPlugin {
  getInfo(): Promise<{version:string;versionCode:number}>;
  check(): Promise<UpdateOffer>;
  install(): Promise<{permissionRequired?:boolean;installerOpened?:boolean}>;
}
const updates = registerPlugin<UpdatesPlugin>("AppUpdates");
let checkPending: Promise<UpdateOffer> | null = null;
export function AppUpdateNotice() {
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const check = useCallback(async (manual = false) => {
    if (!Capacitor.isNativePlatform()) return;
    if (!manual && Date.now() - Number(localStorage.getItem("pontonorte_update_checked") || 0) < 6 * 60 * 60 * 1000) return;
    try {
      checkPending ??= updates.check().finally(() => { checkPending = null; });
      const result = await checkPending;
      localStorage.setItem("pontonorte_update_checked", String(Date.now()));
      if (!active.current) return;
      setOffer(result.available ? result : null);
      if (manual) setMessage(result.available ? "" : result.incompatible ? "Esta versão precisa ser instalada pelo responsável para configurar a assinatura permanente." : result.notConfigured ? "As atualizações de produção ainda precisam ser ativadas pelo responsável." : "Seu aplicativo está atualizado.");
    } catch { if (manual && active.current) setMessage("Não foi possível verificar agora. Tente novamente mais tarde."); }
  }, []);
  useEffect(() => {
    active.current = true; void check();
    const resume = () => { if (!document.hidden) void check(); };
    const manual = () => { void check(true); };
    document.addEventListener("visibilitychange", resume); window.addEventListener("pontonorte-check-updates", manual);
    return () => { active.current = false; document.removeEventListener("visibilitychange", resume); window.removeEventListener("pontonorte-check-updates", manual); };
  }, [check]);
  async function install() {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const result = await updates.install();
      setMessage(result.permissionRequired ? "Autorize as atualizações deste app no Android. Ao voltar, toque em Atualizar." : "Confirme a instalação na tela do Android.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar. Tente novamente."); }
    finally { setBusy(false); }
  }
  if (!offer && !message) return null;
  return <aside className="app-update-notice" aria-label="Atualização do aplicativo"><div role="status"><b>{offer ? `Nova versão ${offer.version}` : "Atualizações"}</b><p>{message || "Seu ponto continua disponível. Atualize quando puder."}</p></div>{offer ? <button className="primary" onClick={install} disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Download />}{busy ? "Baixando…" : "Atualizar"}</button> : null}<button className="update-close" disabled={busy} onClick={() => { setOffer(null); setMessage(""); }} aria-label="Fechar aviso de atualização"><X /></button></aside>;
}
export function checkForAppUpdates() { window.dispatchEvent(new Event("pontonorte-check-updates")); }
