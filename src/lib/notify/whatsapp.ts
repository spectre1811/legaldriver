// WhatsApp delivery seam (WO-35 #3) — behind an interface like the Mailer, so the notify cron
// has a real channel==='whatsapp' branch that lights up the moment a BSP (WO-04) is wired, with
// zero changes to the cron. Until then getWhatsAppSender() returns the Unconfigured sender, which
// reports configured:false so the cron SKIPS (leaves the row pending) rather than burning it to
// 'failed'. A future BSP impl (Gupshup/AiSensy/Interakt) plugs in here keyed off env.

export type WaResult = { ok: boolean; id?: string; error?: string; configured: boolean };

export interface WhatsAppSender {
  readonly channel: "whatsapp";
  send(toPhone: string, body: string): Promise<WaResult>;
}

class UnconfiguredWhatsApp implements WhatsAppSender {
  readonly channel = "whatsapp" as const;
  async send(): Promise<WaResult> {
    return { ok: false, configured: false, error: "whatsapp BSP not configured (WO-04)" };
  }
}

// True once a BSP is provisioned. The concrete BSP sender is added in WO-04; this only decides
// whether the channel is live so nothing else has to know the wiring detail.
export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_BSP_TOKEN);
}

let cached: WhatsAppSender | null = null;
export function getWhatsAppSender(): WhatsAppSender {
  if (cached) return cached;
  // When WO-04 lands: `cached = whatsappConfigured() ? new BspWhatsApp(...) : new UnconfiguredWhatsApp();`
  cached = new UnconfiguredWhatsApp();
  return cached;
}
