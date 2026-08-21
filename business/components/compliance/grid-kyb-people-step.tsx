"use client"

import { useRef, useState } from "react"
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import {
  GRID_KYB_DOCUMENT_CATEGORIES,
  GRID_KYB_OWNER_ROLES,
  gridDocumentIdFromResource,
  gridKybIdTypeOptionsForPerson,
  gridKybOwnerResourceMatches,
  resolveGridKybOwnerIdType,
  gridKybOwnerCountriesFromNationality,
  type GridKybErrorPointer,
} from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import { GRID_KYB_WIZARD_COPY } from "@/lib/copy/business-ui-copy"
import { ensureBusinessOperationalAddressCountryRegistered } from "@/lib/address/register-lib-address-countries"
import { resolveCountryIso2 } from "@/lib/countries"
import {
  getOperationalAddressFormConfig,
  sanitizeSubdivisionForCountry,
} from "@easner/shared/postal-address-form"
import { cn } from "@/lib/utils"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { KybDocumentPacket, KybPersonPacket } from "@/lib/grid/kyb-packet-types"
import { GridKybEnumSelect } from "./grid-kyb-enum-select"
import { BusinessAddressFields } from "@/components/settings/business-address-fields"
import { GridKybCountrySelect } from "./grid-kyb-country-select"
import { GridKybDocumentUpload, type GridKybDocumentUploadHandle } from "./grid-kyb-document-upload"
import { Checkbox } from "@/components/ui/checkbox"

type Props = {
  people: KybPersonPacket[]
  documents: KybDocumentPacket[]
  errors: GridKybErrorPointer[]
  disabled?: boolean
  onReload: () => Promise<void>
  onDocumentAdded: (document: KybDocumentPacket) => void
  onPersonSaved: (person: KybPersonPacket) => void
  onRemoveDocument: (id: string) => Promise<void>
}

const emptyPerson = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
  nationality: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  addressCountry: "",
  ownershipPercentage: "",
  roles: [] as string[],
  idType: "",
  identifier: "",
  countryOfIssuance: "",
}

export function GridKybPeopleStep({
  people,
  documents,
  errors,
  disabled,
  onReload,
  onDocumentAdded,
  onPersonSaved,
  onRemoveDocument,
}: Props) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const [formSession, setFormSession] = useState(0)
  const [form, setForm] = useState(emptyPerson)
  const [saving, setSaving] = useState(false)
  const [idUploading, setIdUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const idUploadRef = useRef<GridKybDocumentUploadHandle>(null)

  function patchForm(
    patch: Partial<typeof emptyPerson> | ((prev: typeof emptyPerson) => Partial<typeof emptyPerson>),
  ) {
    setForm((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }
      const idType = resolveGridKybOwnerIdType(next)
      if (idType && idType !== next.idType) next.idType = idType
      return next
    })
  }

  function applyNationality(nationality: string) {
    const countries = gridKybOwnerCountriesFromNationality(nationality)
    patchForm(countries)
    const code = countries.addressCountry
    if (!/^[A-Z]{2}$/.test(code)) return
    void ensureBusinessOperationalAddressCountryRegistered(code).then(() => {
      patchForm((prev) => {
        if (prev.addressCountry !== code) return {}
        try {
          const nextConfig = getOperationalAddressFormConfig(code)
          const next: Partial<typeof emptyPerson> = {}
          if (!nextConfig.subdivision.visible || nextConfig.subdivision.mode === "dropdown") {
            next.state = sanitizeSubdivisionForCountry(code, prev.state)
          }
          if (!nextConfig.postal.visible) {
            next.postalCode = ""
          }
          return next
        } catch {
          return {}
        }
      })
    })
  }

  function openNew() {
    setError(null)
    setForm(emptyPerson)
    setFormSession((n) => n + 1)
    setEditingId("new")
  }

  function openExisting(person: KybPersonPacket) {
    const nationality = resolveCountryIso2(person.nationality)
    const addressCountry = resolveCountryIso2(person.addressCountry)
    const countryOfIssuance = resolveCountryIso2(person.countryOfIssuance)
    setForm({
      firstName: person.firstName,
      middleName: person.middleName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,
      birthDate: person.birthDate,
      nationality,
      addressLine1: person.addressLine1,
      addressLine2: person.addressLine2,
      city: person.city,
      state: person.state,
      postalCode: person.postalCode,
      addressCountry,
      ownershipPercentage:
        person.ownershipPercentage == null ? "" : String(person.ownershipPercentage),
      roles: person.roles,
      idType: resolveGridKybOwnerIdType({
        idType: person.idType,
        countryOfIssuance,
      }),
      identifier: person.identifier,
      countryOfIssuance,
    })
    setError(null)
    setFormSession((n) => n + 1)
    setEditingId(person.id)
  }

  function ownerPayload() {
    const ownership = String(form.ownershipPercentage).trim()
    const parsedOwnership = ownership === "" ? null : Number(ownership)
    return {
      ...form,
      nationality: resolveCountryIso2(form.nationality) || form.nationality,
      addressCountry: resolveCountryIso2(form.addressCountry) || form.addressCountry,
      countryOfIssuance: resolveCountryIso2(form.countryOfIssuance) || form.countryOfIssuance,
      idType: resolveGridKybOwnerIdType(form),
      ownershipPercentage:
        parsedOwnership != null && Number.isFinite(parsedOwnership) ? parsedOwnership : null,
    }
  }

  async function persistOwner() {
    const payload = ownerPayload()
    const res = await fetchWithSession("/api/grid/kyb/owners", {
      method: editingId && editingId !== "new" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId && editingId !== "new" ? { id: editingId, ...payload } : payload),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string; person?: KybPersonPacket }
    if (!res.ok || !json.person?.id) throw new Error(json.error || "Could not save owner")
    onPersonSaved(json.person)
    if (editingId === "new") setEditingId(json.person.id)
    return json.person
  }

  async function ensureOwnerId() {
    if (editingId && editingId !== "new") return editingId
    const person = await persistOwner()
    return person.id
  }

  async function removeOwner(person: KybPersonPacket) {
    if (disabled || removingId) return
    setRemovingId(person.id)
    setError(null)
    try {
      const res = await fetchWithSession(`/api/grid/kyb/owners?id=${encodeURIComponent(person.id)}`, {
        method: "DELETE",
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || "Could not remove owner")
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove owner")
    } finally {
      setRemovingId(null)
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const person = await persistOwner()
      if (idUploadRef.current?.hasPendingFile()) {
        const uploaded = await idUploadRef.current.submit(person.id)
        if (uploaded) onDocumentAdded(uploaded)
      }
      setEditingId(null)
      await onReload()
    } catch (err) {
      if (idUploadRef.current?.hasPendingFile()) return
      setError(err instanceof Error ? err.message : "Could not save owner")
    } finally {
      setSaving(false)
    }
  }

  const selected = editingId && editingId !== "new" ? people.find((row) => row.id === editingId) : null
  const identityDocsFor = (personId: string | null | undefined) =>
    documents.filter((doc) => doc.category === "identity" && doc.personId && doc.personId === personId)

  function pointerTargetsPerson(
    error: GridKybErrorPointer,
    person: Pick<KybPersonPacket, "id" | "gridBeneficialOwnerId">,
  ) {
    const docs = identityDocsFor(person.id)
    const pointerDocId = gridDocumentIdFromResource(error.gridDocumentId || error.resourceId)
    if (error.gridDocumentId || error.resourceId?.startsWith("Document:")) {
      if (docs.some((doc) => gridDocumentIdFromResource(doc.gridDocumentId) === pointerDocId)) return true
      const ownedBySomeone = documents.some(
        (doc) => gridDocumentIdFromResource(doc.gridDocumentId) === pointerDocId && doc.personId,
      )
      if (!ownedBySomeone && error.documentCategory === "identity") return true
      return false
    }
    if (error.resourceId) {
      if (gridKybOwnerResourceMatches(person, error.resourceId)) return true
      return !people.some((row) => gridKybOwnerResourceMatches(row, error.resourceId))
    }
    if (error.documentCategory === "identity") return true
    return true
  }

  function peopleErrorsFor(person: Pick<KybPersonPacket, "id" | "gridBeneficialOwnerId"> | null) {
    return errors.filter((error) => {
      if (error.section !== "people") return false
      if (!person) return true
      return pointerTargetsPerson(error, person)
    })
  }

  function fieldError(field: string) {
    return peopleErrorsFor(selected).find(
      (error) => error.field === field || error.field?.endsWith(`.${field.split(".").pop()}`),
    )
  }

  const selectedErrors = peopleErrorsFor(selected)
  const nationalityError = fieldError("nationality")
  const emailError = fieldError("email")
  const phoneError = fieldError("phone") || fieldError("phoneNumber")
  const birthDateError = fieldError("birthDate") || fieldError("dateOfBirth")
  const addressError = selectedErrors.find(
    (error) =>
      error.field?.toLowerCase().includes("address") ||
      error.field?.endsWith("country") ||
      error.field?.endsWith("line1") ||
      error.field?.endsWith("city") ||
      error.field?.endsWith("state") ||
      error.field?.endsWith("postalCode"),
  )
  const identityError =
    selectedErrors.find((error) => error.documentCategory === "identity") ||
    (selected
      ? errors.find(
          (error) =>
            error.section === "people" &&
            error.documentCategory === "identity" &&
            pointerTargetsPerson(error, selected),
        )
      : errors.find((error) => error.section === "people" && error.documentCategory === "identity"))
  const idTypeError = fieldError("idType") || fieldError("identifier") || fieldError("countryOfIssuance")
  const identityRejected = Boolean(
    identityError?.gridDocumentId || identityError?.resourceId?.startsWith("Document:"),
  )

  const identityUpload = (
    <div id="owner-id-upload">
      <GridKybDocumentUpload
        key={formSession}
        ref={idUploadRef}
        title="Owner ID document"
        category="identity"
        acceptedDocumentTypes={
          identityError?.acceptedDocumentTypes ?? GRID_KYB_DOCUMENT_CATEGORIES.identity.acceptedDocumentTypes
        }
        extraFields={{
          personId: selected?.id ?? (editingId && editingId !== "new" ? editingId : undefined),
          issuingAuthority: true,
          documentNumber: true,
        }}
        existingDocuments={identityDocsFor(selected?.id ?? (editingId !== "new" ? editingId : undefined))}
        onRemoveExisting={onRemoveDocument}
        disabled={disabled}
        hideSubmit
        rejected={identityRejected}
        rejectionReason={identityError?.reason}
        fileHint="PDF, JPEG, PNG, or HEIC. Maximum 10 MB. Photograph the physical ID – not a screenshot or a crop from Photos."
        resolvePersonId={ensureOwnerId}
        onBusyChange={setIdUploading}
        onUploaded={async (doc) => {
          if (doc) onDocumentAdded(doc)
          await onReload()
        }}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{GRID_KYB_WIZARD_COPY.peopleTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{GRID_KYB_WIZARD_COPY.peopleSubtitle}</p>
      </div>

      {!editingId ? (
        <div className="space-y-2">
          {people.length === 0 && errors.some((error) => error.section === "people") ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {errors.find((error) => error.section === "people")?.reason || "Add a business owner."}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="button"
            disabled={disabled}
            onClick={openNew}
            className="flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <span className="flex size-8 items-center justify-center rounded-full border">
                <Plus className="size-4" />
              </span>
              Add new business owner
            </span>
          </button>
          {people.map((person) => {
            const personErrors = peopleErrorsFor(person)
            const needsAttention = personErrors.length > 0
            const needsId = personErrors.some((error) => error.documentCategory === "identity")
            const name = `${person.firstName} ${person.lastName}`.trim() || "Owner"
            const docs = identityDocsFor(person.id)
            const subtitle = needsAttention
              ? personErrors[0]?.reason || (needsId ? "Needs ID document" : "Needs attention")
              : docs.length
                ? docs.map((doc) => doc.fileName).join(", ")
                : person.roles.join(", ") || "Owner"
            return (
              <div
                key={person.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3",
                  needsAttention && "border-destructive",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{name}</span>
                  <span className={cn("text-xs", needsAttention ? "text-destructive" : "text-muted-foreground")}>
                    {subtitle}
                  </span>
                </span>
                {needsAttention ? <AlertTriangle className="size-4 shrink-0 text-destructive" /> : null}
                <span className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0"
                    aria-label={`Edit ${name}`}
                    disabled={disabled || Boolean(removingId)}
                    onClick={() => openExisting(person)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0"
                    aria-label={`Remove ${name}`}
                    disabled={disabled || Boolean(removingId)}
                    onClick={() => void removeOwner(person)}
                  >
                    {removingId === person.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.firstName} onChange={(e) => patchForm({ firstName: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Middle name (optional)</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.middleName} onChange={(e) => patchForm({ middleName: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.lastName} onChange={(e) => patchForm({ lastName: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                className={cn(SETTINGS_INPUT_CLASS, emailError && "border-destructive")}
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                disabled={disabled}
              />
              {emailError ? <p className="text-sm text-destructive">{emailError.reason}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Phone (optional)</Label>
              <Input
                type="tel"
                className={cn(SETTINGS_INPUT_CLASS, phoneError && "border-destructive")}
                value={form.phone}
                onChange={(e) => patchForm({ phone: e.target.value })}
                disabled={disabled}
              />
              {phoneError ? <p className="text-sm text-destructive">{phoneError.reason}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Date of birth</Label>
              <Input
                type="date"
                className={cn(SETTINGS_INPUT_CLASS, birthDateError && "border-destructive")}
                value={form.birthDate}
                onChange={(e) => patchForm({ birthDate: e.target.value })}
                disabled={disabled}
              />
              {birthDateError ? <p className="text-sm text-destructive">{birthDateError.reason}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <GridKybCountrySelect
                value={form.nationality}
                onChange={applyNationality}
                placeholder="Select nationality"
                catalog="all"
                disabled={disabled}
                invalid={Boolean(nationalityError)}
              />
              {nationalityError ? <p className="text-sm text-destructive">{nationalityError.reason}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Ownership %</Label>
              <Input
                className={SETTINGS_INPUT_CLASS}
                inputMode="decimal"
                value={form.ownershipPercentage}
                onChange={(e) => patchForm({ ownershipPercentage: e.target.value })}
                placeholder="e.g. 25"
                disabled={disabled}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[minmax(0,1.15fr)_max-content_minmax(0,1.15fr)]">
            <div className="min-w-0 space-y-2">
              <Label>Tax ID country</Label>
              <GridKybCountrySelect
                value={form.countryOfIssuance}
                onChange={(countryOfIssuance) => patchForm({ countryOfIssuance })}
                placeholder="Select country"
                catalog="all"
                disabled={disabled}
                invalid={Boolean(idTypeError)}
              />
            </div>
            <div className="space-y-2 min-[720px]:w-[13.75rem]">
              <Label>Tax ID type</Label>
              <GridKybEnumSelect
                value={form.idType}
                onChange={(idType) => patchForm({ idType })}
                options={gridKybIdTypeOptionsForPerson(form)}
                placeholder="Tax ID type"
                disabled={disabled}
                invalid={Boolean(idTypeError)}
                nowrap
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label>Tax ID number</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.identifier} onChange={(e) => patchForm({ identifier: e.target.value })} disabled={disabled} />
            </div>
          </div>
          {idTypeError ? <p className="text-sm text-destructive">{idTypeError.reason}</p> : null}
          <BusinessAddressFields
            catalog="all"
            idPrefix="owner-"
            invalid={Boolean(addressError)}
            countryCode={form.addressCountry}
            values={{
              line1: form.addressLine1,
              city: form.city,
              state: form.state,
              postalCode: form.postalCode,
            }}
            onChange={(patch) =>
              patchForm((prev) => ({
                addressLine1: patch.line1 ?? prev.addressLine1,
                city: patch.city ?? prev.city,
                state: patch.state ?? prev.state,
                postalCode: patch.postalCode ?? prev.postalCode,
              }))
            }
            onCountryCodeChange={(addressCountry) => patchForm({ addressCountry })}
            disabled={disabled}
            editing={!disabled}
          />
          {addressError ? <p className="text-sm text-destructive">{addressError.reason}</p> : null}
          <div className="space-y-2">
            <Label>Roles</Label>
            <p className="text-sm text-muted-foreground">{GRID_KYB_WIZARD_COPY.peopleRolesHint}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GRID_KYB_OWNER_ROLES.map((role) => (
                <label key={role.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.roles.includes(role.value)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      patchForm((prev) => ({
                        roles: checked
                          ? [...prev.roles, role.value]
                          : prev.roles.filter((value) => value !== role.value),
                      }))
                    }
                  />
                  {role.label}
                </label>
              ))}
            </div>
          </div>
          {identityUpload}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={disabled || saving || idUploading} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save owner
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
              Back to list
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
