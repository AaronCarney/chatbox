import { getDefaultStore } from 'jotai'
import * as atoms from './atoms'
import { settingsStore } from './settingsStore'

/**
 * ChatBridge: provider setup check removed — backend handles AI providers.
 * Returns false (no setup needed) since ChatBridge manages config server-side.
 */
export function needEditSetting() {
  return false
}

export function getLanguage() {
  return settingsStore.getState().language
}

export function getProxy() {
  return settingsStore.getState().proxy
}

export function getLicenseKey() {
  return settingsStore.getState().licenseKey
}

export function getLicenseDetail() {
  return settingsStore.getState().licenseDetail
}

export function isPaid() {
  return !!getLicenseKey()
}

export function isPro() {
  return !!getLicenseKey() && !getLicenseDetail()?.name.toLowerCase().includes('lite')
}

export function getRemoteConfig() {
  const store = getDefaultStore()
  return store.get(atoms.remoteConfigAtom)
}

export function getAutoGenerateTitle() {
  return settingsStore.getState().autoGenerateTitle
}

export function getExtensionSettings() {
  return settingsStore.getState().extension
}
