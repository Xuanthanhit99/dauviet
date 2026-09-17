param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'

# XML-only inspection of the supplied static SVG subset. No renderer, network or writes.
function Assert-BrandSvg([string]$Content, [bool]$Sprite) {
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($Content), $settings)
    $document = [System.Xml.XmlDocument]::new()
    $document.XmlResolver = $null
    try { $document.Load($reader) } finally { $reader.Dispose() }
    $root = $document.DocumentElement
    if ($root.LocalName -cne 'svg' -or $root.NamespaceURI -cne 'http://www.w3.org/2000/svg') { throw 'INVALID_SVG_ROOT' }
    $ids = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $references = [System.Collections.Generic.List[string]]::new()
    $allowed = @('svg', 'title', 'desc', 'defs', 'mask', 'rect', 'path', 'g', 'symbol', 'circle', 'use')
    foreach ($node in $document.SelectNodes('//*')) {
        if ($node.NamespaceURI -cne $root.NamespaceURI -or $node.LocalName -cnotin $allowed) { throw "UNSUPPORTED_ELEMENT $($node.Name)" }
        if ($node.HasAttribute('id') -and !$ids.Add($node.GetAttribute('id'))) { throw 'DUPLICATE_ID' }
        if (($node -eq $root -and !$Sprite) -or $node.LocalName -ceq 'symbol' -or $node.HasAttribute('viewBox')) {
            $parts = $node.GetAttribute('viewBox').Trim() -split '[\s,]+'
            if ($parts.Count -ne 4) { throw 'INVALID_VIEWBOX' }
            $values = @($parts | ForEach-Object { [double]::Parse($_, [System.Globalization.CultureInfo]::InvariantCulture) })
            if (@($values | Where-Object { [double]::IsNaN($_) -or [double]::IsInfinity($_) }).Count -gt 0 -or $values[2] -le 0 -or $values[3] -le 0) { throw 'INVALID_VIEWBOX' }
        }
        foreach ($attribute in $node.Attributes) {
            if ($attribute.Prefix -eq 'xmlns' -or $attribute.Name -eq 'xmlns') { continue }
            if ($attribute.LocalName -match '^on' -or $attribute.Value -match '(?i)javascript:|data:|https?:|file:|@import|expression\(') { throw 'UNSAFE_ATTRIBUTE' }
            if ($attribute.LocalName -ceq 'href') {
                if ($attribute.Value -notmatch '^#[A-Za-z_][\w.-]*$') { throw 'EXTERNAL_REFERENCE' }
                $references.Add($attribute.Value.Substring(1))
            }
            foreach ($match in [regex]::Matches($attribute.Value, 'url\(([^)]+)\)')) {
                $target = $match.Groups[1].Value.Trim().Trim('"', "'")
                if ($target -notmatch '^#[A-Za-z_][\w.-]*$') { throw 'EXTERNAL_REFERENCE' }
                $references.Add($target.Substring(1))
            }
            if ($attribute.LocalName -cin @('aria-labelledby', 'aria-describedby')) {
                foreach ($target in ($attribute.Value -split '\s+')) { $references.Add($target) }
            }
        }
        if ($Sprite -and $node.LocalName -ceq 'symbol' -and ($node.GetAttribute('fill') -cne 'none' -or $node.GetAttribute('stroke') -cne 'currentColor')) { throw 'INVALID_ICON_PAINT' }
    }
    foreach ($reference in $references) { if (!$ids.Contains($reference)) { throw "BROKEN_REFERENCE $reference" } }
    if ($Sprite) {
        if ($document.SelectNodes('//*[local-name()="symbol"]').Count -eq 0 -or $root.GetAttribute('style') -cne 'display:none') { throw 'INVALID_SPRITE_CONTAINER' }
    } else {
        if ($root.GetAttribute('role') -cne 'img' -or !$root.GetAttribute('aria-labelledby')) { throw 'MISSING_MEANINGFUL_LABEL' }
        foreach ($id in ($root.GetAttribute('aria-labelledby') -split '\s+')) {
            $label = @($document.SelectNodes('//*') | Where-Object { $_.GetAttribute('id') -ceq $id })
            if ($label.Count -ne 1 -or [string]::IsNullOrWhiteSpace($label[0].InnerText)) { throw 'EMPTY_MEANINGFUL_LABEL' }
        }
    }
}

if ($SelfTest) {
    $valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-labelledby="t"><title id="t">Test</title><path id="p" d="M1 1L2 2"/></svg>'
    Assert-BrandSvg $valid $false
    $invalid = @(
        $valid.Replace('</svg>', ''),
        $valid.Replace('0 0 32 32', '0 0 0 32'),
        $valid.Replace('aria-labelledby="t"', 'aria-labelledby="missing"'),
        $valid.Replace('<path ', '<path onclick="alert(1)" '),
        $valid.Replace('<path ', '<path fill="url(#missing)" '),
        $valid.Replace('</svg>', '<use href="https://example.invalid/x.svg"/></svg>'),
        $valid.Replace('</svg>', '<image href="data:image/png;base64,AA=="/></svg>'),
        $valid.Replace('</svg>', '<script>bad()</script></svg>'),
        $valid.Replace('id="p"', 'id="t"'),
        ('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///no-read">]>' + $valid)
    )
    $caseIndex = 0
    foreach ($case in $invalid) {
        $caseIndex++
        $rejected = $false
        try { Assert-BrandSvg $case $false } catch { $rejected = $true }
        if (!$rejected) { throw "SELF_TEST_EXPECTED_REJECTION case=$caseIndex" }
    }
    Write-Output "SVG_SELF_TEST: 1 valid / $($invalid.Count) invalid cases PASS"
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$registry = Get-Content -LiteralPath (Join-Path $repoRoot 'packages/brand-contracts/brand-registry.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$checked = 0
foreach ($asset in $registry.assets) {
    if (!$asset.productionPath.EndsWith('.svg')) { continue }
    $resolved = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $asset.productionPath))
    $allowedRoot = Join-Path $repoRoot 'packages'
    if (!$resolved.StartsWith($allowedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'OUT_OF_SCOPE_SVG_PATH' }
    $actual = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -cne $asset.checksum.value) { throw "SVG_CHECKSUM_MISMATCH $($asset.productionPath)" }
    Assert-BrandSvg (Get-Content -LiteralPath $resolved -Raw -Encoding UTF8) ($asset.assetClass -eq 'icon-sprite')
    $checked++
}
Write-Output "SVG_XML_REFERENCES: $checked / $checked PASS"
