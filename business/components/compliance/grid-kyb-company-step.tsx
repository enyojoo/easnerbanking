"use client"

import {
  GRID_KYB_BUSINESS_TYPES,
  GRID_KYB_ENTITY_TYPES,
  GRID_KYB_MONTHLY_COUNT,
  GRID_KYB_MONTHLY_VOLUME,
  GRID_KYB_PURPOSE_OF_ACCOUNT,
  GRID_KYB_SOURCE_OF_FUNDS,
  type GridKybCompanyDraft,
  type GridKybErrorPointer,
} from "@easner/shared"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import { BusinessAddressFields } from "@/components/settings/business-address-fields"
import { GRID_KYB_WIZARD_COPY } from "@/lib/copy/business-ui-copy"
import { GridKybEnumSelect } from "./grid-kyb-enum-select"
import { GridKybCountryMultiSelect } from "./grid-kyb-country-multi-select"
import { cn } from "@/lib/utils"

type Props = {
  company: GridKybCompanyDraft
  onChange: (patch: Partial<GridKybCompanyDraft>) => void
  errors: GridKybErrorPointer[]
  disabled?: boolean
}

function fieldError(errors: GridKybErrorPointer[], field: string) {
  return errors.find((error) => error.field === field || error.field?.endsWith(`.${field.split(".").pop()}`))
}

export function GridKybCompanyStep({ company, onChange, errors, disabled }: Props) {
  const purposeError = fieldError(errors, "businessInfo.purposeOfAccount")
  const sourceError = fieldError(errors, "businessInfo.sourceOfFunds")
  const typeError = fieldError(errors, "businessInfo.businessType")
  const countError = fieldError(errors, "businessInfo.expectedMonthlyTransactionCount")
  const volumeError = fieldError(errors, "businessInfo.expectedMonthlyTransactionVolume")
  const countriesError = fieldError(errors, "businessInfo.countriesOfOperation")
  const jurisdictionsError = fieldError(errors, "businessInfo.expectedRecipientJurisdictions")

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{GRID_KYB_WIZARD_COPY.companyTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{GRID_KYB_WIZARD_COPY.companySubtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="kyb-legal-name">Legal business name</Label>
          <Input
            id="kyb-legal-name"
            className={SETTINGS_INPUT_CLASS}
            value={company.legalName}
            onChange={(event) => onChange({ legalName: event.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="kyb-dba">Doing business as (optional)</Label>
          <Input
            id="kyb-dba"
            className={SETTINGS_INPUT_CLASS}
            value={company.doingBusinessAs}
            onChange={(event) => onChange({ doingBusinessAs: event.target.value })}
            placeholder="Optional trade name"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kyb-reg">Registration number</Label>
          <Input
            id="kyb-reg"
            className={SETTINGS_INPUT_CLASS}
            value={company.registrationNumber}
            onChange={(event) => onChange({ registrationNumber: event.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kyb-tax">Tax ID</Label>
          <Input
            id="kyb-tax"
            className={SETTINGS_INPUT_CLASS}
            value={company.taxId}
            onChange={(event) => onChange({ taxId: event.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kyb-incorporated">Date of incorporation</Label>
          <Input
            id="kyb-incorporated"
            type="date"
            className={SETTINGS_INPUT_CLASS}
            value={company.incorporatedOn}
            onChange={(event) => onChange({ incorporatedOn: event.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Entity type</Label>
          <p className="text-xs text-muted-foreground">
            Choose the closest match. Search Ltd, GmbH, SARL, or your local form.
          </p>
          <GridKybEnumSelect
            value={company.entityType}
            onChange={(entityType) => onChange({ entityType })}
            options={GRID_KYB_ENTITY_TYPES}
            placeholder="Select entity type"
            disabled={disabled}
          />
        </div>
      </div>

      <BusinessAddressFields
        countryCode={company.addressCountry || company.country}
        values={{
          line1: company.addressLine1,
          city: company.city,
          state: company.state,
          postalCode: company.postalCode,
        }}
        onChange={(patch) =>
          onChange({
            addressLine1: patch.line1 ?? company.addressLine1,
            city: patch.city ?? company.city,
            state: patch.state ?? company.state,
            postalCode: patch.postalCode ?? company.postalCode,
          })
        }
        onCountryCodeChange={(code) => onChange({ addressCountry: code, country: company.country || code })}
        disabled={disabled}
        editing={!disabled}
      />
      <div className="space-y-2">
        <Label htmlFor="kyb-address-2">Address line 2 (optional)</Label>
        <Input
          id="kyb-address-2"
          className={SETTINGS_INPUT_CLASS}
          value={company.addressLine2}
          onChange={(event) => onChange({ addressLine2: event.target.value })}
          placeholder="Suite, unit, etc."
          disabled={disabled}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Business type</Label>
          <GridKybEnumSelect
            value={company.businessType}
            onChange={(businessType) => onChange({ businessType })}
            options={GRID_KYB_BUSINESS_TYPES}
            placeholder="Select business type"
            disabled={disabled}
            invalid={Boolean(typeError)}
          />
          {typeError ? <p className="text-sm text-destructive">{typeError.reason}</p> : null}
        </div>
        <div className="space-y-2">
          <Label>Purpose of account</Label>
          <GridKybEnumSelect
            value={company.purposeOfAccount}
            onChange={(purposeOfAccount) => onChange({ purposeOfAccount })}
            options={GRID_KYB_PURPOSE_OF_ACCOUNT}
            placeholder="Select purpose of account"
            disabled={disabled}
            invalid={Boolean(purposeError)}
          />
          {purposeError ? <p className="text-sm text-destructive">{purposeError.reason}</p> : null}
        </div>
        {company.purposeOfAccount === "OTHER" ? (
          <div className="space-y-2">
            <Label htmlFor="kyb-purpose-other">Describe the purpose</Label>
            <Input
              id="kyb-purpose-other"
              className={SETTINGS_INPUT_CLASS}
              value={company.purposeOfAccountOtherDescription}
              onChange={(event) => onChange({ purposeOfAccountOtherDescription: event.target.value })}
              disabled={disabled}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Source of funds</Label>
          <GridKybEnumSelect
            value={company.sourceOfFundsId}
            onChange={(sourceOfFundsId) => onChange({ sourceOfFundsId })}
            options={GRID_KYB_SOURCE_OF_FUNDS.map((row) => ({ value: row.id, label: row.label }))}
            placeholder="Select source of funds"
            disabled={disabled}
            invalid={Boolean(sourceError)}
          />
          {sourceError ? <p className="text-sm text-destructive">{sourceError.reason}</p> : null}
        </div>
        {company.sourceOfFundsId === "other" ? (
          <div className="space-y-2">
            <Label htmlFor="kyb-sof-other">Describe the source of funds</Label>
            <Input
              id="kyb-sof-other"
              className={cn(SETTINGS_INPUT_CLASS)}
              value={company.sourceOfFundsOtherDescription}
              onChange={(event) => onChange({ sourceOfFundsOtherDescription: event.target.value })}
              disabled={disabled}
            />
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Expected monthly transactions</Label>
            <GridKybEnumSelect
              value={company.expectedMonthlyTransactionCount}
              onChange={(expectedMonthlyTransactionCount) => onChange({ expectedMonthlyTransactionCount })}
              options={GRID_KYB_MONTHLY_COUNT}
              placeholder="Select transaction count"
              disabled={disabled}
              invalid={Boolean(countError)}
            />
            {countError ? <p className="text-sm text-destructive">{countError.reason}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Expected monthly volume</Label>
            <GridKybEnumSelect
              value={company.expectedMonthlyTransactionVolume}
              onChange={(expectedMonthlyTransactionVolume) => onChange({ expectedMonthlyTransactionVolume })}
              options={GRID_KYB_MONTHLY_VOLUME}
              placeholder="Select transaction volume"
              disabled={disabled}
              invalid={Boolean(volumeError)}
            />
            {volumeError ? <p className="text-sm text-destructive">{volumeError.reason}</p> : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Countries of operation</Label>
          <GridKybCountryMultiSelect
            value={company.countriesOfOperation}
            onChange={(countriesOfOperation) => onChange({ countriesOfOperation })}
            placeholder="Add country"
            disabled={disabled}
            invalid={Boolean(countriesError)}
          />
          {countriesError ? <p className="text-sm text-destructive">{countriesError.reason}</p> : null}
        </div>
        <div className="space-y-2">
          <Label>Expected recipient jurisdictions</Label>
          <GridKybCountryMultiSelect
            value={company.expectedRecipientJurisdictions}
            onChange={(expectedRecipientJurisdictions) => onChange({ expectedRecipientJurisdictions })}
            placeholder="Add jurisdiction"
            disabled={disabled}
            invalid={Boolean(jurisdictionsError)}
          />
          {jurisdictionsError ? <p className="text-sm text-destructive">{jurisdictionsError.reason}</p> : null}
        </div>
      </div>
    </div>
  )
}
