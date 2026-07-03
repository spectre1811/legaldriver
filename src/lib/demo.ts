// Demo/showcase mode (WO-08). When DEMO_MODE is on, outbound channels are
// sandboxed so a demo/investor session can NEVER email or WhatsApp a real person:
// getMailer() / getMessagingClient() return their console/mock impls regardless of
// configured provider keys. This is the ONLY special code path for the demo tenant
// (guardrail: the demo tenant is otherwise a normal RLS tenant).
export function isDemoMode(): boolean {
  const v = (process.env.DEMO_MODE ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}
