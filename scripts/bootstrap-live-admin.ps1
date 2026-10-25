$ErrorActionPreference = 'Stop'
$bootstrapSecret = Read-Host 'Initial administrator password' -AsSecureString
$bootstrapPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapSecret)
try {
  $env:FINBRIDGE_BOOTSTRAP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bootstrapPointer)
  node scripts/bootstrap-live-admin.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Administrator bootstrap failed.' }
} finally {
  Remove-Item Env:FINBRIDGE_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bootstrapPointer)
  $bootstrapSecret.Dispose()
}
