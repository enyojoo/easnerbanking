const LOGO_URL =
  "https://kixymrjsupzkxokujmwu.supabase.co/storage/v1/object/public/brand/Easner%20Businessblk.svg"
const BUSINESS_URL = "https://www.easner.com/business"

/** Same mark as invoice and payment-link checkout, for the website embed. */
export function createPoweredByEasner(): HTMLElement {
  const row = document.createElement("div")
  row.setAttribute("data-easner-powered-by", "")
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "6px",
    width: "100%",
    maxWidth: "100%",
    minWidth: "0",
    boxSizing: "border-box",
    margin: "16px 0 0",
    padding: "16px 0 0",
    borderTop: "1px solid #D6D9D6",
    fontSize: "12px",
    lineHeight: "1",
    color: "#6F756F",
  })

  const label = document.createElement("span")
  label.textContent = "Powered by"

  const link = document.createElement("a")
  link.href = BUSINESS_URL
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  Object.assign(link.style, {
    display: "inline-flex",
    alignItems: "center",
    lineHeight: "0",
  })

  const logo = document.createElement("img")
  logo.src = LOGO_URL
  logo.alt = "Easner Business"
  Object.assign(logo.style, {
    height: "20px",
    width: "auto",
    display: "block",
  })

  link.appendChild(logo)
  row.append(label, link)
  return row
}
