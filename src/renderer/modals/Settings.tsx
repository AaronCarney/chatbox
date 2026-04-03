// Settings modal removed during security hardening — all settings routes deleted.
// navigateToSettings is a no-op stub for files that still import it (cleaned in Wave 3).

export type SettingsModalProps = {}
export const SettingsModal = () => null
export default SettingsModal
export function navigateToSettings(_path?: string) {}
