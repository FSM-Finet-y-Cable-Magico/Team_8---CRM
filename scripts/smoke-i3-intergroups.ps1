[CmdletBinding()]
param(
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'

if (-not $Execute) {
  Write-Host 'DRY_RUN_ONLY: no se ejecutó tráfico. Revise docs/i3-intergroup-predeploy-package.md y use -Execute solo con aprobación coordinada.'
  exit 0
}

if ($env:I3_COORDINATED_SMOKE_APPROVED -ne 'YES' -or $env:I3_QA_RECORDS_VERIFIED -ne 'YES') {
  throw 'SMOKE_NOT_APPROVED: se requieren I3_COORDINATED_SMOKE_APPROVED=YES e I3_QA_RECORDS_VERIFIED=YES'
}

$requiredVariables = @(
  'G8_API_URL',
  'G8_OPERATOR_JWT',
  'G8_G2_API_KEY',
  'G8_G3_API_KEY',
  'G3_API_URL',
  'G3_API_KEY',
  'I3_COMPANY_ID',
  'I3_G2_QA_RUT',
  'I3_G2_QA_INVOICE_ID',
  'I3_G2_QA_PAYMENT_AMOUNT',
  'I3_G2_QA_PAYMENT_DATE',
  'I3_G2_QA_PAYMENT_AUTH_CODE',
  'I3_G2_QA_PAYMENT_TX',
  'I3_G2_QA_TICKET_ID',
  'I3_G2_WIFI_REQUEST_ID',
  'I3_G3_QA_PROSPECT_ID',
  'I3_G3_QA_CONTRACT_ID'
)
foreach ($variableName in $requiredVariables) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($variableName))) {
    throw "MISSING_ENV:$variableName"
  }
}

function Convert-ToPositiveInt([string]$Name) {
  $raw = [Environment]::GetEnvironmentVariable($Name)
  $value = 0
  if (-not [int]::TryParse($raw, [ref]$value) -or $value -lt 1) {
    throw "INVALID_POSITIVE_INT:$Name"
  }
  return $value
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [object]$Body
  )
  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    ContentType = 'application/json'
    TimeoutSec = 30
  }
  if ($null -ne $Body) {
    if ($Body -is [string]) {
      $parameters.Body = $Body
    } else {
      $parameters.Body = $Body | ConvertTo-Json -Depth 10 -Compress
    }
  }
  return Invoke-RestMethod @parameters
}

$g8Base = $env:G8_API_URL.TrimEnd('/')
$g3Base = $env:G3_API_URL.TrimEnd('/')
$companyId = Convert-ToPositiveInt 'I3_COMPANY_ID'
$invoiceId = Convert-ToPositiveInt 'I3_G2_QA_INVOICE_ID'
$ticketId = Convert-ToPositiveInt 'I3_G2_QA_TICKET_ID'
$prospectId = Convert-ToPositiveInt 'I3_G3_QA_PROSPECT_ID'
$contractId = Convert-ToPositiveInt 'I3_G3_QA_CONTRACT_ID'
$paymentAmount = [decimal]::Parse($env:I3_G2_QA_PAYMENT_AMOUNT, [System.Globalization.CultureInfo]::InvariantCulture)
$qaRut = [uri]::EscapeDataString($env:I3_G2_QA_RUT)

$g2Headers = @{ 'X-API-KEY' = $env:G8_G2_API_KEY; Accept = 'application/json' }
$g3InboundHeaders = @{ 'X-API-KEY' = $env:G8_G3_API_KEY; Accept = 'application/json' }
$g3OutboundHeaders = @{ 'X-API-KEY' = $env:G3_API_KEY; Accept = 'application/json' }
$operatorHeaders = @{ Authorization = "Bearer $($env:G8_OPERATOR_JWT)"; Accept = 'application/json' }

# G2: lecturas, pago QA controlado, comprobante y resultado WiFi.
$invoiceList = Invoke-JsonRequest -Method GET -Uri "$g8Base/api/integrations/g2/invoices?id_empresa=$companyId&rut=$qaRut&page=1&page_size=5" -Headers $g2Headers
$invoiceDetail = Invoke-JsonRequest -Method GET -Uri "$g8Base/api/integrations/g2/invoices/$invoiceId?id_empresa=$companyId" -Headers $g2Headers
$paymentPayload = [ordered]@{
  id_empresa = $companyId
  id_factura = $invoiceId
  monto = $paymentAmount
  fecha_pago = $env:I3_G2_QA_PAYMENT_DATE
  codigo_autorizacion = $env:I3_G2_QA_PAYMENT_AUTH_CODE
  codigo_transaccion = $env:I3_G2_QA_PAYMENT_TX
  pasarela = 'QA_COORDINADA_G2'
}
$payment = Invoke-JsonRequest -Method POST -Uri "$g8Base/api/integrations/g2/payments" -Headers $g2Headers -Body $paymentPayload
$paymentId = [int]$payment.payment.idPago
if ($paymentId -lt 1) { throw 'G2_PAYMENT_ID_MISSING' }
$receipt = Invoke-JsonRequest -Method GET -Uri "$g8Base/api/integrations/g2/payments/$paymentId/comprobante?id_empresa=$companyId" -Headers $g2Headers
$wifiTraceId = $null
if ($env:I3_G2_WIFI_TRACE_ID) { $wifiTraceId = $env:I3_G2_WIFI_TRACE_ID }
$wifiPayload = [ordered]@{
  id_ticket = $ticketId
  id_empresa = $companyId
  resultado_tecnico = 'Resultado QA saneado; no contiene credenciales ni secretos.'
  resultado = 'REQUIERE_ATENCION_MANUAL'
  request_id = $env:I3_G2_WIFI_REQUEST_ID
  trace_id = $wifiTraceId
}
$wifi = Invoke-JsonRequest -Method POST -Uri "$g8Base/api/integrations/g2/tickets/$ticketId/wifi-result" -Headers $g2Headers -Body $wifiPayload

# G3: G8 crea el tracking y realiza POST /api/integraciones/instalaciones.
$installation = Invoke-JsonRequest -Method POST -Uri "$g8Base/api/integrations/g3/installations" -Headers $operatorHeaders -Body ([ordered]@{
  idProspecto = $prospectId
  idContrato = $contractId
})
$integrationId = [int]$installation.idIntegracion
if ($integrationId -lt 1 -or [string]::IsNullOrWhiteSpace([string]$installation.requestId)) {
  throw 'G3_TRACKING_RESPONSE_INVALID'
}

# El retry llama nuevamente a G3 usando el snapshot persistido; request_id y trace_id deben ser idénticos.
$retry = Invoke-JsonRequest -Method POST -Uri "$g8Base/api/integrations/g3/installations/$integrationId/retry" -Headers $operatorHeaders
if ($retry.requestId -ne $installation.requestId -or $retry.traceId -ne $installation.traceId) {
  throw 'G3_RETRY_CHANGED_CORRELATION'
}
$workOrderId = [string]$retry.idOtG3
if ([string]::IsNullOrWhiteSpace($workOrderId)) { $workOrderId = [string]$installation.idOtG3 }
$numericWorkOrderId = 0
if (-not [int]::TryParse($workOrderId, [ref]$numericWorkOrderId) -or $numericWorkOrderId -lt 1) {
  throw 'G3_NUMERIC_WORK_ORDER_ID_REQUIRED'
}
$workOrder = Invoke-JsonRequest -Method GET -Uri "$g3Base/api/integraciones/ordenes/$numericWorkOrderId" -Headers $g3OutboundHeaders

# Sin series de equipo: este smoke valida G3->G8 y evita disparar un POST G1 como efecto cascada.
$closurePayload = [ordered]@{
  id_ot = $numericWorkOrderId
  request_id = $installation.requestId
  trace_id = $installation.traceId
  id_empresa = $companyId
  id_prospecto = $prospectId
  id_contrato = $contractId
  id_plan = [int]$installation.idPlan
  equipos_instalados = @()
  equipos_retirados = @()
}
$closure = Invoke-JsonRequest -Method POST -Uri "$g8Base/api/integraciones/fsm/ordenes/$numericWorkOrderId/cierre" -Headers $g3InboundHeaders -Body $closurePayload
$reconciliation = Invoke-JsonRequest -Method POST -Uri "$g8Base/api/integrations/g3/installations/$integrationId/reconcile" -Headers $operatorHeaders
if ($reconciliation.available -ne $true) {
  throw 'G3_COMPLETED_CLOSURE_NOT_AVAILABLE_FOR_RECONCILIATION'
}

[pscustomobject]@{
  status = 'PASS'
  company_id = $companyId
  g2_invoice_list = $null -ne $invoiceList
  g2_invoice_detail_id = $invoiceDetail.idFactura
  g2_payment_id = $paymentId
  g2_payment_duplicate = $payment.duplicate
  g2_receipt_state = $receipt.comprobante_estado
  g2_wifi_request_id = $wifi.request_id
  g2_wifi_duplicate = $wifi.duplicate
  g3_integration_id = $integrationId
  g3_request_id = $installation.requestId
  g3_retry_same_request = $retry.requestId -eq $installation.requestId
  g3_work_order_id = $numericWorkOrderId
  g3_get_state = $workOrder.estado
  g3_closure_duplicate = $closure.duplicate
  g3_reconciliation_available = $reconciliation.available
  g3_reconciliation_duplicate = $reconciliation.result.duplicate
  g1_external_post_intentionally_avoided = $true
} | ConvertTo-Json -Depth 4
