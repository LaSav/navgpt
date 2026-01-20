import { LICENSE_API_BASE } from './config'

type ActivateResponse = {
  activated: boolean
  error: string | null
  license_key?: {
    status: 'inactive' | 'active' | 'expired' | 'disabled'
    expires_at: string | null
  }
  instance?: { id: string; name: string }
}

type ValidateResponse = {
  valid: boolean
  error: string | null
  license_key?: {
    status: 'inactive' | 'active' | 'expired' | 'disabled'
    expires_at: string | null
  }
  instance?: { id: string; name: string } | null
}

function formBody(params: Record<string, string>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) usp.set(k, v)
  return usp.toString()
}

export async function lsActivate(
  licenseKey: string,
  instanceName: string,
): Promise<ActivateResponse> {
  const res = await fetch(`${LICENSE_API_BASE}/v1/licenses/activate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody({ license_key: licenseKey, instance_name: instanceName }),
  })

  // Lemon returns JSON with fields even on some errors; but also uses 4XX for errors. :contentReference[oaicite:1]{index=1}
  const json = (await res.json()) as ActivateResponse
  return json
}

export async function lsValidate(
  licenseKey: string,
  instanceId?: string,
): Promise<ValidateResponse> {
  const params: Record<string, string> = { license_key: licenseKey }
  if (instanceId) params.instance_id = instanceId

  const res = await fetch(`${LICENSE_API_BASE}/v1/licenses/validate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody(params),
  })

  const json = (await res.json()) as ValidateResponse
  return json
}
