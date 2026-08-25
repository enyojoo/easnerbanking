"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, ArchiveRestore, Loader2, MoreHorizontal, Package, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CollectionsPageHeader } from "@/components/collections/collections-page-header"
import { CreateProductDialog } from "@/components/products/create-product-dialog"
import { EditProductDialog } from "@/components/products/edit-product-dialog"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { formatCurrency } from "@/lib/utils"
import type { Product, ProductPrice } from "@/lib/products/types"

/** "$49.00/mo", "€450.00/yr", or "$25.00" for one-time prices. */
export function formatProductPrice(price: ProductPrice): string {
  const amount = formatCurrency(price.unitAmountCents / 100, price.currency)
  if (price.mode !== "subscription") return amount
  return `${amount}/${price.billingInterval === "year" ? "yr" : "mo"}`
}

/** Prices a customer can currently be charged (archived ones fall back for display). */
function displayPrices(product: Product): ProductPrice[] {
  const active = product.prices.filter((price) => !price.archivedAt)
  return active.length > 0 ? active : product.prices
}

function productTypeLabel(product: Product): string {
  const modes = new Set(displayPrices(product).map((price) => price.mode))
  if (modes.size === 0) return "—"
  if (modes.size > 1) return "Mixed"
  return modes.has("subscription") ? "Recurring" : "One-time"
}

function pricesSummary(product: Product): string {
  const prices = displayPrices(product)
  if (prices.length === 0) return "No prices"
  const shown = prices.slice(0, 3).map(formatProductPrice)
  const extra = prices.length - 3
  return extra > 0 ? `${shown.join(" · ")} +${extra} more` : shown.join(" · ")
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const refetch = useCallback(async () => {
    const res = await fetchWithSession("/api/products")
    const body = (await res.json().catch(() => ({}))) as { products?: Product[]; error?: string }
    if (!res.ok) {
      toast.error(body.error || "Could not load products.")
      return
    }
    setProducts(body.products ?? [])
  }, [])

  useEffect(() => {
    void refetch().finally(() => setLoading(false))
  }, [refetch])

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      const res = await fetchWithSession(`/api/products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || (archived ? "Could not archive product." : "Could not restore product."))
        return
      }
      toast.success(archived ? "Product archived." : "Product restored.")
      void refetch()
    },
    [refetch],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((product) => product.name.toLowerCase().includes(q))
  }, [products, search])

  const createButton = (
    <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New product
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <CollectionsPageHeader
        title="Products"
        intro="Define what you sell once, then reuse it across payment links, checkout, and invoices."
        actions={createButton}
      />

      {products.length > 0 ? (
        <div className="flex justify-end">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            className="w-full max-w-[220px] sm:max-w-xs"
          />
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading products" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No products yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create your first product with one or more prices – it becomes available everywhere
                you collect payments.
              </p>
              {createButton}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No products match your search.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed">
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Product</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Prices</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr
                      key={product.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() => setEditProduct(product)}
                    >
                      <td className="min-w-0 p-4 align-middle">
                        <span className="block truncate text-sm font-medium">{product.name}</span>
                        {product.description ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {product.description}
                          </span>
                        ) : null}
                      </td>
                      <td className="min-w-0 p-4 align-middle">
                        <span className="block truncate text-sm tabular-nums text-muted-foreground">
                          {pricesSummary(product)}
                        </span>
                      </td>
                      <td className="p-4 align-middle text-sm text-muted-foreground">
                        {productTypeLabel(product)}
                      </td>
                      <td className="p-4 align-middle">
                        {product.archivedAt ? (
                          <Badge variant="outline">Archived</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </td>
                      <td className="p-4 align-middle" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label="Product actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditProduct(product)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            {product.archivedAt ? (
                              <DropdownMenuItem onClick={() => void setArchived(product.id, false)}>
                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void setArchived(product.id, true)}
                              >
                                <Archive className="mr-2 h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateProductDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refetch()}
      />

      <EditProductDialog
        product={editProduct}
        onOpenChange={(open) => {
          if (!open) setEditProduct(null)
        }}
        onSaved={() => void refetch()}
      />
    </div>
  )
}
