"use client"

import { useState } from "react"
import { AlertTriangle, Plus } from "lucide-react"
import { GRID_KYB_DOCUMENT_CATEGORIES, GRID_KYB_ID_TYPES, GRID_KYB_OWNER_ROLES, type GridKybErrorPointer } from "@easner/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SETTINGS_INPUT_CLASS } from "@/lib/settings-control-surface"
import { GRID_KYB_WIZARD_COPY } from "@/lib/copy/business-ui-copy"
import type { KybPersonPacket } from "@/lib/grid/kyb-packet-types"
import { GridKybEnumSelect } from "./grid-kyb-enum-select"
import { GridKybDocumentUpload } from "./grid-kyb-document-upload"
import { Checkbox } from "@/components/ui/checkbox"

type Props = {
  people: KybPersonPacket[]
  errors: GridKybErrorPointer[]
  disabled?: boolean
  onReload: () => Promise<void>
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
  ownershipPercentage: 0,
  roles: [] as string[],
  idType: "",
  identifier: "",
  countryOfIssuance: "",
}

export function GridKybPeopleStep({ people, errors, disabled, onReload }: Props) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const [form, setForm] = useState(emptyPerson)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setForm(emptyPerson)
    setEditingId("new")
  }

  function openExisting(person: KybPersonPacket) {
    setForm({
      firstName: person.firstName,
      middleName: person.middleName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,
      birthDate: person.birthDate,
      nationality: person.nationality,
      addressLine1: person.addressLine1,
      addressLine2: person.addressLine2,
      city: person.city,
      state: person.state,
      postalCode: person.postalCode,
      addressCountry: person.addressCountry,
      ownershipPercentage: person.ownershipPercentage ?? 0,
      roles: person.roles,
      idType: person.idType,
      identifier: person.identifier,
      countryOfIssuance: person.countryOfIssuance,
    })
    setEditingId(person.id)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/grid/kyb/owners", {
        method: editingId && editingId !== "new" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId && editingId !== "new" ? { id: editingId, ...form } : form),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || "Could not save owner")
      setEditingId(null)
      await onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save owner")
    } finally {
      setSaving(false)
    }
  }

  const selected = editingId && editingId !== "new" ? people.find((row) => row.id === editingId) : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{GRID_KYB_WIZARD_COPY.peopleTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{GRID_KYB_WIZARD_COPY.peopleSubtitle}</p>
      </div>

      {!editingId ? (
        <div className="space-y-2">
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
            const needsId = errors.some(
              (error) =>
                error.section === "people" &&
                (error.resourceId === person.gridBeneficialOwnerId || error.documentCategory === "identity"),
            )
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => openExisting(person)}
                className="flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {person.firstName} {person.lastName}
                  </span>
                  {needsId ? (
                    <span className="text-xs text-muted-foreground">Needs ID document</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{person.roles.join(", ") || "Owner"}</span>
                  )}
                </span>
                {needsId ? <AlertTriangle className="size-4 text-amber-600" /> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Middle name (optional)</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Date of birth</Label>
              <Input type="date" className={SETTINGS_INPUT_CLASS} value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value.toUpperCase() })} maxLength={2} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Ownership %</Label>
              <Input type="number" className={SETTINGS_INPUT_CLASS} value={form.ownershipPercentage} onChange={(e) => setForm({ ...form, ownershipPercentage: Number(e.target.value) })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>ID type</Label>
              <GridKybEnumSelect value={form.idType} onChange={(idType) => setForm({ ...form, idType })} options={GRID_KYB_ID_TYPES} placeholder="Select ID type" disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>ID number</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Postal code</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input className={SETTINGS_INPUT_CLASS} value={form.addressCountry} onChange={(e) => setForm({ ...form, addressCountry: e.target.value.toUpperCase() })} maxLength={2} disabled={disabled} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {GRID_KYB_OWNER_ROLES.map((role) => (
                <label key={role.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.roles.includes(role.value)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      setForm({
                        ...form,
                        roles: checked
                          ? [...form.roles, role.value]
                          : form.roles.filter((value) => value !== role.value),
                      })
                    }
                  />
                  {role.label}
                </label>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={disabled || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save owner"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
              Back to list
            </Button>
          </div>
          {selected ? (
            <GridKybDocumentUpload
              title="Upload owner ID document"
              category="identity"
              acceptedDocumentTypes={
                errors.find((error) => error.resourceId === selected.gridBeneficialOwnerId)?.acceptedDocumentTypes ??
                GRID_KYB_DOCUMENT_CATEGORIES.identity.acceptedDocumentTypes
              }
              extraFields={{ personId: selected.id, issuingAuthority: true, documentNumber: true }}
              disabled={disabled}
              onUploaded={onReload}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
