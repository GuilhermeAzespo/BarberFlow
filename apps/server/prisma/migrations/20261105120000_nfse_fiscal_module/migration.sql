-- AlterTable Subscription: Add-on de NFS-e
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "nfseAddonActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "nfseAddonExpiresAt" TIMESTAMP(3);

-- AlterTable SystemSetting: Preço do Add-on de NFS-e
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "nfseAddonPriceCents" INTEGER NOT NULL DEFAULT 2990;

-- CreateTable FiscalConfig
CREATE TABLE IF NOT EXISTS "FiscalConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "providerMode" TEXT NOT NULL DEFAULT 'ADN_NACIONAL',
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "inscricaoMunicipal" TEXT,
    "codigoMunicipioIbge" TEXT DEFAULT '3550308',
    "uf" TEXT DEFAULT 'SP',
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "complemento" TEXT,
    "regimeTributario" TEXT NOT NULL DEFAULT 'MEI',
    "optanteSimples" INTEGER NOT NULL DEFAULT 2,
    "itemListaServico" TEXT NOT NULL DEFAULT '06.01',
    "codigoTributacaoNacional" TEXT NOT NULL DEFAULT '060101',
    "codigoTributacaoMunicipal" TEXT,
    "cnae" TEXT DEFAULT '9602501',
    "aliquotaIss" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "retencaoIss" BOOLEAN NOT NULL DEFAULT false,
    "serieDps" TEXT NOT NULL DEFAULT '1',
    "proximoNumeroDps" INTEGER NOT NULL DEFAULT 1,
    "salaoParceiroEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoEmitOnComplete" BOOLEAN NOT NULL DEFAULT false,
    "autoSendWhatsApp" BOOLEAN NOT NULL DEFAULT true,
    "certPfxData" BYTEA,
    "certPassword" TEXT,
    "certSubject" TEXT,
    "certIssuer" TEXT,
    "certValidTo" TIMESTAMP(3),
    "certUploadedAt" TIMESTAMP(3),
    "externalApiUrl" TEXT,
    "externalApiToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalConfig_tenantId_key" ON "FiscalConfig"("tenantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalConfig_tenantId_fkey'
  ) THEN
    ALTER TABLE "FiscalConfig"
      ADD CONSTRAINT "FiscalConfig_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable NfseInvoice
CREATE TABLE IF NOT EXISTS "NfseInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "transactionId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "numeroDps" INTEGER NOT NULL,
    "serieDps" TEXT NOT NULL DEFAULT '1',
    "numeroNfse" TEXT,
    "chaveAcesso" TEXT,
    "codigoVerificacao" TEXT,
    "tomadorNome" TEXT NOT NULL,
    "tomadorDocumento" TEXT,
    "tomadorEmail" TEXT,
    "tomadorTelefone" TEXT,
    "discriminacao" TEXT NOT NULL,
    "valorBrutoCents" INTEGER NOT NULL,
    "valorDeducaoParceiroCents" INTEGER NOT NULL DEFAULT 0,
    "baseCalculoCents" INTEGER NOT NULL,
    "aliquotaIss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorIssCents" INTEGER NOT NULL DEFAULT 0,
    "valorLiquidoCents" INTEGER NOT NULL,
    "profissionalParceiroNome" TEXT,
    "profissionalParceiroDoc" TEXT,
    "xmlDps" TEXT,
    "xmlNfse" TEXT,
    "urlDanfse" TEXT,
    "errorMessage" TEXT,
    "whatsappSentAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NfseInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NfseInvoice_appointmentId_key" ON "NfseInvoice"("appointmentId");
CREATE INDEX IF NOT EXISTS "NfseInvoice_tenantId_issuedAt_idx" ON "NfseInvoice"("tenantId", "issuedAt");
CREATE INDEX IF NOT EXISTS "NfseInvoice_tenantId_status_idx" ON "NfseInvoice"("tenantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NfseInvoice_tenantId_fkey'
  ) THEN
    ALTER TABLE "NfseInvoice"
      ADD CONSTRAINT "NfseInvoice_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NfseInvoice_appointmentId_fkey'
  ) THEN
    ALTER TABLE "NfseInvoice"
      ADD CONSTRAINT "NfseInvoice_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
