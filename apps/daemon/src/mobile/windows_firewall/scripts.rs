use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

const FIREWALL_RULE_DISPLAY_NAME: &str = "Yiru Mobile Pairing";
const FIREWALL_RULE_NAME: &str = "Yiru.MobilePairing";

pub(super) fn inspection(port: u16, executable_path: &str, address: Option<&str>) -> String {
    let address_lookup = address.map_or_else(String::new, |address| {
        format!(
            "\ntry {{\n  $ip = Get-NetIPAddress -IPAddress {} -ErrorAction Stop | Select-Object -First 1\n  $localAddress = [string]$ip.IPAddress\n  $localPrefixLength = [int]$ip.PrefixLength\n  $profile = Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex -ErrorAction Stop | Select-Object -First 1\n  if ($profile) {{ $networkCategory = [string]$profile.NetworkCategory }}\n}} catch {{}}",
            quote(address)
        )
    });
    format!(
        "$ErrorActionPreference = 'Stop'\n$matchingRuleScopes = @()\n$blockingRuleDetected = $false\n$rules = @(Get-NetFirewallApplicationFilter -PolicyStore ActiveStore -Program {} -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object {{ $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' }})\nforeach ($rule in $rules) {{\n  $portFilter = $rule | Get-NetFirewallPortFilter\n  $protocol = [string]$portFilter.Protocol\n  $profile = [string]$rule.Profile\n  $portMatches = @($portFilter.LocalPort | Where-Object {{ [string]$_ -eq 'Any' -or [string]$_ -eq '{port}' }}).Count -gt 0\n  if (($protocol -eq 'Any' -or $protocol -eq 'TCP' -or $protocol -eq '6') -and ($profile -eq 'Any' -or $profile -match 'Private') -and $portMatches) {{\n    if ([string]$rule.Action -eq 'Block') {{\n      $blockingRuleDetected = $true\n    }} elseif ([string]$rule.Action -eq 'Allow') {{\n      $addressFilter = $rule | Get-NetFirewallAddressFilter\n      $matchingRuleScopes += [pscustomobject]@{{ remoteAddresses = @($addressFilter.RemoteAddress | ForEach-Object {{ [string]$_ }}) }}\n    }}\n  }}\n}}\n$privateFirewallEnabled = [bool](Get-NetFirewallProfile -PolicyStore ActiveStore -Name Private).Enabled\n$networkCategory = 'Unknown'{address_lookup}\n[pscustomobject]@{{\n  matchingRuleScopes = @($matchingRuleScopes)\n  blockingRuleDetected = $blockingRuleDetected\n  localAddress = $localAddress\n  localPrefixLength = $localPrefixLength\n  privateFirewallEnabled = $privateFirewallEnabled\n  networkCategory = $networkCategory\n}} | ConvertTo-Json -Depth 4 -Compress",
        quote(executable_path)
    )
}

pub(super) fn repair(port: u16, executable_path: &str) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'\n$blockingRules = @(Get-NetFirewallApplicationFilter -Program {} -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object {{ $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' }})\nforeach ($rule in $blockingRules) {{\n  $portFilter = $rule | Get-NetFirewallPortFilter\n  $protocol = [string]$portFilter.Protocol\n  $profile = [string]$rule.Profile\n  $portMatches = @($portFilter.LocalPort | Where-Object {{ [string]$_ -eq 'Any' -or [string]$_ -eq '{port}' }}).Count -gt 0\n  if (($protocol -eq 'Any' -or $protocol -eq 'TCP' -or $protocol -eq '6') -and ($profile -eq 'Any' -or $profile -match 'Private') -and $portMatches) {{\n    $rule | Remove-NetFirewallRule\n  }}\n}}\nGet-NetFirewallRule -Name {} -ErrorAction SilentlyContinue | Remove-NetFirewallRule\nNew-NetFirewallRule -Name {} -DisplayName {} -Description 'Allows Yiru Mobile to connect to this Yiru daemon on private networks.' -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort {port} -Program {} -EdgeTraversalPolicy Block | Out-Null",
        quote(executable_path),
        quote(FIREWALL_RULE_NAME),
        quote(FIREWALL_RULE_NAME),
        quote(FIREWALL_RULE_DISPLAY_NAME),
        quote(executable_path)
    )
}

pub(super) fn elevation(powershell_path: &str, encoded_repair_script: &str) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'\ntry {{\n  $process = Start-Process -FilePath {} -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', '{encoded_repair_script}') -Verb RunAs -Wait -PassThru\n  [pscustomobject]@{{ launched = $true; exitCode = $process.ExitCode }} | ConvertTo-Json -Compress\n}} catch {{\n  [pscustomobject]@{{ launched = $false; nativeErrorCode = $_.Exception.NativeErrorCode }} | ConvertTo-Json -Compress\n}}",
        quote(powershell_path)
    )
}

pub(super) fn encode(script: &str) -> String {
    let bytes = script
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    BASE64.encode(bytes)
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
